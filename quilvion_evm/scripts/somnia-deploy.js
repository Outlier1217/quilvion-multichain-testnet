// scripts/deploy.js
// Deploys all Quilvion contracts + SomniaAgentController on local Hardhat / Somnia testnet
// Usage: npx hardhat run scripts/deploy.js --network hardhat
//        npx hardhat run scripts/deploy.js --network somnia

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer, agentWallet] = await ethers.getSigners();

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║      Quilvion Protocol + Somnia Agent Deployment      ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");
  console.log(`Deployer  : ${deployer.address}`);
  console.log(`AgentWallet: ${agentWallet.address}`);
  console.log(`Network   : ${(await ethers.provider.getNetwork()).name}\n`);

  // ── 1. MockUSDC ────────────────────────────────────────────────────────────
  console.log("▸ Deploying MockUSDC...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy(deployer.address);
  await usdc.waitForDeployment();
  console.log(`  ✓ MockUSDC deployed at: ${await usdc.getAddress()}`);

  // ── 2. ConfigManager ───────────────────────────────────────────────────────
  console.log("▸ Deploying ConfigManager...");
  const ConfigManager = await ethers.getContractFactory("ConfigManager");
  const config = await ConfigManager.deploy(
    deployer.address,
    ethers.parseUnits("500", 6),   // dailySpendLimit     = 500 USDC
    ethers.parseUnits("100", 6),   // adminApprovalThreshold = 100 USDC
    250,                            // platformFeeBps      = 2.5%
    3 * 24 * 60 * 60               // refundWindow        = 3 days
  );
  await config.waitForDeployment();
  console.log(`  ✓ ConfigManager deployed at: ${await config.getAddress()}`);

  // ── 3. EscrowLogic ─────────────────────────────────────────────────────────
  console.log("▸ Deploying EscrowLogic...");
  const EscrowLogic = await ethers.getContractFactory("EscrowLogic");
  const escrow = await EscrowLogic.deploy(
    await usdc.getAddress(),
    await config.getAddress(),
    deployer.address
  );
  await escrow.waitForDeployment();
  console.log(`  ✓ EscrowLogic deployed at: ${await escrow.getAddress()}`);

  // ── 4. ReputationManager ───────────────────────────────────────────────────
  console.log("▸ Deploying ReputationManager...");
  const ReputationManager = await ethers.getContractFactory("ReputationManager");
  const reputation = await ReputationManager.deploy(
    deployer.address,
    "https://api.quilvion.xyz/badges/{id}.json"
  );
  await reputation.waitForDeployment();
  console.log(`  ✓ ReputationManager deployed at: ${await reputation.getAddress()}`);

  // ── 5. CommerceCore ────────────────────────────────────────────────────────
  console.log("▸ Deploying CommerceCore...");
  const CommerceCore = await ethers.getContractFactory("CommerceCore");
  const commerce = await CommerceCore.deploy(
    await usdc.getAddress(),
    await config.getAddress(),
    await escrow.getAddress(),
    await reputation.getAddress(),
    deployer.address
  );
  await commerce.waitForDeployment();
  console.log(`  ✓ CommerceCore deployed at: ${await commerce.getAddress()}`);

  // ── 6. SomniaAgentController ───────────────────────────────────────────────
  console.log("▸ Deploying SomniaAgentController...");
  const SomniaAgentController = await ethers.getContractFactory("SomniaAgentController");
  const agent = await SomniaAgentController.deploy(
    await commerce.getAddress(),
    await config.getAddress(),
    await reputation.getAddress(),
    await escrow.getAddress(),
    deployer.address,
    agentWallet.address
  );
  await agent.waitForDeployment();
  console.log(`  ✓ SomniaAgentController deployed at: ${await agent.getAddress()}`);

  // ── 7. Role Grants ─────────────────────────────────────────────────────────
  console.log("\n▸ Granting roles...");

  const COMMERCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("COMMERCE_ROLE"));
  const BOT_ROLE      = ethers.keccak256(ethers.toUtf8Bytes("BOT_ROLE"));
  const ADMIN_ROLE    = ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE"));

  // CommerceCore → COMMERCE_ROLE in EscrowLogic and ReputationManager
  await (await escrow.grantRole(COMMERCE_ROLE, await commerce.getAddress())).wait();
  console.log("  ✓ EscrowLogic: COMMERCE_ROLE → CommerceCore");

  await (await reputation.grantRole(COMMERCE_ROLE, await commerce.getAddress())).wait();
  console.log("  ✓ ReputationManager: COMMERCE_ROLE → CommerceCore");

  // SomniaAgentController → BOT_ROLE in CommerceCore (for setRiskScore)
  await (await commerce.grantRole(BOT_ROLE, await agent.getAddress())).wait();
  console.log("  ✓ CommerceCore: BOT_ROLE → SomniaAgentController");

  // SomniaAgentController → ADMIN_ROLE in CommerceCore (for resolveDispute + completeOrder)
  await (await commerce.grantRole(ADMIN_ROLE, await agent.getAddress())).wait();
  console.log("  ✓ CommerceCore: ADMIN_ROLE → SomniaAgentController");

  // SomniaAgentController → ADMIN_ROLE in ConfigManager (for dynamic config tuning)
  await (await config.grantRole(ADMIN_ROLE, await agent.getAddress())).wait();
  console.log("  ✓ ConfigManager: ADMIN_ROLE → SomniaAgentController");

  // SomniaAgentController → ADMIN_ROLE in EscrowLogic (for resetDailySpend)
  await (await escrow.grantRole(ADMIN_ROLE, await agent.getAddress())).wait();
  console.log("  ✓ EscrowLogic: ADMIN_ROLE → SomniaAgentController");

  // ── 8. Save deployment addresses ──────────────────────────────────────────
  const addresses = {
    network:               (await ethers.provider.getNetwork()).name,
    deployedAt:            new Date().toISOString(),
    deployer:              deployer.address,
    agentWallet:           agentWallet.address,
    MockUSDC:              await usdc.getAddress(),
    ConfigManager:         await config.getAddress(),
    EscrowLogic:           await escrow.getAddress(),
    ReputationManager:     await reputation.getAddress(),
    CommerceCore:          await commerce.getAddress(),
    SomniaAgentController: await agent.getAddress(),
  };

  const outPath = path.join(__dirname, "deployed-addresses.json");
  fs.writeFileSync(outPath, JSON.stringify(addresses, null, 2));

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║                  Deployment Complete ✓                ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log("\nDeployed addresses saved to: scripts/deployed-addresses.json");
  console.log(JSON.stringify(addresses, null, 2));

  return addresses;
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});