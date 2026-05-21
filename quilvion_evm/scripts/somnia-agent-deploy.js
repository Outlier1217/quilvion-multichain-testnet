// scripts/agent.js
// Somnia AI Agent — autonomous off-chain process
// Reads on-chain state, computes decisions, writes back via SomniaAgentController
//
// Usage (after deploy):
//   npx hardhat run scripts/agent.js --network hardhat
//   node scripts/agent.js   ← standalone with ethers (set RPC_URL + AGENT_PRIVATE_KEY in .env)

const { ethers } = require("hardhat");
const fs   = require("fs");
const path = require("path");

// ─── Load deployed addresses ──────────────────────────────────────────────────
function loadAddresses() {
  const p = path.join(__dirname, "deployed-addresses.json");
  if (!fs.existsSync(p)) throw new Error("deployed-addresses.json not found. Run deploy.js first.");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// ─── Minimal ABIs (only what agent needs) ─────────────────────────────────────
const AGENT_ABI = [
  // Task 1 — Fraud
  "function submitRiskScore(uint256 orderId, uint8 score) external",
  "function batchSubmitRiskScores(uint256[] orderIds, uint8[] scores) external",
  // Task 2 — Disputes
  "function agentResolveDispute(uint256 orderId, bool favorBuyer, string reason) external",
  // Task 3 — Config
  "function agentSetDailySpendLimit(uint256 newLimit) external",
  "function agentSetAdminApprovalThreshold(uint256 newThreshold) external",
  "function agentSetPlatformFee(uint256 newFeeBps) external",
  "function agentSetRefundWindow(uint256 newWindow) external",
  // Task 4 — Watchlist
  "function agentWatchlistMerchant(address merchant) external",
  // Task 5 — Rewards
  "function batchTriggerRewards(address[] buyers) external",
  // View
  "function agentStats() external view returns (uint256,uint256,uint256,uint256,bool)",
  "function protocolSnapshot() external view returns (uint256,uint256,uint256,uint256,uint256,uint256)",
  "function agentPaused() external view returns (bool)",
  "function merchantWatchlist(address) external view returns (bool)",
  "function getRecentRiskActions(uint256 n) external view returns (tuple(uint256,uint8,uint256,address)[])",
  "function getRecentDisputeActions(uint256 n) external view returns (tuple(uint256,bool,uint256,string,address)[])",
];

const COMMERCE_ABI = [
  "function totalOrders() external view returns (uint256)",
  "function getOrder(uint256 orderId) external view returns (uint256,address,address,uint256,uint8,bool,bool,bool,uint256,bytes32,uint8)",
  "function getOrderRiskScore(uint256 orderId) external view returns (uint8)",
];

const REPUTATION_ABI = [
  "function getBuyerXP(address) external view returns (uint256)",
  "function getBuyerTier(address) external view returns (string)",
  "function getMerchantScore(address) external view returns (uint256)",
  "function getMerchantOrderCount(address) external view returns (uint256)",
];

const CONFIG_ABI = [
  "function dailySpendLimit() external view returns (uint256)",
  "function adminApprovalThreshold() external view returns (uint256)",
  "function platformFeeBps() external view returns (uint256)",
  "function refundWindow() external view returns (uint256)",
];

// ─── AI Fraud Score Simulation ────────────────────────────────────────────────
// In production: replace this with your actual ML model / off-chain API call
function computeFraudScore(order) {
  let score = 0;

  // Large amount = higher risk
  const amountUSDC = Number(order.amount) / 1e6;
  if (amountUSDC > 400) score += 30;
  else if (amountUSDC > 200) score += 15;

  // Unverified merchant = risk
  if (!order.isMerchantVerified) score += 25;

  // Order requires escrow but has no content hash yet = suspicious
  if (order.requiresEscrow && order.contentHash === ethers.ZeroHash) score += 20;

  // Dispute already raised
  if (order.disputeRaised) score += 25;

  // Add some realistic variance (simulates model uncertainty)
  score += Math.floor(Math.random() * 10);

  return Math.min(score, 100);
}

// ─── Config Tuning Logic ──────────────────────────────────────────────────────
// In production: driven by real-time volume analytics
function computeNewDailyLimit(totalOrders, currentLimit) {
  // Simple heuristic: if volume is high, loosen limit; else tighten slightly
  if (totalOrders > 100) return ethers.parseUnits("1000", 6); // 1000 USDC
  if (totalOrders > 50)  return ethers.parseUnits("750", 6);
  return ethers.parseUnits("500", 6); // default
}

// ─── Main Agent Loop ──────────────────────────────────────────────────────────
async function runAgentCycle(contracts, signers) {
  const { agentContract, commerceContract, reputationContract, configContract } = contracts;
  const { agentSigner } = signers;

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`[Agent] Cycle started at ${new Date().toISOString()}`);

  // 0. Safety: check agent is not paused
  const paused = await agentContract.agentPaused();
  if (paused) {
    console.log("[Agent] ⚠️  Agent is paused. Skipping cycle.");
    return;
  }

  // 1. Read protocol snapshot
  const snap = await agentContract.protocolSnapshot();
  const totalOrders       = Number(snap[0]);
  const dailySpendLimit   = snap[1];
  const platformFeeBps    = snap[3];
  const treasuryBalance   = snap[5];

  console.log(`[Agent] Protocol snapshot:`);
  console.log(`        totalOrders       = ${totalOrders}`);
  console.log(`        dailySpendLimit   = ${ethers.formatUnits(dailySpendLimit, 6)} USDC`);
  console.log(`        platformFeeBps    = ${platformFeeBps} bps`);
  console.log(`        treasuryBalance   = ${ethers.formatUnits(treasuryBalance, 6)} USDC`);

  if (totalOrders === 0) {
    console.log("[Agent] No orders yet. Nothing to do.");
    return;
  }

  // ── Task 1 & 2: Scan orders — fraud scoring + dispute check ────────────────
  const riskOrderIds = [];
  const riskScores   = [];
  const buyers       = new Set();
  const merchants    = new Set();

  for (let i = 0; i < totalOrders; i++) {
    let order;
    try {
      const raw = await commerceContract.getOrder(i);
      order = {
        id:                  Number(raw[0]),
        buyer:               raw[1],
        merchantWallet:      raw[2],
        amount:              raw[3],
        status:              Number(raw[4]),
        isMerchantVerified:  raw[5],
        requiresEscrow:      raw[6],
        disputeRaised:       raw[7],
        createdAt:           Number(raw[8]),
        contentHash:         raw[9],
        riskScore:           Number(raw[10]),
      };
    } catch {
      continue; // order fetch failed, skip
    }

    buyers.add(order.buyer);
    merchants.add(order.merchantWallet);

    // Status: 0=PENDING, 1=COMPLETED, 2=CANCELLED, 3=DISPUTED, 4=RESOLVED_BUYER, 5=RESOLVED_MERCHANT
    // Only score PENDING orders that haven't been scored yet (score=0)
    if (order.status === 0 && order.riskScore === 0) {
      const score = computeFraudScore(order);
      riskOrderIds.push(BigInt(i));
      riskScores.push(score);
      console.log(`[Agent] Order #${i}: computed fraud score = ${score}`);
    }

    // Task 2: Check disputed orders for auto-resolution
    if (order.status === 3) {
      const nowSec      = Math.floor(Date.now() / 1000);
      const delayPassed = nowSec >= order.createdAt + 48 * 3600;

      if (delayPassed || order.riskScore >= 85) {
        // On local hardhat we don't enforce real 48h; in tests we mine time
        const favorBuyer = order.riskScore >= 85 || !order.isMerchantVerified;
        const reason = favorBuyer
          ? `High fraud score (${order.riskScore}) or unverified merchant`
          : "Delay passed, merchant evidence sufficient";

        console.log(`[Agent] Dispute order #${i}: auto-resolving favorBuyer=${favorBuyer}`);
        try {
          const tx = await agentContract
            .connect(agentSigner)
            .agentResolveDispute(BigInt(i), favorBuyer, reason);
          await tx.wait();
          console.log(`[Agent] ✓ Dispute #${i} resolved. TX: ${tx.hash}`);
        } catch (e) {
          console.log(`[Agent] ✗ Dispute #${i} resolve failed: ${e.message.split("\n")[0]}`);
        }
      }
    }
  }

  // Batch submit risk scores
  if (riskOrderIds.length > 0) {
    console.log(`[Agent] Submitting ${riskOrderIds.length} risk score(s) in batch...`);
    try {
      const tx = await agentContract
        .connect(agentSigner)
        .batchSubmitRiskScores(riskOrderIds, riskScores);
      await tx.wait();
      console.log(`[Agent] ✓ Batch risk scores submitted. TX: ${tx.hash}`);
    } catch (e) {
      // Batch failed — try one by one
      console.log(`[Agent] Batch failed, falling back to individual submissions...`);
      for (let k = 0; k < riskOrderIds.length; k++) {
        try {
          const tx = await agentContract
            .connect(agentSigner)
            .submitRiskScore(riskOrderIds[k], riskScores[k]);
          await tx.wait();
          console.log(`[Agent] ✓ Risk score for order #${riskOrderIds[k]} = ${riskScores[k]}`);
        } catch (e2) {
          console.log(`[Agent] ✗ Score for #${riskOrderIds[k]} failed: ${e2.message.split("\n")[0]}`);
        }
      }
    }
  }

  // ── Task 3: Dynamic config tuning ──────────────────────────────────────────
  const newLimit = computeNewDailyLimit(totalOrders, dailySpendLimit);
  if (newLimit !== dailySpendLimit) {
    console.log(`[Agent] Updating dailySpendLimit → ${ethers.formatUnits(newLimit, 6)} USDC`);
    try {
      const tx = await agentContract
        .connect(agentSigner)
        .agentSetDailySpendLimit(newLimit);
      await tx.wait();
      console.log(`[Agent] ✓ dailySpendLimit updated. TX: ${tx.hash}`);
    } catch (e) {
      console.log(`[Agent] ✗ Config update failed: ${e.message.split("\n")[0]}`);
    }
  }

  // ── Task 4: Merchant watchlist check ──────────────────────────────────────
  for (const merchant of merchants) {
    try {
      const orderCount = await reputationContract.getMerchantOrderCount(merchant);
      const score      = await reputationContract.getMerchantScore(merchant);
      const alreadyWL  = await agentContract.merchantWatchlist(merchant);

      if (Number(orderCount) >= 5 && Number(score) < 40 && !alreadyWL) {
        console.log(`[Agent] Watchlisting merchant ${merchant} (score=${score})`);
        const tx = await agentContract
          .connect(agentSigner)
          .agentWatchlistMerchant(merchant);
        await tx.wait();
        console.log(`[Agent] ✓ Merchant ${merchant} watchlisted. TX: ${tx.hash}`);
      }
    } catch (e) {
      console.log(`[Agent] Merchant check skipped: ${e.message.split("\n")[0]}`);
    }
  }

  // ── Task 5: Tier reward triggers ───────────────────────────────────────────
  const buyerArr = [...buyers];
  if (buyerArr.length > 0) {
    console.log(`[Agent] Triggering tier rewards for ${buyerArr.length} buyer(s)...`);
    try {
      const tx = await agentContract
        .connect(agentSigner)
        .batchTriggerRewards(buyerArr);
      await tx.wait();
      console.log(`[Agent] ✓ Reward triggers emitted. TX: ${tx.hash}`);
    } catch (e) {
      console.log(`[Agent] ✗ Reward trigger failed: ${e.message.split("\n")[0]}`);
    }
  }

  // ── Final stats ────────────────────────────────────────────────────────────
  const stats = await agentContract.agentStats();
  console.log(`\n[Agent] Cycle complete. Cumulative agent stats:`);
  console.log(`        totalRiskActions    = ${stats[0]}`);
  console.log(`        totalDisputeActions = ${stats[1]}`);
  console.log(`        totalConfigActions  = ${stats[2]}`);
  console.log(`        totalRewardTriggers = ${stats[3]}`);
  console.log(`        agentPaused         = ${stats[4]}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

// ─── Entry point ──────────────────────────────────────────────────────────────
async function main() {
  const addrs   = loadAddresses();
  const signers = await ethers.getSigners();

  // signers[0] = deployer/admin, signers[1] = agentWallet
  const agentSigner = signers[1] || signers[0];

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║          Quilvion Somnia Agent — Starting             ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`Agent wallet : ${agentSigner.address}`);
  console.log(`AgentController: ${addrs.SomniaAgentController}\n`);

  const agentContract      = new ethers.Contract(addrs.SomniaAgentController, AGENT_ABI,      agentSigner);
  const commerceContract   = new ethers.Contract(addrs.CommerceCore,           COMMERCE_ABI,   agentSigner);
  const reputationContract = new ethers.Contract(addrs.ReputationManager,      REPUTATION_ABI, agentSigner);
  const configContract     = new ethers.Contract(addrs.ConfigManager,          CONFIG_ABI,     agentSigner);

  const contracts = { agentContract, commerceContract, reputationContract, configContract };
  const signerMap = { agentSigner };

  // Run once (in production: wrap in setInterval or external cron)
  await runAgentCycle(contracts, signerMap);
}

main().catch((err) => {
  console.error("[Agent] Fatal error:", err);
  process.exit(1);
});