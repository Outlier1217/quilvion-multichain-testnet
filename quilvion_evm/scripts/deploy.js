// scripts/deploy.js
// ──────────────────────────────────────────────────────────────────────────────
// CommerceCore — Full Protocol Deployment Script (Hardhat Local / Testnet)
//
// Deploy order:
//   1. MockUSDC         (or use real USDC address on testnet)
//   2. ConfigManager
//   3. EscrowLogic
//   4. ReputationManager
//   5. CommerceCore     (main contract, wires everything together)
//   6. Grant COMMERCE_ROLE to CommerceCore on EscrowLogic + ReputationManager
// ──────────────────────────────────────────────────────────────────────────────

const { ethers } = require("hardhat");

async function main() {
  const [deployer, admin, bot, merchant, buyer] = await ethers.getSigners();

  console.log("═══════════════════════════════════════════════════");
  console.log("  CommerceCore Protocol — Deploying...");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Deployer  : ${deployer.address}`);
  console.log(`  Admin     : ${admin.address}`);
  console.log(`  Bot       : ${bot.address}`);
  console.log(`  Merchant  : ${merchant.address}`);
  console.log(`  Buyer     : ${buyer.address}`);
  console.log("───────────────────────────────────────────────────\n");

  // ── 1. MockUSDC ──────────────────────────────────────────────────────
  console.log("1️⃣  Deploying MockUSDC...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy(deployer.address);
  await usdc.waitForDeployment();
  const usdcAddr = await usdc.getAddress();
  console.log(`   ✅ MockUSDC      : ${usdcAddr}`);

  // Mint test tokens to buyer (10,000 USDC = 10_000 * 1e6)
  await usdc.mint(buyer.address, 10_000n * 10n ** 6n);
  console.log(`   💸 Minted 10,000 USDC → buyer`);

  // ── 2. ConfigManager ──────────────────────────────────────────────────
  console.log("\n2️⃣  Deploying ConfigManager...");

  const DAILY_SPEND_LIMIT        = 1_000n  * 10n ** 6n;  // 1,000 USDC
  const ADMIN_APPROVAL_THRESHOLD = 500n   * 10n ** 6n;  // 500 USDC → escrow
  const PLATFORM_FEE_BPS         = 250n;                 // 2.5%
  const REFUND_WINDOW            = 7n * 24n * 3600n;     // 7 days in seconds

  const ConfigManager = await ethers.getContractFactory("ConfigManager");
  const configManager = await ConfigManager.deploy(
    admin.address,
    DAILY_SPEND_LIMIT,
    ADMIN_APPROVAL_THRESHOLD,
    PLATFORM_FEE_BPS,
    REFUND_WINDOW
  );
  await configManager.waitForDeployment();
  const configAddr = await configManager.getAddress();
  console.log(`   ✅ ConfigManager : ${configAddr}`);
  console.log(`      dailySpendLimit        : 1,000 USDC`);
  console.log(`      adminApprovalThreshold : 500 USDC`);
  console.log(`      platformFeeBps         : 250 (2.5%)`);
  console.log(`      refundWindow           : 7 days`);

  // ── 3. EscrowLogic ────────────────────────────────────────────────────
  console.log("\n3️⃣  Deploying EscrowLogic...");
  const EscrowLogic = await ethers.getContractFactory("EscrowLogic");
  const escrowLogic = await EscrowLogic.deploy(usdcAddr, configAddr, admin.address);
  await escrowLogic.waitForDeployment();
  const escrowAddr = await escrowLogic.getAddress();
  console.log(`   ✅ EscrowLogic   : ${escrowAddr}`);

  // ── 4. ReputationManager ─────────────────────────────────────────────
  console.log("\n4️⃣  Deploying ReputationManager...");
  const BADGE_URI = "https://api.commercecore.io/badges/{id}.json";
  const ReputationManager = await ethers.getContractFactory("ReputationManager");
  const reputationManager = await ReputationManager.deploy(admin.address, BADGE_URI);
  await reputationManager.waitForDeployment();
  const repAddr = await reputationManager.getAddress();
  console.log(`   ✅ ReputationManager : ${repAddr}`);

  // ── 5. CommerceCore ───────────────────────────────────────────────────
  console.log("\n5️⃣  Deploying CommerceCore...");
  const CommerceCore = await ethers.getContractFactory("CommerceCore");
  const commerceCore = await CommerceCore.deploy(
    usdcAddr,
    configAddr,
    escrowAddr,
    repAddr,
    admin.address
  );
  await commerceCore.waitForDeployment();
  const coreAddr = await commerceCore.getAddress();
  console.log(`   ✅ CommerceCore  : ${coreAddr}`);

  // ── 6. Grant COMMERCE_ROLE ────────────────────────────────────────────
  console.log("\n6️⃣  Wiring roles...");
  const COMMERCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("COMMERCE_ROLE"));

  await escrowLogic.connect(admin).grantRole(COMMERCE_ROLE, coreAddr);
  console.log(`   ✅ EscrowLogic.COMMERCE_ROLE    → CommerceCore`);

  await reputationManager.connect(admin).grantRole(COMMERCE_ROLE, coreAddr);
  console.log(`   ✅ ReputationManager.COMMERCE_ROLE → CommerceCore`);

  // ── 7. Grant BOT_ROLE and MERCHANT_ROLE ──────────────────────────────
  const BOT_ROLE      = ethers.keccak256(ethers.toUtf8Bytes("BOT_ROLE"));
  const MERCHANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MERCHANT_ROLE"));

  await commerceCore.connect(admin).grantRole(BOT_ROLE, bot.address);
  console.log(`   ✅ CommerceCore.BOT_ROLE        → bot`);

  await commerceCore.connect(admin).grantRole(MERCHANT_ROLE, merchant.address);
  console.log(`   ✅ CommerceCore.MERCHANT_ROLE   → merchant`);

  // ── 8. Summary ────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  ✅ DEPLOYMENT COMPLETE");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  MockUSDC          : ${usdcAddr}`);
  console.log(`  ConfigManager     : ${configAddr}`);
  console.log(`  EscrowLogic       : ${escrowAddr}`);
  console.log(`  ReputationManager : ${repAddr}`);
  console.log(`  CommerceCore      : ${coreAddr}`);
  console.log("───────────────────────────────────────────────────");

  // ── 9. Quick Smoke Test ───────────────────────────────────────────────
  console.log("\n🔬 Running smoke test...\n");

  // Buyer approves CommerceCore to spend USDC
  const orderAmount = 100n * 10n ** 6n; // 100 USDC (below 500 threshold → auto-complete)
  await usdc.connect(buyer).approve(coreAddr, orderAmount);
  console.log(`   Buyer approved ${ethers.formatUnits(orderAmount, 6)} USDC for CommerceCore`);

  // Create order (small amount → auto-completes, no escrow needed)
  const tx = await commerceCore
    .connect(buyer)
    .createOrder(merchant.address, orderAmount, true /* isMerchantVerified */);
  const receipt = await tx.wait();

  const orderCreatedEvent = receipt.logs
    .map(log => {
      try { return commerceCore.interface.parseLog(log); } catch { return null; }
    })
    .find(e => e && e.name === "OrderCreated");

  if (orderCreatedEvent) {
    const orderId = orderCreatedEvent.args.orderId;
    const order   = await commerceCore.getOrder(orderId);
    console.log(`   ✅ Order #${orderId} created`);
    console.log(`      Status      : ${["PENDING","COMPLETED","CANCELLED","DISPUTED","RESOLVED_BUYER","RESOLVED_MERCHANT"][order.status]}`);
    console.log(`      Amount      : ${ethers.formatUnits(order.amount, 6)} USDC`);
    console.log(`      AutoComplete: ${!order.requiresEscrow}`);

    // Check buyer XP
    const xp   = await reputationManager.getBuyerXP(buyer.address);
    const tier  = await reputationManager.getBuyerTier(buyer.address);
    console.log(`   ✅ Buyer XP: ${xp} | Tier: ${tier}`);

    // Check merchant score
    const score = await reputationManager.getMerchantScore(merchant.address);
    const count = await reputationManager.getMerchantOrderCount(merchant.address);
    console.log(`   ✅ Merchant Score: ${score}/100 | Orders: ${count}`);

    // Set risk score via bot
    await commerceCore.connect(bot).setRiskScore(orderId, 15);
    const riskScore = await commerceCore.getOrderRiskScore(orderId);
    console.log(`   ✅ Risk Score set: ${riskScore}/100`);
  }

  console.log("\n🎉 All systems operational!\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ Deployment failed:", err);
    process.exit(1);
  });
