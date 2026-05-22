# Quilvion × Somnia — AI Agent Integration

> **AI-Powered Decentralized E-Commerce Protocol on Somnia's Agentic L1**
> Buy and sell anything on-chain with autonomous fraud detection, escrow protection, and merchant reputation scoring.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [SomniaAgentController — 5 Autonomous Tasks](#somniaagentcontroller--5-autonomous-tasks)
- [Contract Addresses (Testnet)](#contract-addresses-testnet)
- [Role Model](#role-model)
- [Project Structure](#project-structure)
- [Local Setup & Testing](#local-setup--testing)
- [Testnet Deployment](#testnet-deployment)
- [Running the Agent](#running-the-agent)
- [Test Coverage](#test-coverage)
- [Why Somnia](#why-somnia)

---

## Overview

Quilvion is a decentralized e-commerce protocol where buyers and sellers transact on-chain with escrow protection and reputation scoring. For the **Somnia Agentathon 2026 (Encode Club)**, an autonomous AI agent layer was integrated on top of the existing protocol — without touching a single line of the existing contracts.

The new contract `SomniaAgentController` acts as an on-chain gateway for an off-chain AI agent process. Every order placed on the protocol is autonomously scanned, scored, and acted upon — fraud flagged, disputes resolved, config tuned, merchants watchlisted, and buyers rewarded — all without any human intervention.

**Existing contracts (untouched):**
- `CommerceCore.sol` — order lifecycle management
- `EscrowLogic.sol` — USDC escrow and daily spend tracking
- `ReputationManager.sol` — buyer XP tiers and merchant scoring
- `ConfigManager.sol` — platform parameters (fees, limits, windows)
- `MockUSDC.sol` — 6-decimal USDC mock for testing

**New contract (Somnia agent layer):**
- `SomniaAgentController.sol` — autonomous AI agent gateway

---

## Architecture

```
Off-chain AI Agent (agent.js)
         │
         │  reads on-chain state
         ▼
┌─────────────────────────────┐
│   SomniaAgentController     │  ← NEW (Somnia Agentathon)
│                             │
│  Task 1: Fraud Scoring      │──▶ CommerceCore.setRiskScore()
│  Task 2: Dispute Resolution │──▶ CommerceCore.resolveDispute()
│  Task 3: Config Tuning      │──▶ ConfigManager.set*()
│  Task 4: Merchant Watchlist │──▶ ReputationManager.getMerchantScore()
│  Task 5: Reward Triggers    │──▶ ReputationManager.getBuyerXP()
└─────────────────────────────┘
         │
         │  calls via interfaces (no imports)
         ▼
┌──────────────────────────────────────────────┐
│         Existing Quilvion Protocol           │
│  CommerceCore  │  EscrowLogic  │  Reputation │
│  ConfigManager │  MockUSDC     │             │
└──────────────────────────────────────────────┘
```

The agent controller uses **interface-only references** to existing contracts — no inheritance, no imports. Existing contracts are completely untouched.

---

## SomniaAgentController — 5 Autonomous Tasks

### Task 1 — Fraud Scoring Relay
The off-chain AI model computes a fraud risk score (0–100) for every new order. The agent pushes these scores on-chain via `BOT_ROLE` in `CommerceCore`.

```solidity
// Single order
function submitRiskScore(uint256 orderId, uint8 score) external;

// Batch — up to 50 orders per tx (optimised for Somnia throughput)
function batchSubmitRiskScores(uint256[] calldata orderIds, uint8[] calldata scores) external;
```

### Task 2 — Dispute Auto-Escalation
Disputed orders are automatically resolved by the agent after a **48-hour enforced delay**, when:
- Risk score ≥ 85 → favor buyer
- Merchant is on watchlist → favor buyer
- Delay passed + merchant evidence → can favor merchant

```solidity
function agentResolveDispute(uint256 orderId, bool favorBuyer, string calldata reason) external;
```

### Task 3 — Dynamic Config Tuning
The agent adjusts platform parameters based on real-time volume signals fed from off-chain analytics:

```solidity
function agentSetDailySpendLimit(uint256 newLimit) external;
function agentSetAdminApprovalThreshold(uint256 newThreshold) external;
function agentSetPlatformFee(uint256 newFeeBps) external;   // hard-capped at 5% by default
function agentSetRefundWindow(uint256 newWindow) external;  // min 1h, max 30d
```

### Task 4 — Merchant Watchlist
The agent reads live reputation data and watchlists merchants whose dispute rate drops their score below the threshold (default: 40/100). Requires minimum order history (default: 5 orders) before watchlisting.

```solidity
function agentWatchlistMerchant(address merchant) external;
function operatorRemoveFromWatchlist(address merchant) external; // operator only
```

### Task 5 — Tier Reward Triggers
When buyers cross XP milestones (Bronze → Silver → Gold), the agent emits on-chain events consumed by the frontend to push personalised rewards, discount codes, or NFT airdrops.

```solidity
function agentTriggerReward(address buyer) external;

// Batch — up to 100 buyers per tx
function batchTriggerRewards(address[] calldata buyers) external;
```

---

## Contract Addresses (Testnet)

| Contract | Address |
|---|---|
| MockUSDC | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| ConfigManager | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` |
| EscrowLogic | `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` |
| ReputationManager | `0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9` |
| CommerceCore | `0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9` |
| SomniaAgentController | `0x5FC8d32690cc91D4c39d9d3abcBD16989F875707` |

> Explorer: https://shannon-explorer.somnia.network

---

## Role Model

```
DEFAULT_ADMIN_ROLE  → full control, grant/revoke any role
OPERATOR_ROLE       → human ops team; can pause agent, adjust thresholds
AGENT_ROLE          → the Somnia AI agent wallet; executes all 5 tasks
```

**Roles granted to SomniaAgentController in existing contracts:**

| Contract | Role | Purpose |
|---|---|---|
| CommerceCore | `BOT_ROLE` | Push risk scores via `setRiskScore()` |
| CommerceCore | `ADMIN_ROLE` | Resolve disputes via `resolveDispute()` |
| ConfigManager | `ADMIN_ROLE` | Tune platform parameters |
| EscrowLogic | `ADMIN_ROLE` | Reset daily spend if needed |

---

## Project Structure

```
quilvion_evm/
├── contracts/
│   ├── CommerceCore.sol              ← existing (untouched)
│   ├── ConfigManager.sol             ← existing (untouched)
│   ├── EscrowLogic.sol               ← existing (untouched)
│   ├── MockUSDC.sol                  ← existing (untouched)
│   ├── ReputationManager.sol         ← existing (untouched)
│   └── SomniaAgentController.sol     ← NEW ✦ Somnia Agentathon
├── scripts/
│   ├── deploy.js                     ← NEW ✦ deploys all 6 contracts + role grants
│   ├── agent.js                      ← NEW ✦ autonomous off-chain agent runner
│   └── deployed-addresses.json       ← generated at deploy time (gitignored)
└── test/
    └── SomniaAgentController.test.js ← NEW ✦ 58/58 tests passing
```

---

## Local Setup & Testing

### Prerequisites
```bash
node >= 18
npm install
```

### Compile
```bash
npx hardhat compile
```

### Run Tests
```bash
npx hardhat test test/SomniaAgentController.test.js
```

Expected output:
```
58 passing (5s)
```

### Local Deploy + Agent Cycle

**Terminal 1 — start local node:**
```bash
npx hardhat node
```

**Terminal 2 — deploy all contracts:**
```bash
npx hardhat run scripts/deploy.js --network localhost
```

**Terminal 2 — run one agent cycle:**
```bash
npx hardhat run scripts/agent.js --network localhost
```

---

## Testnet Deployment

### 1. Install dotenv
```bash
npm install dotenv
```

### 2. Create `.env` file in `quilvion_evm/`
```
DEPLOYER_PRIVATE_KEY=0x_your_deployer_wallet_private_key
AGENT_PRIVATE_KEY=0x_your_agent_wallet_private_key
```

### 3. Add Somnia network to `hardhat.config.js`
```js
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { evmVersion: "paris" }
  },
  networks: {
    hardhat: {},
    localhost: { url: "http://127.0.0.1:8545" },
    somnia: {
      url: "https://dream-rpc.somnia.network",
      chainId: 50312,
      accounts: [
        process.env.DEPLOYER_PRIVATE_KEY,
        process.env.AGENT_PRIVATE_KEY
      ]
    }
  }
};
```

### 4. Get testnet STT (gas token)
```
https://testnet.somnia.network/faucet
```

### 5. Deploy
```bash
npx hardhat run scripts/deploy.js --network somnia
```

### 6. Run agent
```bash
npx hardhat run scripts/agent.js --network somnia
```

---

## Running the Agent

The agent (`scripts/agent.js`) is an autonomous off-chain process that runs one complete cycle:

```
[Agent] Cycle started at 2026-05-22T04:16:46.711Z
[Agent] Protocol snapshot:
        totalOrders       = 12
        dailySpendLimit   = 500.0 USDC
        platformFeeBps    = 250 bps
        treasuryBalance   = 1240.0 USDC
[Agent] Order #3: computed fraud score = 78
[Agent] Order #7: computed fraud score = 91
[Agent] Batch risk scores submitted. TX: 0x...
[Agent] Dispute order #5: auto-resolving favorBuyer=true
[Agent] Dispute #5 resolved. TX: 0x...
[Agent] Updating dailySpendLimit → 750.0 USDC
[Agent] Reward triggers emitted. TX: 0x...

[Agent] Cumulative agent stats:
        totalRiskActions    = 8
        totalDisputeActions = 1
        totalConfigActions  = 1
        totalRewardTriggers = 3
```

In production, wrap the cycle in a `setInterval` or external cron job for continuous autonomous operation.

**To replace the simulated AI model with a real one**, edit `computeFraudScore()` in `agent.js`:
```js
// Replace this function body with your ML API call
async function computeFraudScore(order) {
  const response = await fetch("https://your-ai-api.com/score", {
    method: "POST",
    body: JSON.stringify({ amount: order.amount, merchant: order.merchantWallet })
  });
  const { score } = await response.json();
  return score; // 0–100
}
```

---

## Test Coverage

**58/58 tests passing across 9 suites:**

| Suite | Tests | What's Covered |
|---|---|---|
| Deployment & Roles | 6 | Addresses, role grants, defaults, zero-address revert |
| Task 1 — Fraud Scoring | 7 | Single submit, batch (50), auth, invalid score, ring buffer |
| Task 2 — Dispute Escalation | 6 | High-risk resolve, watchlist resolve, delay enforcement, evidence check |
| Task 3 — Config Tuning | 10 | All 4 params, fee ceiling, auth, min/max window |
| Task 4 — Merchant Watchlist | 7 | Add, remove, duplicate, score threshold, min orders |
| Task 5 — Reward Triggers | 6 | Single, batch (100), skip logic, ring buffer |
| Operator Controls | 9 | Pause/resume, all threshold updates, ceiling enforcement |
| View Functions | 4 | agentStats, protocolSnapshot, ring buffer caps |
| Integration E2E | 3 | Full order→score→dispute→resolve, XP→Silver→reward, config cycle |
| **Total** | **58** | |

---

## Why Somnia

| Need | Somnia Solution |
|---|---|
| Batch 50 fraud scores in 1 tx | High throughput, low gas |
| Agent cycle runs continuously | Sub-second finality |
| 500-entry on-chain audit trail | Cheap storage per tx |
| Dispute resolution with time enforcement | Reliable block timestamps |
| Real-time protocol snapshot in one call | Fast RPC, no stale reads |

Somnia's Agentic L1 is the only chain where running autonomous agent cycles over every order makes economic sense. On traditional L1s, gas costs would make per-order AI scoring prohibitive. On Somnia, it's production-viable.

---

## Safety Features

- **`agentPaused`** — operator can halt all agent activity in one transaction
- **`maxAgentFeeBps`** — agent can never set fee above 5% (hard ceiling, operator-adjustable up to 10%)
- **`disputeAutoResolveDelay`** — minimum 48h wait enforced on-chain; agent cannot rush resolutions
- **Ring buffer (500 entries)** — full on-chain audit trail without unbounded storage growth
- **AGENT_ROLE / OPERATOR_ROLE separation** — agent wallet cannot pause itself or change its own thresholds
- **Evidence requirement** — merchant-favour dispute resolution requires documented justification

---

*Built for Somnia Agentathon 2026 — Encode Club*
*Quilvion Protocol — quilvion.xyz | github.com/Outlier1217*