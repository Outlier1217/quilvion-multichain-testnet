# Quilvion × Somnia — AI Agent Integration

> **AI-Powered Decentralized E-Commerce Protocol on Somnia's Agentic L1**  
> Buy and sell anything on-chain with autonomous fraud detection, escrow protection, and merchant reputation scoring.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [SomniaAgentController — 5 Autonomous Tasks](#somniaagentcontroller--5-autonomous-tasks)
- [Contract Addresses (Somnia Testnet)](#contract-addresses-somnia-testnet)
- [Role Model](#role-model)
- [Project Structure](#project-structure)
- [Local Setup & Testing](#local-setup--testing)
- [Testnet Deployment](#testnet-deployment)
- [Running the Agent](#running-the-agent)
- [Why Somnia](#why-somnia)

---

## Overview

Quilvion is a decentralized e-commerce protocol with escrow and reputation system. For the **Somnia Agentathon 2026**, an autonomous AI agent layer (`SomniaAgentController`) was added on top without modifying any existing contracts.

The off-chain agent (`agent.js`) reads on-chain state and autonomously performs fraud scoring, dispute resolution, config tuning, merchant watchlisting, and reward triggering.

---

## Architecture
Off-chain AI Agent (agent.js)
│
▼
SomniaAgentController (on-chain gateway)
│
├──→ CommerceCore (BOT_ROLE + ADMIN_ROLE)
├──→ ConfigManager (ADMIN_ROLE)
├──→ EscrowLogic (ADMIN_ROLE)
└──→ ReputationManager (COMMERCE_ROLE)


---

## Contract Addresses (Somnia Testnet)

| Contract                  | Address                                            | Explorer Link |
|--------------------------|----------------------------------------------------|-------------|
| **MockUSDC**             | `0xDbA3C917F0710869e9826F37c1e1ee0fcBa951ad`     | [View](https://shannon-explorer.somnia.network/address/0xDbA3C917F0710869e9826F37c1e1ee0fcBa951ad) |
| **ConfigManager**        | `0xbbb3907C31E127664f3E7dA49fF5Fe4c748f9A6c`     | [View](https://shannon-explorer.somnia.network/address/0xbbb3907C31E127664f3E7dA49fF5Fe4c748f9A6c) |
| **EscrowLogic**          | `0xCE968012e486861B606Fe4790a2cf917695133c9`     | [View](https://shannon-explorer.somnia.network/address/0xCE968012e486861B606Fe4790a2cf917695133c9) |
| **ReputationManager**    | `0x79B47945387a366b8a34B5B198AE21aEfd6b57A6`     | [View](https://shannon-explorer.somnia.network/address/0x79B47945387a366b8a34B5B198AE21aEfd6b57A6) |
| **CommerceCore**         | `0xA1fa19D58335b1341c5B8217E26C766fB605B1bA`     | [View](https://shannon-explorer.somnia.network/address/0xA1fa19D58335b1341c5B8217E26C766fB605B1bA) |
| **SomniaAgentController**| `0xdBB640163565C62512c69fEe8fd03E723BB30b40`     | [View](https://shannon-explorer.somnia.network/address/0xdBB640163565C62512c69fEe8fd03E723BB30b40) |

**Deployer Address:** `0x33E89cecA902e3FEBf86686A4D0Adb195BA6e49A`

**Network Details:**
- RPC: `https://dream-rpc.somnia.network`
- Chain ID: `50312`
- Explorer: [shannon-explorer.somnia.network](https://shannon-explorer.somnia.network)

---

## SomniaAgentController — 5 Autonomous Tasks

(Same as before — 5 tasks detailed)

### Task 1 — Fraud Scoring
- `batchSubmitRiskScores()` + `submitRiskScore()`

### Task 2 — Dispute Resolution
- `agentResolveDispute()`

### Task 3 — Dynamic Config Tuning
- `agentSetDailySpendLimit()`, `agentSetPlatformFee()` etc.

### Task 4 — Merchant Watchlist
- `agentWatchlistMerchant()`

### Task 5 — Reward Triggers
- `batchTriggerRewards()`

---

## Role Model

`SomniaAgentController` ko following roles diye gaye hain:
- `BOT_ROLE` + `ADMIN_ROLE` in CommerceCore
- `ADMIN_ROLE` in ConfigManager, EscrowLogic

---

## Project Structure

(Same as your previous version)

---

## Running the Agent

```bash
# One-time cycle
npx hardhat run scripts/agent.js --network somniaTestnet

# For continuous running (recommended)
node scripts/agent.js

Current Status (Testnet):
Agent successfully running and can assign risk scores to new orders.

Testnet Explorer Links (Direct)

CommerceCore: View Contract
SomniaAgentController: View Contract
Latest Transactions: View Txns


Built for Somnia Agentathon 2026
Deployed on: 24 May 2026