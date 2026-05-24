// scripts/agent.js
require("dotenv").config();

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC_URL = process.env.RPC_URL || "https://dream-rpc.somnia.network";

async function main() {
  const addrs = loadAddresses();

  // Private key se wallet connect
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const agentWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║          Quilvion Somnia Agent — Starting             ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`Agent wallet : ${agentWallet.address}`);
  console.log(`AgentController: ${addrs.SomniaAgentController}\n`);

  const agentContract      = new ethers.Contract(addrs.SomniaAgentController, AGENT_ABI, agentWallet);
  const commerceContract   = new ethers.Contract(addrs.CommerceCore, COMMERCE_ABI, agentWallet);
  const reputationContract = new ethers.Contract(addrs.ReputationManager, REPUTATION_ABI, agentWallet);
  const configContract     = new ethers.Contract(addrs.ConfigManager, CONFIG_ABI, agentWallet);

  const contracts = { agentContract, commerceContract, reputationContract, configContract };

  // Pehla cycle abhi chalao
  await runAgentCycle(contracts, agentWallet);
}

// Load addresses
function loadAddresses() {
  const p = path.join(__dirname, "deployed-addresses.json");
  if (!fs.existsSync(p)) throw new Error("deployed-addresses.json not found. Run deploy first.");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// ABIs (same as before)
const AGENT_ABI = [ /* ... same as your original ABI ... */ ];
const COMMERCE_ABI = [ /* ... same ... */ ];
const REPUTATION_ABI = [ /* ... same ... */ ];
const CONFIG_ABI = [ /* ... same ... */ ];

// computeFraudScore, computeNewDailyLimit, runAgentCycle functions — same rakh do jaise tumhare paas hain

// ─── runAgentCycle function (same as you have) ─────────────────────────────
async function runAgentCycle(contracts, agentWallet) {
  // ... tumhara pura runAgentCycle code yaha paste kar do (last version wala)
  // Sirf changes: agentSigner ki jagah agentWallet use karo
}

// Run
main().catch((err) => {
  console.error("[Agent] Fatal error:", err);
  process.exit(1);
});