// scripts/agent.js
require("dotenv").config();

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

function loadAddresses() {
  const p = path.join(__dirname, "deployed-addresses.json");
  if (!fs.existsSync(p)) throw new Error("deployed-addresses.json not found!");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const AGENT_ABI = [
  "function batchSubmitRiskScores(uint256[] orderIds, uint8[] scores) external",
  "function submitRiskScore(uint256 orderId, uint8 score) external",
  "function agentStats() external view returns (uint256,uint256,uint256,uint256,bool)",
];

const COMMERCE_ABI = [
  "function totalOrders() external view returns (uint256)",
  "function getOrder(uint256 orderId) external view returns (uint256,address,address,uint256,uint8,bool,bool,bool,uint256,bytes32,uint8)",
  "function getOrderRiskScore(uint256 orderId) external view returns (uint8)"
];

function computeFraudScore(order) {
  let score = 10; // base score
  const amount = Number(order[3]) / 1e6;

  if (amount > 300) score += 35;
  else if (amount > 150) score += 20;

  if (!order[5]) score += 40;        // isMerchantVerified = false
  if (order[7]) score += 30;         // disputeRaised

  score += Math.floor(Math.random() * 12);
  return Math.min(score, 92);
}

async function runAgentCycle(agentContract, commerceContract) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━ [Agent Cycle] ━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Time: ${new Date().toISOString()}`);

  const totalOrders = await commerceContract.totalOrders();
  console.log(`📊 Total Orders: ${totalOrders}`);

  const riskOrderIds = [];
  const riskScores = [];

  for (let i = 0; i < Number(totalOrders); i++) {
    const order = await commerceContract.getOrder(i);
    const currentRisk = await commerceContract.getOrderRiskScore(i);

    console.log(`Order #${i}: ${Number(order[3])/1e6} USDC | Verified=${order[5]} | Current Risk=${currentRisk}`);

    if (currentRisk === 0) {
      const score = computeFraudScore(order);
      riskOrderIds.push(i);
      riskScores.push(score);
      console.log(`   → Will assign Risk Score: ${score}`);
    }
  }

  if (riskOrderIds.length > 0) {
    console.log(`\n🚀 Submitting ${riskOrderIds.length} Risk Score(s)...`);
    try {
      const tx = await agentContract.batchSubmitRiskScores(riskOrderIds, riskScores);
      await tx.wait();
      console.log(`✅ Success! Risk scores submitted → Tx: ${tx.hash}`);
    } catch (e) {
      console.log(`❌ Batch submission failed: ${e.message}`);
    }
  } else {
    console.log("\n✅ All orders already have risk scores assigned.");
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

async function main() {
  const addrs = loadAddresses();
  const [signer] = await ethers.getSigners();

  const agentContract = new ethers.Contract(addrs.SomniaAgentController, AGENT_ABI, signer);
  const commerceContract = new ethers.Contract(addrs.CommerceCore, COMMERCE_ABI, signer);

  console.log("Agent Wallet:", signer.address);

  await runAgentCycle(agentContract, commerceContract);
}

main().catch(console.error);