// scripts/test-all.js
// ══════════════════════════════════════════════════════════════════════════════
// CommerceCore — Complete Protocol Test Suite v2
// ══════════════════════════════════════════════════════════════════════════════

const { ethers } = require("hardhat");

let passed = 0;
let failed = 0;

function log(msg) { console.log(msg); }

function section(title) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"═".repeat(60)}`);
}

async function check(label, fn) {
  try {
    await fn();
    console.log(`   ✅ PASS — ${label}`);
    passed++;
  } catch (e) {
    console.log(`   ❌ FAIL — ${label}`);
    console.log(`         ${e.message.split("\n")[0]}`);
    failed++;
  }
}

async function expectRevert(label, fn) {
  try {
    await fn();
    console.log(`   ❌ FAIL — ${label} (should have reverted)`);
    failed++;
  } catch (e) {
    console.log(`   ✅ PASS — ${label} (reverted as expected)`);
    passed++;
  }
}

function usdc(amount) { return BigInt(amount) * 10n ** 6n; }

async function main() {
  const signers = await ethers.getSigners();
  const [deployer, admin, bot, merchant, buyer, buyer2, attacker, , buyer6] = signers;

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║      CommerceCore — Full Protocol Test Suite v2          ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`\n  Deployer : ${deployer.address}`);
  console.log(`  Admin    : ${admin.address}`);
  console.log(`  Bot      : ${bot.address}`);
  console.log(`  Merchant : ${merchant.address}`);
  console.log(`  Buyer    : ${buyer.address}`);
  console.log(`  Buyer2   : ${buyer2.address}`);
  console.log(`  Attacker : ${attacker.address}`);
  console.log(`  Buyer6   : ${buyer6.address}`);

  // ── Deploy ────────────────────────────────────────────────────────────────
  section("0. DEPLOYING CONTRACTS");

  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdcContract = await MockUSDC.deploy(deployer.address);
  await usdcContract.waitForDeployment();
  const usdcAddr = await usdcContract.getAddress();
  log(`   MockUSDC          : ${usdcAddr}`);

  // Deploy ConfigManager with HIGH daily limit from the start
  // (We test the limit separately with a fresh wallet in Test 12)
  const ConfigManager = await ethers.getContractFactory("ConfigManager");
  const configManager = await ConfigManager.deploy(
    admin.address,
    usdc(99999),        // dailySpendLimit — HIGH for testing
    usdc(500),          // adminApprovalThreshold
    250n,               // platformFeeBps (2.5%)
    7n * 24n * 3600n    // refundWindow (7 days)
  );
  await configManager.waitForDeployment();
  const configAddr = await configManager.getAddress();
  log(`   ConfigManager     : ${configAddr}`);

  const EscrowLogic = await ethers.getContractFactory("EscrowLogic");
  const escrowLogic = await EscrowLogic.deploy(usdcAddr, configAddr, admin.address);
  await escrowLogic.waitForDeployment();
  const escrowAddr = await escrowLogic.getAddress();
  log(`   EscrowLogic       : ${escrowAddr}`);

  const ReputationManager = await ethers.getContractFactory("ReputationManager");
  const reputationManager = await ReputationManager.deploy(
    admin.address,
    "https://api.commercecore.io/badges/{id}.json"
  );
  await reputationManager.waitForDeployment();
  const repAddr = await reputationManager.getAddress();
  log(`   ReputationManager : ${repAddr}`);

  const CommerceCore = await ethers.getContractFactory("CommerceCore");
  const commerceCore = await CommerceCore.deploy(
    usdcAddr, configAddr, escrowAddr, repAddr, admin.address
  );
  await commerceCore.waitForDeployment();
  const coreAddr = await commerceCore.getAddress();
  log(`   CommerceCore      : ${coreAddr}`);

  // Roles
  const COMMERCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("COMMERCE_ROLE"));
  const BOT_ROLE      = ethers.keccak256(ethers.toUtf8Bytes("BOT_ROLE"));
  const MERCHANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MERCHANT_ROLE"));
  const ADMIN_ROLE    = ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE"));

  await escrowLogic.connect(admin).grantRole(COMMERCE_ROLE, coreAddr);
  await reputationManager.connect(admin).grantRole(COMMERCE_ROLE, coreAddr);
  await commerceCore.connect(admin).grantRole(BOT_ROLE, bot.address);
  await commerceCore.connect(admin).grantRole(MERCHANT_ROLE, merchant.address);
  // Grant EscrowLogic ADMIN_ROLE to CommerceCore so withdrawTreasury() call chain works
  await escrowLogic.connect(admin).grantRole(ADMIN_ROLE, coreAddr);

  // Mint USDC
  await usdcContract.mint(buyer.address,    usdc(50000));
  await usdcContract.mint(buyer2.address,   usdc(50000));
  await usdcContract.mint(buyer6.address,   usdc(5000));
  await usdcContract.mint(attacker.address, usdc(5000));

  log(`   ✅ All contracts deployed, roles wired, USDC minted`);
  log(`   ℹ️  Daily limit = 99,999 USDC (real limit tested in Section 12 with fresh wallet)`);

  // ── TEST 1: ConfigManager ─────────────────────────────────────────────────
  section("1. CONFIG MANAGER TESTS");

  await check("dailySpendLimit deployed as 99,999 USDC", async () => {
    const val = await configManager.dailySpendLimit();
    if (val !== usdc(99999)) throw new Error(`Got ${ethers.formatUnits(val, 6)}`);
  });

  await check("Admin can change dailySpendLimit", async () => {
    await configManager.connect(admin).setDailySpendLimit(usdc(2000));
    const val = await configManager.dailySpendLimit();
    if (val !== usdc(2000)) throw new Error(`Got ${val}`);
    await configManager.connect(admin).setDailySpendLimit(usdc(99999)); // restore
  });

  await check("Admin can set platformFee to 300 bps", async () => {
    await configManager.connect(admin).setPlatformFee(300n);
    const val = await configManager.platformFeeBps();
    if (val !== 300n) throw new Error(`Got ${val}`);
    await configManager.connect(admin).setPlatformFee(250n); // restore
  });

  await check("Admin can set refundWindow", async () => {
    await configManager.connect(admin).setRefundWindow(3n * 24n * 3600n);
    const val = await configManager.refundWindow();
    if (val !== 3n * 24n * 3600n) throw new Error(`Got ${val}`);
    await configManager.connect(admin).setRefundWindow(7n * 24n * 3600n); // restore
  });

  await check("Admin can set adminApprovalThreshold", async () => {
    await configManager.connect(admin).setAdminApprovalThreshold(usdc(300));
    const val = await configManager.adminApprovalThreshold();
    if (val !== usdc(300)) throw new Error(`Got ${val}`);
    await configManager.connect(admin).setAdminApprovalThreshold(usdc(500)); // restore
  });

  await expectRevert("Non-admin CANNOT set platformFee", async () => {
    await configManager.connect(attacker).setPlatformFee(100n);
  });

  await expectRevert("platformFee > 10% (1000 bps) reverts", async () => {
    await configManager.connect(admin).setPlatformFee(1001n);
  });

  // ── TEST 2: Auto-Complete Order ───────────────────────────────────────────
  section("2. ORDER CREATION — AUTO COMPLETE (amount < 500 USDC threshold)");

  await usdcContract.connect(buyer).approve(coreAddr, usdc(100));
  let tx = await commerceCore.connect(buyer).createOrder(merchant.address, usdc(100), true);
  let receipt = await tx.wait();
  let orderId0;

  await check("Order #0 created — OrderCreated event emitted", async () => {
    const ev = receipt.logs
      .map(l => { try { return commerceCore.interface.parseLog(l); } catch { return null; } })
      .find(e => e?.name === "OrderCreated");
    if (!ev) throw new Error("Event not found");
    orderId0 = ev.args.orderId;
  });

  await check("Order #0 status = COMPLETED (auto-complete)", async () => {
    const order = await commerceCore.getOrder(orderId0);
    if (order.status !== 1n) throw new Error(`Status = ${order.status}`);
  });

  await check("Merchant received 97.5 USDC (100 minus 2.5% fee)", async () => {
    const bal = await usdcContract.balanceOf(merchant.address);
    const expected = usdc(100) - (usdc(100) * 250n / 10000n);
    if (bal < expected) throw new Error(`Bal = ${ethers.formatUnits(bal, 6)}`);
  });

  await check("Treasury has accumulated platform fee", async () => {
    const t = await escrowLogic.treasuryBalance();
    if (t === 0n) throw new Error("Treasury = 0");
    log(`      Treasury: ${ethers.formatUnits(t, 6)} USDC`);
  });

  // ── TEST 3: Escrow Order ──────────────────────────────────────────────────
  section("3. ORDER CREATION — ESCROW (amount >= 500 USDC threshold)");

  await usdcContract.connect(buyer).approve(coreAddr, usdc(600));
  tx = await commerceCore.connect(buyer).createOrder(merchant.address, usdc(600), true);
  receipt = await tx.wait();
  let orderId1;

  await check("Order #1 created (600 USDC → escrow)", async () => {
    const ev = receipt.logs
      .map(l => { try { return commerceCore.interface.parseLog(l); } catch { return null; } })
      .find(e => e?.name === "OrderCreated");
    if (!ev) throw new Error("Event not found");
    orderId1 = ev.args.orderId;
  });

  await check("Order #1 status = PENDING (not auto-completed)", async () => {
    const order = await commerceCore.getOrder(orderId1);
    if (order.status !== 0n) throw new Error(`Status = ${order.status}`);
  });

  await check("Order #1 requiresEscrow = true", async () => {
    const order = await commerceCore.getOrder(orderId1);
    if (!order.requiresEscrow) throw new Error("requiresEscrow = false");
  });

  await check("600 USDC locked in EscrowLogic", async () => {
    const locked = await escrowLogic.getLockedFunds(orderId1);
    if (locked !== usdc(600)) throw new Error(`Locked = ${locked}`);
  });

  // ── TEST 4: Admin Release Escrow ──────────────────────────────────────────
  section("4. ADMIN RELEASE ESCROW");

  const merchantBalBefore = await usdcContract.balanceOf(merchant.address);

  await check("Admin can releaseEscrow → order COMPLETED", async () => {
    await commerceCore.connect(admin).releaseEscrow(orderId1);
    const order = await commerceCore.getOrder(orderId1);
    if (order.status !== 1n) throw new Error(`Status = ${order.status}`);
  });

  await check("Merchant received 585 USDC (600 minus 2.5% fee)", async () => {
    const bal = await usdcContract.balanceOf(merchant.address);
    const received = bal - merchantBalBefore;
    const expected = usdc(600) - (usdc(600) * 250n / 10000n);
    if (received !== expected) throw new Error(`Got ${ethers.formatUnits(received, 6)}`);
  });

  await expectRevert("Cannot releaseEscrow twice on same order", async () => {
    await commerceCore.connect(admin).releaseEscrow(orderId1);
  });

  await expectRevert("Non-admin CANNOT releaseEscrow", async () => {
    // Create a fresh escrow order with buyer2 for this revert test
    await usdcContract.connect(buyer2).approve(coreAddr, usdc(600));
    await commerceCore.connect(buyer2).createOrder(merchant.address, usdc(600), true);
    const total = await commerceCore.totalOrders();
    await commerceCore.connect(attacker).releaseEscrow(total - 1n);
  });

  // ── TEST 5: Cancel Order ──────────────────────────────────────────────────
  section("5. CANCEL ORDER");

  // Use buyer2 for cancel test — buyer2 has a PENDING order from Test 4 revert test
  const cancelOrderId = (await commerceCore.totalOrders()) - 1n;
  const buyer2BalBefore = await usdcContract.balanceOf(buyer2.address);

  await check("Buyer can cancel their own PENDING order → CANCELLED", async () => {
    await commerceCore.connect(buyer2).cancelOrder(cancelOrderId);
    const order = await commerceCore.getOrder(cancelOrderId);
    if (order.status !== 2n) throw new Error(`Status = ${order.status}`);
  });

  await check("Buyer received full 600 USDC refund after cancel", async () => {
    const buyer2BalAfter = await usdcContract.balanceOf(buyer2.address);
    const refunded = buyer2BalAfter - buyer2BalBefore;
    if (refunded !== usdc(600)) throw new Error(`Refunded ${ethers.formatUnits(refunded, 6)}`);
  });

  await expectRevert("Cannot cancel an already-cancelled order", async () => {
    await commerceCore.connect(buyer2).cancelOrder(cancelOrderId);
  });

  await expectRevert("Attacker CANNOT cancel someone else's order", async () => {
    // Create a new PENDING order with buyer for attacker to try cancel
    await usdcContract.connect(buyer).approve(coreAddr, usdc(600));
    await commerceCore.connect(buyer).createOrder(merchant.address, usdc(600), true);
    const total = await commerceCore.totalOrders();
    await commerceCore.connect(attacker).cancelOrder(total - 1n);
  });

  // ── TEST 6: Digital Product Delivery ─────────────────────────────────────
  section("6. DIGITAL PRODUCT DELIVERY");

  // Use the PENDING order we just created in Test 5 (attacker tried to cancel it)
  const digitalOrderId = (await commerceCore.totalOrders()) - 1n;
  const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("ipfs://QmTestHash123"));

  await check("Merchant can deliver digital product with IPFS content hash", async () => {
    await commerceCore.connect(merchant).deliverDigitalProduct(digitalOrderId, fakeHash);
    const order = await commerceCore.getOrder(digitalOrderId);
    if (order.contentHash !== fakeHash) throw new Error("Hash mismatch");
    log(`      Content hash: ${fakeHash.substring(0, 20)}...`);
  });

  await expectRevert("Non-merchant CANNOT deliver product", async () => {
    await usdcContract.connect(buyer).approve(coreAddr, usdc(600));
    await commerceCore.connect(buyer).createOrder(merchant.address, usdc(600), true);
    const total = await commerceCore.totalOrders();
    await commerceCore.connect(attacker).deliverDigitalProduct(total - 1n, fakeHash);
  });

  // ── TEST 7: Dispute — Favor Buyer ─────────────────────────────────────────
  section("7. DISPUTE — RESOLVED IN BUYER'S FAVOR");

  await usdcContract.connect(buyer).approve(coreAddr, usdc(600));
  await commerceCore.connect(buyer).createOrder(merchant.address, usdc(600), true);
  const disputeOrderId1 = (await commerceCore.totalOrders()) - 1n;

  await check("Buyer raises dispute → status = DISPUTED", async () => {
    await commerceCore.connect(buyer).raiseDispute(disputeOrderId1);
    const order = await commerceCore.getOrder(disputeOrderId1);
    if (order.status !== 3n) throw new Error(`Status = ${order.status}`);
  });

  const buyerBalBeforeDispute = await usdcContract.balanceOf(buyer.address);

  await check("Admin resolves dispute favor=buyer → RESOLVED_BUYER", async () => {
    await commerceCore.connect(admin).resolveDispute(disputeOrderId1, true);
    const order = await commerceCore.getOrder(disputeOrderId1);
    if (order.status !== 4n) throw new Error(`Status = ${order.status}`);
  });

  await check("Buyer received full 600 USDC refund", async () => {
    const bal = await usdcContract.balanceOf(buyer.address);
    const refunded = bal - buyerBalBeforeDispute;
    if (refunded !== usdc(600)) throw new Error(`Refunded ${ethers.formatUnits(refunded, 6)}`);
  });

  await expectRevert("Non-buyer CANNOT raise dispute on someone else's order", async () => {
    await usdcContract.connect(buyer).approve(coreAddr, usdc(600));
    await commerceCore.connect(buyer).createOrder(merchant.address, usdc(600), true);
    const total = await commerceCore.totalOrders();
    await commerceCore.connect(attacker).raiseDispute(total - 1n);
  });

  // ── TEST 8: Dispute — Favor Merchant ─────────────────────────────────────
  section("8. DISPUTE — RESOLVED IN MERCHANT'S FAVOR");

  await usdcContract.connect(buyer).approve(coreAddr, usdc(600));
  await commerceCore.connect(buyer).createOrder(merchant.address, usdc(600), true);
  const disputeOrderId2 = (await commerceCore.totalOrders()) - 1n;
  await commerceCore.connect(buyer).raiseDispute(disputeOrderId2);

  const merchantBalBeforeD2 = await usdcContract.balanceOf(merchant.address);

  await check("Admin resolves dispute favor=merchant → RESOLVED_MERCHANT", async () => {
    await commerceCore.connect(admin).resolveDispute(disputeOrderId2, false);
    const order = await commerceCore.getOrder(disputeOrderId2);
    if (order.status !== 5n) throw new Error(`Status = ${order.status}`);
  });

  await check("Merchant received 585 USDC (600 minus 2.5% fee)", async () => {
    const bal = await usdcContract.balanceOf(merchant.address);
    const received = bal - merchantBalBeforeD2;
    const expected = usdc(600) - (usdc(600) * 250n / 10000n);
    if (received !== expected) throw new Error(`Got ${ethers.formatUnits(received, 6)}`);
  });

  await expectRevert("Cannot resolve already-resolved dispute", async () => {
    await commerceCore.connect(admin).resolveDispute(disputeOrderId2, true);
  });

  // ── TEST 9: Risk Scoring ──────────────────────────────────────────────────
  section("9. RISK SCORING (BOT_ROLE only)");

  await usdcContract.connect(buyer).approve(coreAddr, usdc(100));
  await commerceCore.connect(buyer).createOrder(merchant.address, usdc(100), true);
  const riskOrderId = (await commerceCore.totalOrders()) - 1n;

  await check("BOT sets risk score to 25", async () => {
    await commerceCore.connect(bot).setRiskScore(riskOrderId, 25);
    const s = await commerceCore.getOrderRiskScore(riskOrderId);
    if (s !== 25n) throw new Error(`Got ${s}`);
  });

  await check("BOT sets risk score to 75", async () => {
    await commerceCore.connect(bot).setRiskScore(riskOrderId, 75);
    const s = await commerceCore.getOrderRiskScore(riskOrderId);
    if (s !== 75n) throw new Error(`Got ${s}`);
  });

  await check("BOT sets risk score to 100 (max)", async () => {
    await commerceCore.connect(bot).setRiskScore(riskOrderId, 100);
    const s = await commerceCore.getOrderRiskScore(riskOrderId);
    if (s !== 100n) throw new Error(`Got ${s}`);
  });

  await expectRevert("Risk score 101 reverts (max is 100)", async () => {
    await commerceCore.connect(bot).setRiskScore(riskOrderId, 101);
  });

  await expectRevert("Attacker CANNOT set risk score", async () => {
    await commerceCore.connect(attacker).setRiskScore(riskOrderId, 50);
  });

  await expectRevert("ADMIN_ROLE also CANNOT set risk score (BOT_ROLE only)", async () => {
    await commerceCore.connect(admin).setRiskScore(riskOrderId, 50);
  });

  // ── TEST 10: Buyer XP & Tier System ──────────────────────────────────────
  section("10. BUYER XP & TIER SYSTEM");

  await check("buyer2 starts with 0 XP", async () => {
    const xp = await reputationManager.getBuyerXP(buyer2.address);
    if (xp !== 0n) throw new Error(`XP = ${xp}`);
  });

  await check("buyer2 starts at Bronze tier", async () => {
    const tier = await reputationManager.getBuyerTier(buyer2.address);
    if (tier !== "Bronze") throw new Error(`Tier = ${tier}`);
  });

  // 10 orders → 100 XP → Silver
  log(`\n   Placing 10 orders with buyer2 (target: 100 XP = Silver)...`);
  for (let i = 0; i < 10; i++) {
    await usdcContract.connect(buyer2).approve(coreAddr, usdc(100));
    await commerceCore.connect(buyer2).createOrder(merchant.address, usdc(100), true);
  }

  await check("After 10 orders buyer2 has 100 XP", async () => {
    const xp = await reputationManager.getBuyerXP(buyer2.address);
    if (xp !== 100n) throw new Error(`XP = ${xp}`);
    log(`      XP: ${xp}`);
  });

  await check("buyer2 tier = Silver at 100 XP", async () => {
    const tier = await reputationManager.getBuyerTier(buyer2.address);
    if (tier !== "Silver") throw new Error(`Tier = ${tier}`);
  });

  await check("buyer2 has NO Bronze badge (Bronze = starting tier, not an upgrade)", async () => {
    // Bronze is the default starting tier — badge only mints on UPGRADE (Bronze→Silver, Silver→Gold)
    // buyer2 started at Bronze, so no Bronze badge is minted — this is correct contract behavior
    const has = await reputationManager.hasBadge(buyer2.address, 0);
    if (has) throw new Error("Bronze badge should NOT be minted for starting tier");
  });

  await check("buyer2 has Silver badge (tokenId=1)", async () => {
    const has = await reputationManager.hasBadge(buyer2.address, 1);
    if (!has) throw new Error("No Silver badge");
  });

  // 40 more orders → 500 XP → Gold
  log(`\n   Placing 40 more orders with buyer2 (target: 500 XP = Gold)...`);
  for (let i = 0; i < 40; i++) {
    await usdcContract.connect(buyer2).approve(coreAddr, usdc(100));
    await commerceCore.connect(buyer2).createOrder(merchant.address, usdc(100), true);
  }

  await check("After 50 orders buyer2 has 500 XP", async () => {
    const xp = await reputationManager.getBuyerXP(buyer2.address);
    if (xp !== 500n) throw new Error(`XP = ${xp}`);
    log(`      XP: ${xp}`);
  });

  await check("buyer2 tier = Gold at 500 XP", async () => {
    const tier = await reputationManager.getBuyerTier(buyer2.address);
    if (tier !== "Gold") throw new Error(`Tier = ${tier}`);
  });

  await check("buyer2 has Gold badge (tokenId=2)", async () => {
    const has = await reputationManager.hasBadge(buyer2.address, 2);
    if (!has) throw new Error("No Gold badge");
  });

  // ── TEST 11: Merchant Reputation ─────────────────────────────────────────
  section("11. MERCHANT REPUTATION");

  await check("Merchant order count > 0", async () => {
    const count = await reputationManager.getMerchantOrderCount(merchant.address);
    log(`      Total orders: ${count}`);
    if (count === 0n) throw new Error("Count = 0");
  });

  await check("Merchant score > 0", async () => {
    const score = await reputationManager.getMerchantScore(merchant.address);
    log(`      Score: ${score}/100`);
    if (score === 0n) throw new Error("Score = 0");
  });

  await check("Dispute lowers merchant score", async () => {
    const before = await reputationManager.getMerchantScore(merchant.address);
    await usdcContract.connect(buyer).approve(coreAddr, usdc(600));
    await commerceCore.connect(buyer).createOrder(merchant.address, usdc(600), true);
    const newId = (await commerceCore.totalOrders()) - 1n;
    await commerceCore.connect(buyer).raiseDispute(newId);
    await commerceCore.connect(admin).resolveDispute(newId, true);
    const after = await reputationManager.getMerchantScore(merchant.address);
    log(`      Score before: ${before}, after dispute: ${after}`);
    if (after >= before) throw new Error("Score did not decrease");
  });

  // ── TEST 12: Daily Spend Limit ────────────────────────────────────────────
  section("12. DAILY SPEND LIMIT (fresh wallet buyer6)");

  // buyer6 is a completely fresh wallet — 0 spend today
  // Set limit to 200 USDC for easy testing
  await configManager.connect(admin).setDailySpendLimit(usdc(200));
  log(`   ℹ️  Limit set to 200 USDC for buyer6 test`);

  await usdcContract.connect(buyer6).approve(coreAddr, usdc(150));
  await commerceCore.connect(buyer6).createOrder(merchant.address, usdc(150), true);

  await check("getDailySpent = 150 USDC after first order", async () => {
    const spent = await escrowLogic.getDailySpent(buyer6.address);
    log(`      buyer6 spent: ${ethers.formatUnits(spent, 6)} USDC`);
    if (spent !== usdc(150)) throw new Error(`Got ${ethers.formatUnits(spent, 6)}`);
  });

  await expectRevert("buyer6 CANNOT spend 100 more (150+100=250 > 200 limit)", async () => {
    await usdcContract.connect(buyer6).approve(coreAddr, usdc(100));
    await commerceCore.connect(buyer6).createOrder(merchant.address, usdc(100), true);
  });

  await check("Admin can reset daily spend for buyer6", async () => {
    await escrowLogic.connect(admin).resetDailySpend(buyer6.address);
    const spent = await escrowLogic.getDailySpent(buyer6.address);
    if (spent !== 0n) throw new Error(`Spent after reset = ${spent}`);
  });

  // Restore limit
  await configManager.connect(admin).setDailySpendLimit(usdc(99999));

  // ── TEST 13: Treasury Withdrawal ─────────────────────────────────────────
  section("13. TREASURY WITHDRAWAL");

  await check("Treasury balance > 0 (fees collected)", async () => {
    const t = await escrowLogic.treasuryBalance();
    log(`      Treasury: ${ethers.formatUnits(t, 6)} USDC`);
    if (t === 0n) throw new Error("Treasury = 0");
  });

  await check("Admin withdraws full treasury to deployer", async () => {
    const tBefore = await escrowLogic.treasuryBalance();
    const dBefore = await usdcContract.balanceOf(deployer.address);
    await commerceCore.connect(admin).withdrawTreasury(deployer.address);
    const dAfter = await usdcContract.balanceOf(deployer.address);
    const received = dAfter - dBefore;
    if (received !== tBefore) throw new Error(`Got ${ethers.formatUnits(received, 6)}, expected ${ethers.formatUnits(tBefore, 6)}`);
    log(`      Withdrew ${ethers.formatUnits(received, 6)} USDC`);
  });

  await expectRevert("Cannot withdraw empty treasury", async () => {
    await commerceCore.connect(admin).withdrawTreasury(deployer.address);
  });

  await expectRevert("Attacker CANNOT withdraw treasury", async () => {
    // Put some fees back first
    await usdcContract.connect(buyer).approve(coreAddr, usdc(100));
    await commerceCore.connect(buyer).createOrder(merchant.address, usdc(100), true);
    await commerceCore.connect(attacker).withdrawTreasury(attacker.address);
  });

  // ── TEST 14: Role Access Control ─────────────────────────────────────────
  section("14. ROLE ACCESS CONTROL");

  await check("Admin can grant ADMIN_ROLE to another address", async () => {
    await commerceCore.connect(admin).grantRole(ADMIN_ROLE, buyer.address);
    const has = await commerceCore.hasRole(ADMIN_ROLE, buyer.address);
    if (!has) throw new Error("Role not granted");
    await commerceCore.connect(admin).revokeRole(ADMIN_ROLE, buyer.address); // cleanup
  });

  await check("Admin can revoke BOT_ROLE", async () => {
    await commerceCore.connect(admin).revokeRole(BOT_ROLE, bot.address);
    const has = await commerceCore.hasRole(BOT_ROLE, bot.address);
    if (has) throw new Error("Role not revoked");
    await commerceCore.connect(admin).grantRole(BOT_ROLE, bot.address); // restore
  });

  await expectRevert("Attacker CANNOT grant any role", async () => {
    await commerceCore.connect(attacker).grantRole(ADMIN_ROLE, attacker.address);
  });

  await expectRevert("Attacker CANNOT revoke any role", async () => {
    await commerceCore.connect(attacker).revokeRole(BOT_ROLE, bot.address);
  });

  // ── TEST 15: Edge Cases ───────────────────────────────────────────────────
  section("15. EDGE CASES & SAFETY CHECKS");

  await expectRevert("createOrder with amount = 0 reverts", async () => {
    await commerceCore.connect(buyer).createOrder(merchant.address, 0n, true);
  });

  await expectRevert("createOrder with zero address merchant reverts", async () => {
    await usdcContract.connect(buyer).approve(coreAddr, usdc(100));
    await commerceCore.connect(buyer).createOrder(ethers.ZeroAddress, usdc(100), true);
  });

  await expectRevert("raiseDispute on non-existent orderId reverts", async () => {
    await commerceCore.connect(buyer).raiseDispute(99999n);
  });

  await expectRevert("getOrderRiskScore on non-existent orderId reverts", async () => {
    await commerceCore.getOrderRiskScore(99999n);
  });

  await expectRevert("releaseEscrow on non-existent orderId reverts", async () => {
    await commerceCore.connect(admin).releaseEscrow(99999n);
  });

  await check("totalOrders() returns correct count", async () => {
    const total = await commerceCore.totalOrders();
    log(`      Total orders ever created: ${total}`);
    if (total === 0n) throw new Error("Total = 0");
  });

  await check("isMerchantVerified=false order still works (off-chain flag)", async () => {
    await usdcContract.connect(buyer).approve(coreAddr, usdc(100));
    await commerceCore.connect(buyer).createOrder(merchant.address, usdc(100), false);
    const id = (await commerceCore.totalOrders()) - 1n;
    const order = await commerceCore.getOrder(id);
    if (order.isMerchantVerified !== false) throw new Error("Flag mismatch");
    log(`      isMerchantVerified=false accepted (off-chain only)`);
  });

  // ── FINAL SUMMARY ─────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  FINAL TEST RESULTS`);
  console.log(`${"═".repeat(60)}`);
  console.log(`  Total   : ${total}`);
  console.log(`  ✅ Pass : ${passed}`);
  console.log(`  ❌ Fail : ${failed}`);
  console.log(`${"═".repeat(60)}`);

  if (failed === 0) {
    console.log(`\n  🎉 ALL ${total} TESTS PASSED — Protocol fully operational!\n`);
  } else {
    console.log(`\n  ⚠️  ${failed} test(s) failed. Review above.\n`);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("\n❌ Test runner crashed:", err.message);
    process.exit(1);
  });