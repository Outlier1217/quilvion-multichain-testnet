// scripts/deploy.js
require("dotenv").config();

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();   // Sirf ek signer le rahe hain

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║      Quilvion + Somnia Agent Deployment               ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");
  console.log(`Deployer     : ${deployer.address}`);
  console.log(`AgentWallet  : ${deployer.address} (using same as deployer)`);
  console.log(`Network      : ${(await ethers.provider.getNetwork()).name}\n`);

  // ── 1. MockUSDC ────────────────────────────────────────────────────────────
  console.log("▸ Deploying MockUSDC...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy(deployer.address);
  await usdc.waitForDeployment();
  console.log(`  ✓ MockUSDC: ${await usdc.getAddress()}`);

  // ── 2. ConfigManager ───────────────────────────────────────────────────────
  console.log("▸ Deploying ConfigManager...");
  const ConfigManager = await ethers.getContractFactory("ConfigManager");
  const config = await ConfigManager.deploy(
    deployer.address,
    ethers.parseUnits("500", 6),
    ethers.parseUnits("100", 6),
    250,
    3 * 24 * 60 * 60
  );
  await config.waitForDeployment();
  console.log(`  ✓ ConfigManager: ${await config.getAddress()}`);

  // ── 3. EscrowLogic ─────────────────────────────────────────────────────────
  console.log("▸ Deploying EscrowLogic...");
  const EscrowLogic = await ethers.getContractFactory("EscrowLogic");
  const escrow = await EscrowLogic.deploy(
    await usdc.getAddress(),
    await config.getAddress(),
    deployer.address
  );
  await escrow.waitForDeployment();
  console.log(`  ✓ EscrowLogic: ${await escrow.getAddress()}`);

  // ── 4. ReputationManager ───────────────────────────────────────────────────
  console.log("▸ Deploying ReputationManager...");
  const ReputationManager = await ethers.getContractFactory("ReputationManager");
  const reputation = await ReputationManager.deploy(
    deployer.address,
    "https://api.quilvion.xyz/badges/{id}.json"
  );
  await reputation.waitForDeployment();
  console.log(`  ✓ ReputationManager: ${await reputation.getAddress()}`);

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
  console.log(`  ✓ CommerceCore: ${await commerce.getAddress()}`);

  // ── 6. SomniaAgentController ───────────────────────────────────────────────
  console.log("▸ Deploying SomniaAgentController...");
  const SomniaAgentController = await ethers.getContractFactory("SomniaAgentController");
  const agent = await SomniaAgentController.deploy(
    await commerce.getAddress(),
    await config.getAddress(),
    await reputation.getAddress(),
    await escrow.getAddress(),
    deployer.address,   // defaultAdmin
    deployer.address    // agentWallet (same as deployer for now)
  );
  await agent.waitForDeployment();
  console.log(`  ✓ SomniaAgentController: ${await agent.getAddress()}`);

  // ── 7. Role Grants ─────────────────────────────────────────────────────────
  console.log("\n▸ Granting roles...");

  const COMMERCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("COMMERCE_ROLE"));
  const BOT_ROLE      = ethers.keccak256(ethers.toUtf8Bytes("BOT_ROLE"));
  const ADMIN_ROLE    = ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE"));

  await (await escrow.grantRole(COMMERCE_ROLE, await commerce.getAddress())).wait();
  await (await reputation.grantRole(COMMERCE_ROLE, await commerce.getAddress())).wait();
  await (await commerce.grantRole(BOT_ROLE, await agent.getAddress())).wait();
  await (await commerce.grantRole(ADMIN_ROLE, await agent.getAddress())).wait();
  await (await config.grantRole(ADMIN_ROLE, await agent.getAddress())).wait();
  await (await escrow.grantRole(ADMIN_ROLE, await agent.getAddress())).wait();

  console.log("  ✓ All roles granted");

  // ── 8. Save addresses ─────────────────────────────────────────────────────
  const addresses = {
    network: (await ethers.provider.getNetwork()).name,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    MockUSDC: await usdc.getAddress(),
    ConfigManager: await config.getAddress(),
    EscrowLogic: await escrow.getAddress(),
    ReputationManager: await reputation.getAddress(),
    CommerceCore: await commerce.getAddress(),
    SomniaAgentController: await agent.getAddress(),
  };

  const outPath = path.join(__dirname, "deployed-addresses.json");
  fs.writeFileSync(outPath, JSON.stringify(addresses, null, 2));

  console.log("\n✅ Deployment Successful!");
  console.log(JSON.stringify(addresses, null, 2));
}

main().catch((err) => {
  console.error("\n❌ Deployment failed:", err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});