# Quilvion — On-Chain Commerce Protocol (EVM / Solidity)

**Language:** Solidity `^0.8.24`  
**Standards:** OpenZeppelin AccessControl · ERC1155 · ERC20 · ReentrancyGuard  
**Token:** USDC (6 decimals — 1 USDC = 1,000,000 units)  
**License:** MIT

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Contract Reference](#contract-reference)
   - [CommerceCore](#commercecore)
   - [EscrowLogic](#escrowlogic)
   - [ConfigManager](#configmanager)
   - [ReputationManager](#reputationmanager)
   - [MockUSDC](#mockusdc)
4. [Role System](#role-system)
5. [Order Lifecycle](#order-lifecycle)
6. [Fee Model](#fee-model)
7. [Dispute Resolution](#dispute-resolution)
8. [Reputation & NFT Badges](#reputation--nft-badges)
9. [Events Reference](#events-reference)
10. [Deployment Guide](#deployment-guide)
11. [Integration Guide](#integration-guide)
12. [Error Reference](#error-reference)
13. [Security Considerations](#security-considerations)

---

## Overview

Quilvion is a decentralized commerce protocol on EVM-compatible chains. It enables trustless buying and selling of digital products by routing payment through an escrow contract at order creation, enforcing configurable platform rules (fees, spend limits, refund windows), and settling automatically or via admin review based on the outcome of each transaction.

**Key capabilities:**

- **USDC escrow** — funds flow from buyer → EscrowLogic at order creation and are released only on settlement, cancellation, or dispute resolution
- **Role-based access control** — OpenZeppelin `AccessControl` gates every privileged operation across four roles
- **Platform fee** — a configurable basis-point fee is deducted on every successful settlement and accumulated in a treasury within EscrowLogic
- **Auto-complete** — low-value orders (below `adminApprovalThreshold`) settle automatically at creation; high-value orders wait for admin review
- **Dispute system** — buyers may raise disputes within `refundWindow`; admins resolve in favor of buyer (full refund) or merchant (fee-deducted payout)
- **AI risk scoring** — a BOT role can record a 0–100 fraud score on any order on-chain
- **Reputation engine** — buyers earn XP and ERC1155 NFT tier badges; merchants maintain a quality score calculated from dispute ratio
- **Daily spend cap** — per-wallet daily USDC spend is tracked and enforced within EscrowLogic

---

## Architecture

```
                         ┌─────────────────────────────┐
    Buyer / Admin ───────►        CommerceCore          │
                         │  createOrder                 │
                         │  releaseEscrow               │
                         │  cancelOrder                 │
                         │  raiseDispute                │
                         │  resolveDispute              │
                         │  deliverDigitalProduct       │
                         │  setRiskScore                │
                         └───────┬───────────┬──────────┘
                                 │           │
                    ┌────────────▼──┐   ┌────▼──────────────┐
                    │  EscrowLogic  │   │ ReputationManager  │
                    │  lockFunds    │   │ awardXP            │
                    │  releaseFunds │   │ updateMerchant     │
                    │  refundFunds  │   │ mintTierBadge      │
                    │  treasury     │   │ (ERC1155 NFTs)     │
                    │  dailySpend   │   └────────────────────┘
                    └──────┬────────┘
                           │
                    ┌──────▼────────┐
                    │ ConfigManager │
                    │ fee · limit   │
                    │ threshold     │
                    │ refundWindow  │
                    └───────────────┘
```

`CommerceCore` is the only public-facing contract. `EscrowLogic` and `ReputationManager` restrict their sensitive functions to `COMMERCE_ROLE`, which is granted exclusively to the `CommerceCore` address at deployment. End users never call `EscrowLogic` or `ReputationManager` directly.

---

## Contract Reference

### `CommerceCore`

The single entry-point for all user and admin interactions. Inherits `AccessControl` and `ReentrancyGuard`.

**Immutable references set at construction:**

| Variable | Type | Description |
|---|---|---|
| `usdc` | `IERC20` | The USDC token contract |
| `config` | `ConfigManager` | Runtime configuration |
| `escrow` | `EscrowLogic` | Fund custody and daily tracking |
| `reputation` | `ReputationManager` | XP, tiers, and merchant scores |

#### `OrderStatus` Enum

| Value | Name | Description |
|---|---|---|
| 0 | `PENDING` | Created, funds locked in escrow |
| 1 | `COMPLETED` | Settled — auto or admin released |
| 2 | `CANCELLED` | Cancelled before fulfillment, buyer refunded |
| 3 | `DISPUTED` | Buyer raised a dispute |
| 4 | `RESOLVED_BUYER` | Dispute resolved — buyer refunded |
| 5 | `RESOLVED_MERCHANT` | Dispute resolved — merchant paid |

#### `Order` Struct

```solidity
struct Order {
    uint256     id;
    address     buyer;
    address     merchantWallet;
    uint256     amount;              // USDC amount (6 decimals)
    OrderStatus status;
    bool        isMerchantVerified;  // off-chain KYC flag from frontend
    bool        requiresEscrow;      // true when amount >= adminApprovalThreshold
    bool        disputeRaised;
    uint256     createdAt;           // block.timestamp at creation
    bytes32     contentHash;         // IPFS/content hash for digital delivery
    uint8       riskScore;           // AI fraud score 0–100, set by BOT_ROLE
}
```

#### Public Functions

---

**`createOrder(address merchantWallet, uint256 amount, bool isMerchantVerified)`**

Creates a new order and locks USDC in escrow.

- Caller must have approved `CommerceCore` to spend `amount` USDC before calling
- Calls `escrow.trackDailySpend` — reverts if the buyer's daily USDC cap is exceeded
- Transfers USDC from buyer → `EscrowLogic` via `safeTransferFrom`
- Sets `requiresEscrow = true` when `amount >= config.adminApprovalThreshold()`
- **Auto-completes** the order immediately if `requiresEscrow == false`
- Emits `OrderCreated`

Returns: `orderId` (incrementing `uint256` starting at 0)

---

**`releaseEscrow(uint256 orderId)`** — `ADMIN_ROLE`

Manually releases escrowed funds to the merchant for high-value orders. Order must be `PENDING` and `requiresEscrow == true`. Triggers fee deduction, XP award, and merchant score update. Emits `OrderCompleted`.

---

**`completeOrder(uint256 orderId)`** — `ADMIN_ROLE`

Admin-triggered manual completion for any `PENDING` order. Equivalent to auto-complete but callable on demand.

---

**`cancelOrder(uint256 orderId)`**

Cancels a `PENDING` order and refunds the full USDC amount to the buyer. Callable by the buyer or any address with `ADMIN_ROLE`. No fee is charged on cancellation. Emits `OrderCancelled`.

---

**`deliverDigitalProduct(uint256 orderId, bytes32 contentHash)`** — `MERCHANT_ROLE`

Records an IPFS CID or other content hash on-chain for the order. If `requiresEscrow == false` and no dispute has been raised, the order auto-completes after delivery. Reverts on `bytes32(0)` hash. Emits `DigitalProductDelivered`.

---

**`raiseDispute(uint256 orderId)`** — buyer only

Moves order from `PENDING` to `DISPUTED`. Requires:
- Caller is the order's buyer
- Order status is `PENDING`
- `block.timestamp <= order.createdAt + config.refundWindow()`

Emits `OrderDisputed`.

---

**`resolveDispute(uint256 orderId, bool favorBuyer)`** — `ADMIN_ROLE`

Resolves a `DISPUTED` order:
- `favorBuyer = true` → status `RESOLVED_BUYER`, full USDC refunded, merchant score updated with dispute flag
- `favorBuyer = false` → status `RESOLVED_MERCHANT`, USDC minus fee sent to merchant, buyer earns XP, merchant score updated

Emits `DisputeResolved`.

---

**`setRiskScore(uint256 orderId, uint8 score)`** — `BOT_ROLE`

Writes an AI-generated fraud score (0–100) to the order. Score must be ≤ 100. Emits `RiskScoreSet`.

---

**`withdrawTreasury(address to)`** — `ADMIN_ROLE`

Withdraws all accumulated platform fees from `EscrowLogic` to the specified address.

---

**View Functions**

```solidity
getOrder(uint256 orderId) external view returns (Order memory)
getOrderRiskScore(uint256 orderId) external view returns (uint8)
totalOrders() external view returns (uint256)
```

---

### `EscrowLogic`

Holds all USDC locked for active orders and accumulates platform fees in `treasuryBalance`. Only callable by `CommerceCore` (via `COMMERCE_ROLE`) except for admin-only management functions.

**Key State**

```solidity
mapping(uint256 => uint256) private lockedFunds;     // orderId → locked USDC
mapping(uint256 => address) private orderMerchant;   // orderId → merchant
mapping(uint256 => address) private orderBuyer;      // orderId → buyer
mapping(address => uint256) private dailySpent;      // wallet → USDC spent today
mapping(address => uint256) private lastSpendDay;    // wallet → last reset day
uint256 public treasuryBalance;                      // accumulated fees
```

#### Fund Lifecycle Functions (COMMERCE_ROLE only)

**`lockFunds(uint256 orderId, uint256 amount, address merchant, address buyer)`**

Records the escrow for a given order. Called immediately after USDC is transferred to `EscrowLogic` by `CommerceCore`. Reverts if `orderId` already has locked funds.

---

**`releaseFunds(uint256 orderId)`**

Calculates and deducts the platform fee, adds it to `treasuryBalance`, and transfers the remainder to the merchant via `safeTransfer`. Emits `FundsReleased`.

```
fee           = lockedAmount * platformFeeBps / 10,000
merchantPayout = lockedAmount - fee
```

---

**`refundFunds(uint256 orderId)`**

Returns the full locked USDC amount to the buyer with no fee deduction. Emits `FundsRefunded`.

---

#### Daily Spend Tracking

**`trackDailySpend(address wallet, uint256 amount)`** — `COMMERCE_ROLE`

Called by `CommerceCore` during `createOrder`. Automatically resets the wallet's daily counter at UTC midnight (based on `block.timestamp / 1 days`). Reverts with `"EscrowLogic: daily spend limit exceeded"` if the new total would exceed `config.dailySpendLimit()`.

**`getDailySpent(address wallet)`** — view

Returns the wallet's USDC spent today. Returns 0 if the last recorded day is before today.

**`resetDailySpend(address wallet)`** — `ADMIN_ROLE`

Manually resets a wallet's daily counter.

---

#### Treasury

**`withdrawTreasury(address to)`** — `ADMIN_ROLE`

Withdraws the entire `treasuryBalance` to `to`. Reverts if balance is zero. Emits `TreasuryWithdrawn`.

**`getLockedFunds(uint256 orderId)`** — view

Returns the currently locked USDC amount for an order (0 after settlement).

---

### `ConfigManager`

Stores all runtime protocol parameters. Every setter is restricted to `ADMIN_ROLE` and emits an event.

**Constructor Parameters**

```solidity
constructor(
    address defaultAdmin,
    uint256 _dailySpendLimit,        // USDC cap per wallet per day (6 decimals)
    uint256 _adminApprovalThreshold, // Orders >= this need admin release
    uint256 _platformFeeBps,         // Fee in basis points (max 1000 = 10%)
    uint256 _refundWindow            // Seconds buyer can raise dispute
)
```

**State Variables**

| Variable | Description |
|---|---|
| `dailySpendLimit` | Max USDC a wallet may spend in a single calendar day |
| `adminApprovalThreshold` | Orders at or above this amount require admin to call `releaseEscrow` |
| `platformFeeBps` | Fee charged on settlement, in basis points (250 = 2.5%) |
| `refundWindow` | Seconds after `createdAt` within which a buyer may raise a dispute |

**Setters** (all `ADMIN_ROLE`)

```solidity
setDailySpendLimit(uint256 amount)
setAdminApprovalThreshold(uint256 amount)
setPlatformFee(uint256 bps)          // max bps = 1000 (10%)
setRefundWindow(uint256 seconds_)
```

**Max Fee:** `setPlatformFee` enforces `bps <= 1000`, capping the platform fee at 10% on-chain.

---

### `ReputationManager`

Tracks buyer XP and tiers, merchant quality scores, and issues ERC1155 NFT tier badges. Inherits both `AccessControl` and `ERC1155`. Sensitive write functions require `COMMERCE_ROLE`.

#### Buyer XP & Tiers

Each settled order (completed, admin-released, or dispute resolved in merchant's favor) awards **10 XP** to the buyer.

| XP | Tier | Token ID |
|---|---|---|
| 0 – 99 | Bronze | 0 |
| 100 – 499 | Silver | 1 |
| 500+ | Gold | 2 |

On every XP award, `_checkAndUpgradeTier` compares the new calculated tier against the cached tier. If the tier has increased, a `TierUpgraded` event is emitted and `mintTierBadge` is called automatically.

**`awardXP(address buyerWallet, uint256 orderId)`** — `COMMERCE_ROLE`

Awards 10 XP, checks for tier upgrade, and mints an ERC1155 badge if a tier threshold is crossed.

**View Functions**

```solidity
getBuyerXP(address wallet) external view returns (uint256)
getBuyerTier(address wallet) external view returns (string memory) // "Bronze", "Silver", "Gold"
```

---

#### ERC1155 NFT Badges

Badges are non-duplicate — each (wallet, tier) pair can only be minted once. `hasBadgeMinted[wallet][tier]` guards against re-minting.

**`mintTierBadge(address wallet, uint8 tier)`**

Callable by `COMMERCE_ROLE` or `address(this)` (internal auto-mint on tier upgrade). Reverts if the badge was already minted for this wallet. Emits `TierBadgeMinted`.

**`hasBadge(address wallet, uint8 tier)`** — view

Returns `true` if the wallet holds the specified tier badge.

**`setURI(string memory newuri)`** — `ADMIN_ROLE`

Updates the ERC1155 metadata base URI.

---

#### Merchant Reputation

Merchant score is recalculated after every order settlement using:

```
score = (totalOrders - disputes) * 100 / totalOrders
```

This gives a 0–100 integer representing the percentage of clean (non-disputed) orders. Score starts at 100% (0 disputes) and falls as disputes accumulate.

**`updateMerchantScore(address merchantWallet, uint256 orderId, bool disputeRaised)`** — `COMMERCE_ROLE`

Increments `totalOrders`, optionally increments `disputes`, and recalculates score. Emits `MerchantScoreUpdated`.

**View Functions**

```solidity
getMerchantScore(address wallet) external view returns (uint256)
getMerchantOrderCount(address wallet) external view returns (uint256)
```

---

### `MockUSDC`

A minimal ERC20 token mimicking real USDC for local Hardhat/Foundry testing. **Do not deploy to mainnet or any public testnet.**

- **Name:** USD Coin
- **Symbol:** USDC
- **Decimals:** 6
- **Mint:** `mint(address to, uint256 amount)` — owner only

```solidity
constructor(address initialOwner) ERC20("USD Coin", "USDC") Ownable(initialOwner)
```

---

## Role System

All roles are defined as `keccak256` hashes following the OpenZeppelin `AccessControl` standard. `DEFAULT_ADMIN_ROLE` is the role admin for all other roles.

| Role | Constant | Permissions |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | OZ built-in | Grant/revoke any role; all ADMIN_ROLE permissions |
| `ADMIN_ROLE` | `keccak256("ADMIN_ROLE")` | Release escrow, resolve disputes, complete orders, cancel orders, withdraw treasury, update config, reset daily spend |
| `BOT_ROLE` | `keccak256("BOT_ROLE")` | `setRiskScore` only |
| `MERCHANT_ROLE` | `keccak256("MERCHANT_ROLE")` | `deliverDigitalProduct` only |
| `COMMERCE_ROLE` | `keccak256("COMMERCE_ROLE")` | Internal — granted to `CommerceCore`; gates `EscrowLogic` and `ReputationManager` write functions |

**Operation → Required Role**

| Operation | Caller |
|---|---|
| `createOrder` | Any wallet |
| `cancelOrder` | Order buyer or ADMIN_ROLE |
| `raiseDispute` | Order buyer only |
| `deliverDigitalProduct` | MERCHANT_ROLE |
| `setRiskScore` | BOT_ROLE |
| `releaseEscrow` | ADMIN_ROLE |
| `completeOrder` | ADMIN_ROLE |
| `resolveDispute` | ADMIN_ROLE |
| `withdrawTreasury` | ADMIN_ROLE |
| `setDailySpendLimit` | ADMIN_ROLE |
| `setAdminApprovalThreshold` | ADMIN_ROLE |
| `setPlatformFee` | ADMIN_ROLE |
| `setRefundWindow` | ADMIN_ROLE |
| `resetDailySpend` | ADMIN_ROLE |
| `setURI` | ADMIN_ROLE |
| `grant/revokeRole` | DEFAULT_ADMIN_ROLE |

---

## Order Lifecycle

```
   Buyer calls createOrder()
          │
          ├─ amount < adminApprovalThreshold ──► Auto _completeOrder()
          │                                           │
          │                                    fee deducted, merchant paid,
          │                                    buyer earns XP, status = COMPLETED
          │
          └─ amount >= adminApprovalThreshold ──► status = PENDING
                                                        │
               ┌────────────────────────────────────────┼───────────────────────────┐
               ▼                                         ▼                           ▼
         cancelOrder()                            raiseDispute()            releaseEscrow()
         (buyer or admin)                         (buyer, within window)    (admin)
               │                                        │                           │
        full refund to buyer                    status = DISPUTED          fee deducted,
        status = CANCELLED                              │                  merchant paid,
                                             resolveDispute() (admin)      status = COMPLETED
                                          ┌──────────────┴───────────────┐
                                          ▼                              ▼
                                    favorBuyer=true              favorBuyer=false
                                    full refund                  fee deducted,
                                    status = RESOLVED_BUYER      merchant paid
                                                                 status = RESOLVED_MERCHANT
```

Additionally, `deliverDigitalProduct` auto-triggers `_completeOrder` for low-value orders (where `requiresEscrow == false`) that have no active dispute at time of delivery.

---

## Fee Model

```
fee           = amount * platformFeeBps / 10,000
merchantPayout = amount - fee
```

**Example** — 150 USDC at 2.5% (250 bps):

```
fee           = 150,000,000 * 250 / 10,000 = 3,750,000  (3.75 USDC)
merchantPayout = 150,000,000 - 3,750,000  = 146,250,000 (146.25 USDC)
```

Fees accumulate in `EscrowLogic.treasuryBalance` and are withdrawable at any time by an admin via `CommerceCore.withdrawTreasury` or directly via `EscrowLogic.withdrawTreasury`. No fee is charged on cancellations or buyer-favored dispute refunds.

**Fee cap:** `ConfigManager.setPlatformFee` enforces a maximum of 1000 bps (10%) at the contract level.

---

## Dispute Resolution

1. **Buyer calls `raiseDispute(orderId)`** — valid only if:
   - Order status is `PENDING`
   - `block.timestamp <= order.createdAt + config.refundWindow()`
   - Caller is `order.buyer`
   - Status moves to `DISPUTED`

2. **Admin calls `resolveDispute(orderId, favorBuyer)`:**

   | `favorBuyer` | Fund destination | Fee | Buyer XP | Merchant Score |
   |---|---|---|---|---|
   | `true` | Full USDC → buyer | None | Not awarded | Updated with dispute flag |
   | `false` | (amount − fee) → merchant | Deducted to treasury | Awarded | Updated with dispute flag |

Both outcomes call `updateMerchantScore` with `disputeRaised = true`, decrementing the merchant's clean-order ratio.

---

## Reputation & NFT Badges

### Buyer Flow

```
createOrder → (settlement) → awardXP (+10 XP)
                                   │
                          _checkAndUpgradeTier()
                                   │
                     ┌─────────────┴──────────────┐
                     ▼                            ▼
               Tier unchanged             New tier reached
                                          TierUpgraded event
                                          mintTierBadge (ERC1155)
```

Badges are ERC1155 tokens with token IDs matching the tier constants (0 = Bronze, 1 = Silver, 2 = Gold). Each badge is minted exactly once per wallet per tier — re-minting is silently blocked by `hasBadgeMinted`.

### Merchant Scoring

Score is calculated as a live ratio after every settled order:

```
score = (totalOrders - disputes) * 100 / totalOrders
```

A merchant with 10 orders and 1 dispute scores `90`. Score drops every time a dispute is recorded (regardless of who wins the dispute — the dispute itself counts against the merchant).

---

## Events Reference

### CommerceCore

| Event | Parameters | Emitted When |
|---|---|---|
| `OrderCreated` | `orderId, buyer, merchant, amount` | Order is created |
| `OrderCompleted` | `orderId` | Order settles |
| `OrderCancelled` | `orderId` | Order is cancelled |
| `OrderDisputed` | `orderId, buyer` | Buyer raises dispute |
| `DisputeResolved` | `orderId, favorBuyer` | Admin resolves dispute |
| `RiskScoreSet` | `orderId, score` | BOT writes fraud score |
| `DigitalProductDelivered` | `orderId, contentHash` | Merchant records content hash |

### EscrowLogic

| Event | Parameters | Emitted When |
|---|---|---|
| `FundsLocked` | `orderId, amount` | Funds locked at order creation |
| `FundsReleased` | `orderId, merchant, amount` | Merchant paid (net of fee) |
| `FundsRefunded` | `orderId, buyer, amount` | Buyer refunded |
| `TreasuryWithdrawn` | `to, amount` | Admin withdraws fees |

### ConfigManager

| Event | Parameters | Emitted When |
|---|---|---|
| `DailySpendLimitSet` | `amount` | Limit updated |
| `AdminApprovalThresholdSet` | `amount` | Threshold updated |
| `PlatformFeeSet` | `bps` | Fee updated |
| `RefundWindowSet` | `seconds_` | Window updated |

### ReputationManager

| Event | Parameters | Emitted When |
|---|---|---|
| `XPAwarded` | `buyer, amount` | XP granted after order |
| `TierUpgraded` | `buyer, tier` | Buyer crosses XP threshold |
| `TierBadgeMinted` | `wallet, tier` | ERC1155 badge minted |
| `MerchantScoreUpdated` | `merchant, newScore` | Score recalculated |

---

## Deployment Guide

Deploy in the following order. Each contract after `ConfigManager` depends on the addresses of those before it.

### Step 1 — MockUSDC (testing only)

```solidity
MockUSDC usdc = new MockUSDC(deployerAddress);
```

On mainnet/testnet, use the real USDC contract address instead.

### Step 2 — ConfigManager

```solidity
ConfigManager config = new ConfigManager(
    deployerAddress,
    5_000_000_000,  // dailySpendLimit: 5,000 USDC
    100_000_000,    // adminApprovalThreshold: 100 USDC
    250,            // platformFeeBps: 2.5%
    604_800         // refundWindow: 7 days
);
```

### Step 3 — EscrowLogic

```solidity
EscrowLogic escrow = new EscrowLogic(
    address(usdc),
    address(config),
    deployerAddress
);
```

### Step 4 — ReputationManager

```solidity
ReputationManager reputation = new ReputationManager(
    deployerAddress,
    "https://your-metadata-uri/{id}.json"  // ERC1155 base URI
);
```

### Step 5 — CommerceCore

```solidity
CommerceCore core = new CommerceCore(
    address(usdc),
    address(config),
    address(escrow),
    address(reputation),
    deployerAddress
);
```

### Step 6 — Grant COMMERCE_ROLE

`CommerceCore` must be granted `COMMERCE_ROLE` on both `EscrowLogic` and `ReputationManager` so it can call their restricted functions:

```solidity
bytes32 COMMERCE_ROLE = keccak256("COMMERCE_ROLE");
escrow.grantRole(COMMERCE_ROLE, address(core));
reputation.grantRole(COMMERCE_ROLE, address(core));
```

### Step 7 — Grant Operational Roles (optional at deploy)

```solidity
bytes32 ADMIN_ROLE    = keccak256("ADMIN_ROLE");
bytes32 BOT_ROLE      = keccak256("BOT_ROLE");
bytes32 MERCHANT_ROLE = keccak256("MERCHANT_ROLE");

core.grantRole(ADMIN_ROLE, adminAddress);
core.grantRole(BOT_ROLE, botAddress);
core.grantRole(MERCHANT_ROLE, merchantAddress);
```

---

## Integration Guide

### Frontend — Placing an Order

1. Read `config.adminApprovalThreshold()` to determine if the order will require admin review
2. Read `escrow.getDailySpent(buyerAddress)` and `config.dailySpendLimit()` to display remaining daily budget
3. Approve `CommerceCore` to spend the order amount:
   ```javascript
   await usdc.approve(commerceCoreAddress, amount);
   ```
4. Call `createOrder`:
   ```javascript
   const tx = await commerceCore.createOrder(
     merchantWallet,
     amount,          // USDC in 6-decimal units
     isMerchantVerified
   );
   const receipt = await tx.wait();
   // Parse OrderCreated event to get orderId
   ```

### Frontend — Polling Order State

```javascript
const order = await commerceCore.getOrder(orderId);
// order.status: 0=PENDING, 1=COMPLETED, 2=CANCELLED, 3=DISPUTED, 4=RESOLVED_BUYER, 5=RESOLVED_MERCHANT
// order.riskScore: 0–100 (set by BOT after creation)
// order.contentHash: bytes32 (set by merchant on digital delivery)
```

### Backend Bot — Writing Risk Scores

The bot wallet must hold `BOT_ROLE`. After detecting an `OrderCreated` event, analyze the order and call:

```javascript
await commerceCore.setRiskScore(orderId, scoreValue); // scoreValue: 0–100
```

### Admin — Releasing High-Value Escrow

```javascript
await commerceCore.releaseEscrow(orderId);
```

### Admin — Resolving a Dispute

```javascript
// Favor buyer (full refund)
await commerceCore.resolveDispute(orderId, true);

// Favor merchant (fee-deducted payout)
await commerceCore.resolveDispute(orderId, false);
```

### Admin — Withdrawing Platform Fees

```javascript
await commerceCore.withdrawTreasury(recipientAddress);
// Alternatively, query treasury balance first:
const balance = await escrow.treasuryBalance();
```

### USDC Unit Reference

| USDC | `uint256` value |
|---|---|
| 1 USDC | 1,000,000 |
| 10 USDC | 10,000,000 |
| 100 USDC | 100,000,000 |
| 500 USDC | 500,000,000 |
| 1,000 USDC | 1,000,000,000 |
| 5,000 USDC | 5,000,000,000 |

---

## Error Reference

### CommerceCore

| Revert Message | Condition |
|---|---|
| `"CommerceCore: order not found"` | `orderId >= _nextOrderId` |
| `"CommerceCore: not buyer"` | `msg.sender != order.buyer` |
| `"CommerceCore: invalid merchant"` | `merchantWallet == address(0)` |
| `"CommerceCore: amount must be > 0"` | `amount == 0` |
| `"CommerceCore: not pending"` | Order status is not `PENDING` |
| `"CommerceCore: cannot cancel"` | Order is not cancellable |
| `"CommerceCore: not authorized"` | Caller is not buyer or admin |
| `"CommerceCore: not an escrow order"` | `requiresEscrow == false` on `releaseEscrow` |
| `"CommerceCore: not disputable"` | Order not in `PENDING` state |
| `"CommerceCore: refund window expired"` | Past `createdAt + refundWindow` |
| `"CommerceCore: not disputed"` | Order not in `DISPUTED` state |
| `"CommerceCore: score must be 0-100"` | `score > 100` |
| `"CommerceCore: invalid content hash"` | `contentHash == bytes32(0)` |

### EscrowLogic

| Revert Message | Condition |
|---|---|
| `"EscrowLogic: daily spend limit exceeded"` | Buyer daily cap breached |
| `"EscrowLogic: already locked"` | Funds already recorded for this `orderId` |
| `"EscrowLogic: no funds locked"` | `lockedFunds[orderId] == 0` |
| `"EscrowLogic: nothing to withdraw"` | `treasuryBalance == 0` |

### ConfigManager

| Revert Message | Condition |
|---|---|
| `"ConfigManager: fee too high"` | `bps > 1000` |

### ReputationManager

| Revert Message | Condition |
|---|---|
| `"ReputationManager: unauthorized"` | `mintTierBadge` called by unauthorized address |
| `"ReputationManager: invalid tier"` | `tier > TIER_GOLD (2)` |
| `"ReputationManager: badge already minted"` | Wallet already holds this tier badge |

---

## Security Considerations

**Reentrancy** — `CommerceCore` inherits `ReentrancyGuard` and applies `nonReentrant` to `createOrder`, `cancelOrder`, and `resolveDispute`. All three involve external USDC transfers.

**SafeERC20** — Both `CommerceCore` and `EscrowLogic` use OpenZeppelin `SafeERC20` for all token transfers, guarding against non-standard ERC20 implementations that return `false` instead of reverting.

**COMMERCE_ROLE isolation** — `EscrowLogic` and `ReputationManager` restrict fund-moving and score-writing functions to `COMMERCE_ROLE`. This role must be granted only to the deployed `CommerceCore` address and never to EOAs.

**Daily spend reset** — The daily counter resets based on `block.timestamp / 1 days` (UTC). Miners can influence `block.timestamp` by a small margin (~15 seconds), but this is not material for daily-granularity spend windows.

**MockUSDC** — The mock token has an unrestricted `mint` function gated only by `Ownable`. It must never be used in production environments.

**Fee cap** — `ConfigManager` enforces a maximum fee of 10% (1000 bps) at the contract level, preventing accidental or malicious misconfiguration.

**Content hash validation** — `deliverDigitalProduct` rejects `bytes32(0)` hashes to prevent merchants from recording empty delivery proofs.

---

*Quilvion Protocol — EVM Edition · Solidity ^0.8.24 · OpenZeppelin v5*