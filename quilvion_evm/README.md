# CommerceCore — EVM Smart Contract Suite

Full on-chain escrow + reputation protocol for digital commerce, built with Solidity + OpenZeppelin.

---

## 📁 Project Structure

```
commercecore/
├── contracts/
│   ├── ConfigManager.sol       ← On-chain admin config
│   ├── EscrowLogic.sol         ← USDC escrow + daily spend + treasury
│   ├── ReputationManager.sol   ← Buyer XP, merchant score, ERC1155 badges
│   ├── CommerceCore.sol        ← Main contract (orders, disputes, risk scoring)
│   └── MockUSDC.sol            ← Test USDC token (6 decimals)
├── scripts/
│   └── deploy.js               ← Full deployment + role wiring + smoke test
├── hardhat.config.js
└── README.md
```

---

## 🚀 Quick Start (Local Hardhat)

### 1. Install dependencies

```bash
npm init -y
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
npm install @openzeppelin/contracts@4.9.6
```

> ⚠️ Use **OpenZeppelin v4.9.6** (not v5) — fully compatible with solc 0.8.24

### 2. Copy files and compile

```bash
npx hardhat compile
```

### 3. Run local node + deploy

```bash
# Terminal 1
npx hardhat node

# Terminal 2
npx hardhat run scripts/deploy.js --network localhost
```

The deploy script will:
- Deploy all 5 contracts in correct order
- Wire COMMERCE_ROLE on EscrowLogic + ReputationManager → CommerceCore
- Grant BOT_ROLE and MERCHANT_ROLE to test wallets
- Run a full smoke test (create order, check XP, set risk score)

---

## 🏗️ Architecture

```
                        ┌─────────────────┐
                        │  ConfigManager  │  ← admin editable on-chain config
                        └────────┬────────┘
                                 │ reads config
          ┌──────────────────────▼──────────────────────┐
          │               CommerceCore                   │
          │  createOrder / cancelOrder / releaseEscrow   │
          │  raiseDispute / resolveDispute               │
          │  setRiskScore (BOT_ROLE only)                │
          │  deliverDigitalProduct (MERCHANT_ROLE only)  │
          └──────┬───────────────────────┬───────────────┘
                 │ COMMERCE_ROLE          │ COMMERCE_ROLE
     ┌───────────▼──────────┐   ┌────────▼──────────────┐
     │     EscrowLogic      │   │   ReputationManager   │
     │  lockFunds           │   │  awardXP              │
     │  releaseFunds        │   │  getBuyerTier         │
     │  refundFunds         │   │  updateMerchantScore  │
     │  trackDailySpend     │   │  mintTierBadge (ERC1155)│
     │  withdrawTreasury    │   └───────────────────────┘
     └──────────────────────┘
```

---

## 👥 Roles

| Role | Permissions |
|------|-------------|
| `DEFAULT_ADMIN_ROLE` | Full control — grant/revoke any role |
| `ADMIN_ROLE` | releaseEscrow, resolveDispute, completeOrder, withdrawTreasury |
| `BOT_ROLE` | **Only** `setRiskScore()` — nothing else |
| `MERCHANT_ROLE` | `deliverDigitalProduct()` |
| `COMMERCE_ROLE` | Internal — granted to CommerceCore on sub-contracts |

---

## 📋 Order Lifecycle

```
createOrder()
    │
    ├─ amount < adminApprovalThreshold?
    │       YES → auto-complete → releaseFunds() + awardXP()
    │       NO  → PENDING (escrow held, admin review)
    │
    ├─ buyer: raiseDispute()  [within refundWindow]
    │       → DISPUTED
    │       → admin: resolveDispute(favorBuyer=true)  → refundFunds()
    │       → admin: resolveDispute(favorBuyer=false) → releaseFunds()
    │
    ├─ admin: releaseEscrow() → releaseFunds() + awardXP()
    │
    └─ buyer/admin: cancelOrder() → refundFunds()
```

---

## ⚙️ Default Config Values (set in deploy.js)

| Parameter | Value |
|-----------|-------|
| `dailySpendLimit` | 1,000 USDC |
| `adminApprovalThreshold` | 500 USDC (above this → manual escrow) |
| `platformFeeBps` | 250 (2.5%) |
| `refundWindow` | 7 days |

All values are changeable on-chain by ADMIN_ROLE via `ConfigManager`.

---

## 🏆 Reputation System

### Buyer XP & Tiers
| Tier | XP Required | Badge Token ID |
|------|-------------|---------------|
| Bronze | 0 XP | 0 |
| Silver | 100 XP | 1 |
| Gold | 500 XP | 2 |

- Each completed order awards **10 XP** to buyer
- Tier upgrade automatically mints an **ERC1155 NFT badge**

### Merchant Score
- Score = `(totalOrders - disputes) / totalOrders × 100`
- Range: 0–100
- Updated after every settled order

---

## 🔒 Security Features

- **ReentrancyGuard** on all fund-moving functions
- **SafeERC20** for all USDC transfers
- **Daily spend limit** per buyer wallet (resets at midnight UTC, timestamp-based)
- **Admin approval threshold** — large orders go into escrow automatically
- **BOT_ROLE** strictly limited to `setRiskScore()` via role-based access
- **Merchant verification** is entirely off-chain (no on-chain attack surface)
- **Platform fee** max capped at 10% in ConfigManager

---

## 📡 Events Reference

```solidity
event OrderCreated(uint256 indexed orderId, address indexed buyer, address indexed merchant, uint256 amount);
event OrderCompleted(uint256 indexed orderId);
event OrderCancelled(uint256 indexed orderId);
event OrderDisputed(uint256 indexed orderId, address indexed buyer);
event DisputeResolved(uint256 indexed orderId, bool favorBuyer);
event RiskScoreSet(uint256 indexed orderId, uint8 score);
event DigitalProductDelivered(uint256 indexed orderId, bytes32 contentHash);
event XPAwarded(address indexed buyer, uint256 amount);
event TierUpgraded(address indexed buyer, string tier);
event TierBadgeMinted(address indexed wallet, uint8 tier);
event MerchantScoreUpdated(address indexed merchant, uint256 newScore);
event FundsLocked(uint256 indexed orderId, uint256 amount);
event FundsReleased(uint256 indexed orderId, address merchant, uint256 amount);
event FundsRefunded(uint256 indexed orderId, address buyer, uint256 amount);
event TreasuryWithdrawn(address indexed to, uint256 amount);
```
