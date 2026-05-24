// scripts/create-test-orders.js
require("dotenv").config();

const { ethers } = require("hardhat");

async function main() {
  const [buyer] = await ethers.getSigners();
  const addresses = require("./deployed-addresses.json");

  console.log("Buyer Address:", buyer.address);

  const commerce = new ethers.Contract(
    addresses.CommerceCore,
    [
      "function createOrder(address merchantWallet, uint256 amount, bool isMerchantVerified) external returns (uint256)",
      "function totalOrders() external view returns (uint256)"
    ],
    buyer
  );

  const usdc = new ethers.Contract(
    addresses.MockUSDC,
    [
      "function approve(address spender, uint256 amount) external",
      "function balanceOf(address) external view returns (uint256)",
      "function mint(address to, uint256 amount) external"
    ],
    buyer
  );

  // Mint + Approve (agar zarurat ho)
  let balance = await usdc.balanceOf(buyer.address);
  if (balance < ethers.parseUnits("5000", 6)) {
    await (await usdc.mint(buyer.address, ethers.parseUnits("10000", 6))).wait();
    console.log("✅ USDC Minted");
  }

  await (await usdc.approve(addresses.CommerceCore, ethers.parseUnits("10000", 6))).wait();
  console.log("✅ USDC Approved\n");

  const testOrders = [
    { amount: "150", verified: true },
    { amount: "320", verified: true },
    { amount: "90",  verified: true },
  ];

  for (let i = 0; i < testOrders.length; i++) {
    const o = testOrders[i];
    console.log(`Creating Order #${i+1}: ${o.amount} USDC | Verified: ${o.verified}`);

    const tx = await commerce.createOrder(
      buyer.address,
      ethers.parseUnits(o.amount, 6),
      o.verified
    );

    await tx.wait();
    console.log(`✅ Order Created! Tx: ${tx.hash}\n`);
  }

  const totalOrders = await commerce.totalOrders();
  console.log(`🎉 Total Orders on Chain: ${totalOrders}`);
}

main().catch(console.error);