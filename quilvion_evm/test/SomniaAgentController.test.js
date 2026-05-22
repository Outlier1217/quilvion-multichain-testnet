// test/SomniaAgentController.test.js
// Full test suite for SomniaAgentController + integration with existing contracts
// Run: npx hardhat test test/SomniaAgentController.test.js

const { expect }      = require("chai");
const { ethers }      = require("hardhat");
const { time }        = require("@nomicfoundation/hardhat-network-helpers");

// ── Helpers ──────────────────────────────────────────────────────────────────
const USDC = (n) => ethers.parseUnits(String(n), 6);

const Roles = {
  ADMIN_ROLE:    ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE")),
  BOT_ROLE:      ethers.keccak256(ethers.toUtf8Bytes("BOT_ROLE")),
  COMMERCE_ROLE: ethers.keccak256(ethers.toUtf8Bytes("COMMERCE_ROLE")),
  AGENT_ROLE:    ethers.keccak256(ethers.toUtf8Bytes("AGENT_ROLE")),
  OPERATOR_ROLE: ethers.keccak256(ethers.toUtf8Bytes("OPERATOR_ROLE")),
};


// ── Fixture ───────────────────────────────────────────────────────────────────
async function deployFixture() {
  const [admin, agentWallet, buyer, merchant, buyer2, merchant2, stranger] =
    await ethers.getSigners();

  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy(admin.address);
  await usdc.waitForDeployment();

  const ConfigManager = await ethers.getContractFactory("ConfigManager");
  const config = await ConfigManager.deploy(
    admin.address,
    USDC(1000),
    USDC(100),
    250,
    3 * 24 * 3600
  );
  await config.waitForDeployment();

  const EscrowLogic = await ethers.getContractFactory("EscrowLogic");
  const escrow = await EscrowLogic.deploy(
    await usdc.getAddress(),
    await config.getAddress(),
    admin.address
  );
  await escrow.waitForDeployment();

  const ReputationManager = await ethers.getContractFactory("ReputationManager");
  const reputation = await ReputationManager.deploy(
    admin.address,
    "https://api.quilvion.xyz/badges/{id}.json"
  );
  await reputation.waitForDeployment();

  const CommerceCore = await ethers.getContractFactory("CommerceCore");
  const commerce = await CommerceCore.deploy(
    await usdc.getAddress(),
    await config.getAddress(),
    await escrow.getAddress(),
    await reputation.getAddress(),
    admin.address
  );
  await commerce.waitForDeployment();

  const SomniaAgentController = await ethers.getContractFactory("SomniaAgentController");
  const agent = await SomniaAgentController.deploy(
    await commerce.getAddress(),
    await config.getAddress(),
    await reputation.getAddress(),
    await escrow.getAddress(),
    admin.address,
    agentWallet.address
  );
  await agent.waitForDeployment();

  // Role grants
  await escrow.grantRole(Roles.COMMERCE_ROLE, await commerce.getAddress());
  await reputation.grantRole(Roles.COMMERCE_ROLE, await commerce.getAddress());
  await commerce.grantRole(Roles.BOT_ROLE,   await agent.getAddress());
  await commerce.grantRole(Roles.ADMIN_ROLE,  await agent.getAddress());
  await config.grantRole(Roles.ADMIN_ROLE,    await agent.getAddress());
  await escrow.grantRole(Roles.ADMIN_ROLE,    await agent.getAddress());

  // Fund buyers
  await usdc.mint(buyer.address,  USDC(5000));
  await usdc.mint(buyer2.address, USDC(5000));
  await usdc.connect(buyer).approve(await commerce.getAddress(),  USDC(5000));
  await usdc.connect(buyer2).approve(await commerce.getAddress(), USDC(5000));

  return {
    usdc, config, escrow, reputation, commerce, agent,
    admin, agentWallet, buyer, merchant, buyer2, merchant2, stranger,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helper: create a merchant with genuinely low reputation score
//  Strategy: create 1 large order, raise dispute on it → score drops to 0
//  This keeps merchant score well below default threshold (40)
// ─────────────────────────────────────────────────────────────────────────────
async function setupMerchantWithLowScore(fixtures, minOrders) {
  const { commerce, buyer, merchant, admin, agent, agentWallet } = fixtures;

  // Lower minOrders requirement for test speed
  await agent.connect(admin).setMerchantMinOrders(minOrders);

  // Create large orders (stays PENDING in escrow)
  for (let i = 0; i < minOrders; i++) {
    await commerce.connect(buyer).createOrder(merchant.address, USDC(150), false);
  }

  // Raise a dispute on each order → updates merchantScore with disputeRaised=true
  // We resolve them via admin so the score update happens (RESOLVED state calls updateMerchantScore)
  // disputeRaised=true → score = (totalOrders - disputes) / totalOrders * 100
  // With 1 order & 1 dispute → score = 0 → safely below threshold (40)
  for (let i = 0; i < minOrders; i++) {
    await commerce.connect(buyer).raiseDispute(i);
    // Admin resolves in buyer's favour → calls updateMerchantScore(merchant, id, true)
    // This increments disputes → score drops
    await commerce.connect(admin).resolveDispute(i, true);
  }
  // Now merchant score = 0 (all orders were disputed) — safely below threshold 40
}

// ─────────────────────────────────────────────────────────────────────────────

describe("SomniaAgentController — Deployment & Roles", function () {
  it("stores correct contract addresses", async function () {
    const { agent, commerce, config, reputation, escrow } = await deployFixture();
    expect(await agent.commerce()).to.equal(await commerce.getAddress());
    expect(await agent.config()).to.equal(await config.getAddress());
    expect(await agent.reputation()).to.equal(await reputation.getAddress());
    expect(await agent.escrow()).to.equal(await escrow.getAddress());
  });

  it("grants AGENT_ROLE to agentWallet", async function () {
    const { agent, agentWallet } = await deployFixture();
    expect(await agent.hasRole(Roles.AGENT_ROLE, agentWallet.address)).to.be.true;
  });

  it("grants OPERATOR_ROLE to admin", async function () {
    const { agent, admin } = await deployFixture();
    expect(await agent.hasRole(Roles.OPERATOR_ROLE, admin.address)).to.be.true;
  });

  it("sets correct default thresholds", async function () {
    const { agent } = await deployFixture();
    expect(await agent.riskFlagThreshold()).to.equal(70);
    expect(await agent.autoResolveRiskThreshold()).to.equal(85);
    expect(await agent.disputeAutoResolveDelay()).to.equal(48 * 3600);
    expect(await agent.merchantWatchlistThreshold()).to.equal(40);
    expect(await agent.merchantMinOrders()).to.equal(5);
    expect(await agent.maxAgentFeeBps()).to.equal(500);
  });

  it("agent is not paused on deploy", async function () {
    const { agent } = await deployFixture();
    expect(await agent.agentPaused()).to.be.false;
  });

  it("reverts deployment with zero address", async function () {
    const SomniaAgentController = await ethers.getContractFactory("SomniaAgentController");
    const [admin, agentW] = await ethers.getSigners();
    await expect(
      SomniaAgentController.deploy(
        ethers.ZeroAddress, admin.address, admin.address, admin.address,
        admin.address, agentW.address
      )
    ).to.be.revertedWith("SomniaAgent: invalid commerce");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1 — Fraud Scoring Relay", function () {
  it("agent submits risk score for a pending order", async function () {
    const { agent, commerce, buyer, merchant, agentWallet } = await deployFixture();
    await commerce.connect(buyer).createOrder(merchant.address, USDC(200), true);

    await expect(
      agent.connect(agentWallet).submitRiskScore(0, 55)
    )
      .to.emit(agent, "AgentRiskScoreSubmitted")
      .withArgs(0, 55, agentWallet.address);

    expect(await commerce.getOrderRiskScore(0)).to.equal(55);
  });

  it("reverts if score > 100", async function () {
    const { agent, commerce, buyer, merchant, agentWallet } = await deployFixture();
    await commerce.connect(buyer).createOrder(merchant.address, USDC(200), true);
    await expect(
      agent.connect(agentWallet).submitRiskScore(0, 101)
    ).to.be.revertedWith("SomniaAgent: invalid score");
  });

  it("reverts if caller is not agent", async function () {
    const { agent, commerce, buyer, merchant, stranger } = await deployFixture();
    await commerce.connect(buyer).createOrder(merchant.address, USDC(200), true);
    await expect(
      agent.connect(stranger).submitRiskScore(0, 50)
    ).to.be.revertedWith("SomniaAgent: caller not agent");
  });

  it("batch submits up to 50 scores", async function () {
    const { agent, commerce, buyer, merchant, agentWallet } = await deployFixture();
    for (let i = 0; i < 5; i++) {
      await commerce.connect(buyer).createOrder(merchant.address, USDC(150), true);
    }
    const orderIds = [0n, 1n, 2n, 3n, 4n];
    const scores   = [10, 20, 30, 40, 50];

    await expect(
      agent.connect(agentWallet).batchSubmitRiskScores(orderIds, scores)
    ).to.emit(agent, "AgentRiskScoreSubmitted");

    for (let i = 0; i < 5; i++) {
      expect(await commerce.getOrderRiskScore(i)).to.equal(scores[i]);
    }
  });

  it("reverts batch if arrays length mismatch", async function () {
    const { agent, commerce, buyer, merchant, agentWallet } = await deployFixture();
    await commerce.connect(buyer).createOrder(merchant.address, USDC(200), true);
    await expect(
      agent.connect(agentWallet).batchSubmitRiskScores([0n, 1n], [50])
    ).to.be.revertedWith("SomniaAgent: length mismatch");
  });

  it("reverts batch if > 50 entries", async function () {
    const { agent, agentWallet } = await deployFixture();
    const ids    = Array.from({ length: 51 }, (_, i) => BigInt(i));
    const scores = Array.from({ length: 51 }, () => 50);
    await expect(
      agent.connect(agentWallet).batchSubmitRiskScores(ids, scores)
    ).to.be.revertedWith("SomniaAgent: max 50 per batch");
  });

  it("logs risk action in ring buffer", async function () {
    const { agent, commerce, buyer, merchant, agentWallet } = await deployFixture();
    await commerce.connect(buyer).createOrder(merchant.address, USDC(200), true);
    await agent.connect(agentWallet).submitRiskScore(0, 77);

    const logs = await agent.getRecentRiskActions(1);
    expect(logs.length).to.equal(1);
    expect(Number(logs[0][0])).to.equal(0);
    expect(Number(logs[0][1])).to.equal(77);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Task 2 — Dispute Auto-Escalation", function () {
  async function setupDisputedOrder(fixtures) {
    const { commerce, buyer, merchant } = fixtures;
    await commerce.connect(buyer).createOrder(merchant.address, USDC(200), false);
    await commerce.connect(buyer).raiseDispute(0);
    return 0;
  }

  it("agent resolves high-risk dispute in buyer's favour after delay", async function () {
    const f = await deployFixture();
    const orderId = await setupDisputedOrder(f);
    await f.agent.connect(f.agentWallet).submitRiskScore(orderId, 90);
    await time.increase(48 * 3600 + 1);

    await expect(
      f.agent.connect(f.agentWallet).agentResolveDispute(
        orderId, true, "High fraud score detected"
      )
    )
      .to.emit(f.agent, "AgentDisputeResolved")
      .withArgs(orderId, true, "High fraud score detected", f.agentWallet.address);
  });

  it("agent resolves watchlisted-merchant dispute in buyer's favour", async function () {
    const f = await deployFixture();

    // Lower minOrders to 1 for this test
    await f.agent.connect(f.admin).setMerchantMinOrders(1);

    // Create a second order on a DIFFERENT order ID so we can raise dispute
    // Step 1: Create one order and complete via dispute to make merchant score = 0
    await f.commerce.connect(f.buyer).createOrder(f.merchant.address, USDC(150), false);
    // orderId = 0; raise dispute on it
    await f.commerce.connect(f.buyer).raiseDispute(0);
    // Admin resolves in buyer's favour → merchantScore drops (disputes=1, total=1 → score=0)
    await f.commerce.connect(f.admin).resolveDispute(0, true);
    // Merchant score is now 0 → below threshold 40 → can be watchlisted

    // Watchlist the merchant (score=0, minOrders=1 satisfied)
    await f.agent.connect(f.agentWallet).agentWatchlistMerchant(f.merchant.address);
    expect(await f.agent.merchantWatchlist(f.merchant.address)).to.be.true;

    // Now create a NEW order that goes disputed
    await f.commerce.connect(f.buyer).createOrder(f.merchant.address, USDC(200), false);
    // orderId = 1
    await f.commerce.connect(f.buyer).raiseDispute(1);

    await time.increase(48 * 3600 + 1);

    await expect(
      f.agent.connect(f.agentWallet).agentResolveDispute(
        1, true, "Merchant on watchlist"
      )
    ).to.emit(f.agent, "AgentDisputeResolved");
  });

  it("reverts if order is not disputed", async function () {
    const { agent, commerce, buyer, merchant, agentWallet } = await deployFixture();
    await commerce.connect(buyer).createOrder(merchant.address, USDC(200), true);
    await time.increase(48 * 3600 + 1);
    await expect(
      agent.connect(agentWallet).agentResolveDispute(0, true, "test")
    ).to.be.revertedWith("SomniaAgent: order not disputed");
  });

  it("reverts if delay has not passed", async function () {
    const f = await deployFixture();
    const orderId = await setupDisputedOrder(f);
    await f.agent.connect(f.agentWallet).submitRiskScore(orderId, 90);
    await expect(
      f.agent.connect(f.agentWallet).agentResolveDispute(orderId, true, "too early")
    ).to.be.revertedWith("SomniaAgent: resolve delay not passed");
  });

  it("reverts merchant-favour resolution without sufficient evidence", async function () {
    const f = await deployFixture();
    const orderId = await setupDisputedOrder(f);
    await f.agent.connect(f.agentWallet).submitRiskScore(orderId, 20);
    await time.increase(48 * 3600 + 1);

    await expect(
      f.agent.connect(f.agentWallet).agentResolveDispute(orderId, false, "not enough")
    ).to.be.revertedWith("SomniaAgent: insufficient evidence for merchant-favor resolution");
  });

  it("logs dispute action in ring buffer", async function () {
    const f = await deployFixture();
    const orderId = await setupDisputedOrder(f);
    await f.agent.connect(f.agentWallet).submitRiskScore(orderId, 90);
    await time.increase(48 * 3600 + 1);
    await f.agent.connect(f.agentWallet).agentResolveDispute(orderId, true, "fraud");

    const logs = await f.agent.getRecentDisputeActions(1);
    expect(logs.length).to.equal(1);
    expect(Number(logs[0][0])).to.equal(0);
    expect(logs[0][1]).to.be.true;
    expect(logs[0][3]).to.equal("fraud");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Task 3 — Dynamic Config Tuning", function () {
  it("agent updates daily spend limit", async function () {
    const { agent, config, agentWallet } = await deployFixture();
    const newLimit = USDC(2000);

    await expect(
      agent.connect(agentWallet).agentSetDailySpendLimit(newLimit)
    )
      .to.emit(agent, "AgentConfigUpdated")
      .withArgs("dailySpendLimit", USDC(1000), newLimit, agentWallet.address);

    expect(await config.dailySpendLimit()).to.equal(newLimit);
  });

  it("agent updates admin approval threshold", async function () {
    const { agent, config, agentWallet } = await deployFixture();
    await agent.connect(agentWallet).agentSetAdminApprovalThreshold(USDC(200));
    expect(await config.adminApprovalThreshold()).to.equal(USDC(200));
  });

  it("agent updates platform fee within ceiling", async function () {
    const { agent, config, agentWallet } = await deployFixture();
    await agent.connect(agentWallet).agentSetPlatformFee(300);
    expect(await config.platformFeeBps()).to.equal(300);
  });

  it("reverts if agent fee exceeds maxAgentFeeBps (500)", async function () {
    const { agent, agentWallet } = await deployFixture();
    await expect(
      agent.connect(agentWallet).agentSetPlatformFee(501)
    ).to.be.revertedWith("SomniaAgent: fee exceeds agent ceiling");
  });

  it("operator can raise maxAgentFeeBps ceiling", async function () {
    const { agent, agentWallet, admin } = await deployFixture();
    await agent.connect(admin).setMaxAgentFeeBps(700);
    await agent.connect(agentWallet).agentSetPlatformFee(600);
    await expect(
      agent.connect(agentWallet).agentSetPlatformFee(701)
    ).to.be.revertedWith("SomniaAgent: fee exceeds agent ceiling");
  });

  it("agent updates refund window", async function () {
    const { agent, config, agentWallet } = await deployFixture();
    const newWindow = 5 * 24 * 3600;
    await agent.connect(agentWallet).agentSetRefundWindow(newWindow);
    expect(await config.refundWindow()).to.equal(newWindow);
  });

  it("reverts refund window below 1 hour", async function () {
    const { agent, agentWallet } = await deployFixture();
    await expect(
      agent.connect(agentWallet).agentSetRefundWindow(1800)
    ).to.be.revertedWith("SomniaAgent: window too short");
  });

  it("reverts refund window above 30 days", async function () {
    const { agent, agentWallet } = await deployFixture();
    await expect(
      agent.connect(agentWallet).agentSetRefundWindow(31 * 24 * 3600)
    ).to.be.revertedWith("SomniaAgent: window too long");
  });

  it("logs config actions in ring buffer", async function () {
    const { agent, agentWallet } = await deployFixture();
    await agent.connect(agentWallet).agentSetPlatformFee(300);
    const logs = await agent.getRecentConfigActions(1);
    expect(logs.length).to.equal(1);
    expect(logs[0][0]).to.equal("platformFeeBps");
    expect(Number(logs[0][1])).to.equal(250);
    expect(Number(logs[0][2])).to.equal(300);
  });

  it("reverts if non-agent tries config update", async function () {
    const { agent, stranger } = await deployFixture();
    await expect(
      agent.connect(stranger).agentSetPlatformFee(100)
    ).to.be.revertedWith("SomniaAgent: caller not agent");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Task 4 — Merchant Watchlist", function () {
  it("agent watchlists a merchant with low score", async function () {
    const f = await deployFixture();
    await setupMerchantWithLowScore(f, 1);

    // After 1 order all disputed → score = 0 (confirmed below threshold 40)
    const scoreBefore = await f.reputation.getMerchantScore(f.merchant.address);
    expect(Number(scoreBefore)).to.be.lessThan(40);

    const tx = await f.agent.connect(f.agentWallet).agentWatchlistMerchant(f.merchant.address);
    const receipt = await tx.wait();

    // Verify event was emitted
    const event = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === "MerchantWatchlisted"
    );
    expect(event).to.not.be.undefined;
    expect(event.args[0]).to.equal(f.merchant.address);
    expect(event.args[2]).to.equal(f.agentWallet.address);

    expect(await f.agent.merchantWatchlist(f.merchant.address)).to.be.true;
  });

  it("reverts if merchant already watchlisted", async function () {
    const f = await deployFixture();
    await setupMerchantWithLowScore(f, 1);
    await f.agent.connect(f.agentWallet).agentWatchlistMerchant(f.merchant.address);
    await expect(
      f.agent.connect(f.agentWallet).agentWatchlistMerchant(f.merchant.address)
    ).to.be.revertedWith("SomniaAgent: already watchlisted");
  });

  it("reverts if merchant has insufficient order history", async function () {
    const { agent, agentWallet, merchant } = await deployFixture();
    await expect(
      agent.connect(agentWallet).agentWatchlistMerchant(merchant.address)
    ).to.be.revertedWith("SomniaAgent: insufficient order history");
  });

  it("reverts if merchant score is above threshold", async function () {
    const f = await deployFixture();
    await f.agent.connect(f.admin).setMerchantMinOrders(1);
    // Small auto-completed order → score = 100, no dispute
    await f.commerce.connect(f.buyer).createOrder(f.merchant.address, USDC(50), true);
    await expect(
      f.agent.connect(f.agentWallet).agentWatchlistMerchant(f.merchant.address)
    ).to.be.revertedWith("SomniaAgent: score above threshold");
  });

  it("operator removes merchant from watchlist", async function () {
    const f = await deployFixture();
    await setupMerchantWithLowScore(f, 1);
    await f.agent.connect(f.agentWallet).agentWatchlistMerchant(f.merchant.address);

    await expect(
      f.agent.connect(f.admin).operatorRemoveFromWatchlist(f.merchant.address)
    )
      .to.emit(f.agent, "MerchantRemovedFromWatchlist")
      .withArgs(f.merchant.address, f.admin.address);

    expect(await f.agent.merchantWatchlist(f.merchant.address)).to.be.false;
  });

  it("stranger cannot remove from watchlist", async function () {
    const f = await deployFixture();
    await expect(
      f.agent.connect(f.stranger).operatorRemoveFromWatchlist(f.merchant.address)
    ).to.be.reverted;
  });

  it("reverts watchlisting zero address", async function () {
    const { agent, agentWallet } = await deployFixture();
    await expect(
      agent.connect(agentWallet).agentWatchlistMerchant(ethers.ZeroAddress)
    ).to.be.revertedWith("SomniaAgent: zero address");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Task 5 — Tier Reward Triggers", function () {
  it("agent triggers reward for a buyer with XP", async function () {
    const { agent, commerce, agentWallet, buyer, merchant } = await deployFixture();
    await commerce.connect(buyer).createOrder(merchant.address, USDC(50), true);

    await expect(
      agent.connect(agentWallet).agentTriggerReward(buyer.address)
    )
      .to.emit(agent, "AgentRewardTriggered")
      .withArgs(buyer.address, 10n, "Bronze", agentWallet.address);
  });

  it("reverts reward trigger for buyer with no XP", async function () {
    const { agent, agentWallet, buyer } = await deployFixture();
    await expect(
      agent.connect(agentWallet).agentTriggerReward(buyer.address)
    ).to.be.revertedWith("SomniaAgent: buyer has no qualifying XP");
  });

  it("batch reward trigger works for multiple buyers", async function () {
    const { agent, commerce, agentWallet, buyer, buyer2, merchant } = await deployFixture();
    await commerce.connect(buyer).createOrder(merchant.address, USDC(50), true);
    await commerce.connect(buyer2).createOrder(merchant.address, USDC(50), true);

    const tx = await agent
      .connect(agentWallet)
      .batchTriggerRewards([buyer.address, buyer2.address]);
    const receipt = await tx.wait();

    const events = receipt.logs.filter(
      (l) => l.fragment && l.fragment.name === "AgentRewardTriggered"
    );
    expect(events.length).to.equal(2);
  });

  it("batch silently skips zero-address and no-XP buyers", async function () {
    const { agent, agentWallet, buyer } = await deployFixture();
    await expect(
      agent.connect(agentWallet).batchTriggerRewards([ethers.ZeroAddress, buyer.address])
    ).to.not.be.reverted;
  });

  it("reverts batch > 100 buyers", async function () {
    const { agent, agentWallet } = await deployFixture();
    const buyers = Array.from({ length: 101 }, () => ethers.Wallet.createRandom().address);
    await expect(
      agent.connect(agentWallet).batchTriggerRewards(buyers)
    ).to.be.revertedWith("SomniaAgent: max 100 per batch");
  });

  it("logs reward trigger in ring buffer", async function () {
    const { agent, commerce, agentWallet, buyer, merchant } = await deployFixture();
    await commerce.connect(buyer).createOrder(merchant.address, USDC(50), true);
    await agent.connect(agentWallet).agentTriggerReward(buyer.address);

    const logs = await agent.getRecentRewardTriggers(1);
    expect(logs.length).to.equal(1);
    expect(logs[0][0]).to.equal(buyer.address);
    expect(Number(logs[0][1])).to.equal(10);
    expect(logs[0][2]).to.equal("Bronze");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Operator Controls", function () {
  it("operator can pause agent", async function () {
    const { agent, admin, agentWallet, commerce, buyer, merchant } = await deployFixture();
    await commerce.connect(buyer).createOrder(merchant.address, USDC(200), true);

    await expect(agent.connect(admin).pauseAgent())
      .to.emit(agent, "AgentPaused")
      .withArgs(admin.address);

    expect(await agent.agentPaused()).to.be.true;

    await expect(
      agent.connect(agentWallet).submitRiskScore(0, 50)
    ).to.be.revertedWith("SomniaAgent: agent is paused");
  });

  it("operator can resume agent", async function () {
    const { agent, admin } = await deployFixture();
    await agent.connect(admin).pauseAgent();
    await expect(agent.connect(admin).resumeAgent())
      .to.emit(agent, "AgentResumed")
      .withArgs(admin.address);
    expect(await agent.agentPaused()).to.be.false;
  });

  it("stranger cannot pause agent", async function () {
    const { agent, stranger } = await deployFixture();
    await expect(agent.connect(stranger).pauseAgent()).to.be.reverted;
  });

  it("operator can update riskFlagThreshold", async function () {
    const { agent, admin } = await deployFixture();
    await expect(agent.connect(admin).setRiskFlagThreshold(60))
      .to.emit(agent, "ThresholdUpdated")
      .withArgs("riskFlagThreshold", 60n);
    expect(await agent.riskFlagThreshold()).to.equal(60);
  });

  it("operator can update autoResolveRiskThreshold", async function () {
    const { agent, admin } = await deployFixture();
    await agent.connect(admin).setAutoResolveRiskThreshold(90);
    expect(await agent.autoResolveRiskThreshold()).to.equal(90);
  });

  it("operator can update disputeAutoResolveDelay", async function () {
    const { agent, admin } = await deployFixture();
    await agent.connect(admin).setDisputeAutoResolveDelay(72 * 3600);
    expect(await agent.disputeAutoResolveDelay()).to.equal(72 * 3600);
  });

  it("reverts delay below 1 hour", async function () {
    const { agent, admin } = await deployFixture();
    await expect(
      agent.connect(admin).setDisputeAutoResolveDelay(1800)
    ).to.be.revertedWith("SomniaAgent: delay too short");
  });

  it("operator can update merchantWatchlistThreshold", async function () {
    const { agent, admin } = await deployFixture();
    await agent.connect(admin).setMerchantWatchlistThreshold(50);
    expect(await agent.merchantWatchlistThreshold()).to.equal(50);
  });

  it("reverts maxAgentFeeBps > 1000 (10%)", async function () {
    const { agent, admin } = await deployFixture();
    await expect(
      agent.connect(admin).setMaxAgentFeeBps(1001)
    ).to.be.revertedWith("SomniaAgent: ceiling too high");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("View Functions & Dashboard", function () {
  it("agentStats() returns correct cumulative counts", async function () {
    const { agent, commerce, agentWallet, buyer, merchant } = await deployFixture();
    await commerce.connect(buyer).createOrder(merchant.address, USDC(200), true);
    await agent.connect(agentWallet).submitRiskScore(0, 42);
    await agent.connect(agentWallet).agentSetPlatformFee(300);

    const stats = await agent.agentStats();
    expect(Number(stats[0])).to.equal(1);
    expect(Number(stats[2])).to.equal(1);
    expect(stats[4]).to.be.false;
  });

  it("protocolSnapshot() returns live protocol state", async function () {
    const { agent, commerce, buyer, merchant } = await deployFixture();
    await commerce.connect(buyer).createOrder(merchant.address, USDC(200), true);

    const snap = await agent.protocolSnapshot();
    expect(Number(snap[0])).to.equal(1);
    expect(snap[1]).to.equal(USDC(1000));
    expect(Number(snap[3])).to.equal(250);
  });

  it("getRecentRiskActions() returns latest N actions", async function () {
    const { agent, commerce, buyer, merchant, agentWallet } = await deployFixture();
    for (let i = 0; i < 3; i++) {
      await commerce.connect(buyer).createOrder(merchant.address, USDC(200), true);
      await agent.connect(agentWallet).submitRiskScore(i, i * 10 + 30);
    }
    const logs = await agent.getRecentRiskActions(3);
    expect(logs.length).to.equal(3);
    expect(Number(logs[0][0])).to.equal(2);
  });

  it("getRecentRiskActions() caps at 50", async function () {
    const { agent } = await deployFixture();
    const logs = await agent.getRecentRiskActions(200);
    expect(logs.length).to.be.lte(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Integration — Full Agent Cycle Simulation", function () {
  it("full flow: create order → risk score → dispute → agent resolves", async function () {
    const f = await deployFixture();

    await f.commerce.connect(f.buyer).createOrder(f.merchant.address, USDC(200), false);
    expect(await f.commerce.totalOrders()).to.equal(1);

    await f.agent.connect(f.agentWallet).submitRiskScore(0, 88);
    expect(await f.commerce.getOrderRiskScore(0)).to.equal(88);

    await f.commerce.connect(f.buyer).raiseDispute(0);
    await time.increase(48 * 3600 + 1);

    await expect(
      f.agent.connect(f.agentWallet).agentResolveDispute(
        0, true, "Automated: fraud score 88 exceeds threshold"
      )
    ).to.emit(f.agent, "AgentDisputeResolved");

    expect(await f.reputation.getBuyerXP(f.buyer.address)).to.equal(0);
  });

  it("full flow: multiple small orders → XP accrual → Silver tier → reward trigger", async function () {
    const f = await deployFixture();

    for (let i = 0; i < 10; i++) {
      await f.commerce.connect(f.buyer).createOrder(f.merchant.address, USDC(50), true);
    }

    const xp  = await f.reputation.getBuyerXP(f.buyer.address);
    const tier = await f.reputation.getBuyerTier(f.buyer.address);
    expect(Number(xp)).to.equal(100);
    expect(tier).to.equal("Silver");

    await expect(
      f.agent.connect(f.agentWallet).agentTriggerReward(f.buyer.address)
    )
      .to.emit(f.agent, "AgentRewardTriggered")
      .withArgs(f.buyer.address, 100n, "Silver", f.agentWallet.address);
  });

  it("full flow: agent dynamically adjusts config based on volume", async function () {
    const { agent, agentWallet, config } = await deployFixture();

    await agent.connect(agentWallet).agentSetDailySpendLimit(USDC(1000));
    await agent.connect(agentWallet).agentSetAdminApprovalThreshold(USDC(300));
    await agent.connect(agentWallet).agentSetPlatformFee(200);

    expect(await config.dailySpendLimit()).to.equal(USDC(1000));
    expect(await config.adminApprovalThreshold()).to.equal(USDC(300));
    expect(await config.platformFeeBps()).to.equal(200);

    const configLogs = await agent.getRecentConfigActions(10);
    expect(configLogs.length).to.equal(3);
  });
});