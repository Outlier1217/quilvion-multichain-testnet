// scripts/grantAdminRole.js
const { ethers } = require("hardhat");

const NEW_ADMIN = "0x7072f9c4D9daE0D62B1C24f74BFFDd818Dc65F94";

const CONTRACTS = {
  CommerceCore:      "0xA1fa19D58335b1341c5B8217E26C766fB605B1bA",
  ConfigManager:     "0xbbb3907C31E127664f3E7dA49fF5Fe4c748f9A6c",
  EscrowLogic:       "0xCE968012e486861B606Fe4790a2cf917695133c9",
  ReputationManager: "0x79B47945387a366b8a34B5B198AE21aEfd6b57A6",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE"));
  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash; // 0x000...000

  const abi = [
    "function grantRole(bytes32 role, address account) external",
    "function hasRole(bytes32 role, address account) external view returns (bool)",
  ];

  for (const [name, address] of Object.entries(CONTRACTS)) {
    const contract = new ethers.Contract(address, abi, deployer);
    
    // Check if already has role
    const hasAdmin = await contract.hasRole(ADMIN_ROLE, NEW_ADMIN);
    const hasDefaultAdmin = await contract.hasRole(DEFAULT_ADMIN_ROLE, NEW_ADMIN);
    
    console.log(`\n📋 ${name}:`);
    console.log(`   ADMIN_ROLE already: ${hasAdmin}`);
    console.log(`   DEFAULT_ADMIN_ROLE already: ${hasDefaultAdmin}`);
    
    if (!hasAdmin) {
      const tx = await contract.grantRole(ADMIN_ROLE, NEW_ADMIN);
      await tx.wait();
      console.log(`   ✅ ADMIN_ROLE granted! Tx: ${tx.hash}`);
    }
    
    if (!hasDefaultAdmin) {
      const tx = await contract.grantRole(DEFAULT_ADMIN_ROLE, NEW_ADMIN);
      await tx.wait();
      console.log(`   ✅ DEFAULT_ADMIN_ROLE granted! Tx: ${tx.hash}`);
    }
  }

  // Also grant BOT_ROLE in CommerceCore for agent functionality
  const BOT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BOT_ROLE"));
  const commerceCore = new ethers.Contract(CONTRACTS.CommerceCore, abi, deployer);
  const hasBot = await commerceCore.hasRole(BOT_ROLE, NEW_ADMIN);
  if (!hasBot) {
    const tx = await commerceCore.grantRole(BOT_ROLE, NEW_ADMIN);
    await tx.wait();
    console.log(`\n✅ BOT_ROLE granted in CommerceCore!`);
  }

  console.log("\n🎉 Done! All roles granted to", NEW_ADMIN);
}

main().catch(console.error);