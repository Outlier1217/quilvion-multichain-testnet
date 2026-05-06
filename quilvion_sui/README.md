# Quilvion — On-Chain Commerce Protocol

**Network:** Sui Blockchain (Move 2024)  
**Token:** USDC (6 decimals — 1 USDC = 1,000,000 micro-units)  
**Status:** Deployed on Sui Testnet ✅  
**Deploy Tx:** `7baUq6X3g3w1vgB4mEDY13TghjUf2euJEMGZAfeeD7Dc`  
**Explorer:** https://suiscan.xyz/testnet/tx/7baUq6X3g3w1vgB4mEDY13TghjUf2euJEMGZAfeeD7Dc

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Module Reference](#module-reference)
   - [access_control](#access_control)
   - [config_manager](#config_manager)
   - [escrow_logic](#escrow_logic)
   - [commerce_core](#commerce_core)
   - [reputation_manager](#reputation_manager)
   - [events](#events)
   - [mock_usdc](#mock_usdc)
4. [Order Lifecycle](#order-lifecycle)
5. [Role System](#role-system)
6. [Fee Model](#fee-model)
7. [Dispute Resolution](#dispute-resolution)
8. [Reputation & Badges](#reputation--badges)
9. [Configuration Defaults](#configuration-defaults)
10. [Shared Object Addresses](#shared-object-addresses)
11. [Test Coverage](#test-coverage)
12. [Error Codes](#error-codes)
13. [Integration Guide](#integration-guide)

---

## Overview

Quilvion is a decentralized commerce protocol built in Move on the Sui blockchain. It enables trustless buying and selling of digital products by locking payment in escrow at order creation, enforcing configurable platform rules (fees, spend limits, refund windows), and automating settlement or refund based on the outcome of each transaction.

Key capabilities:

- **USDC escrow** — funds are locked at order creation and released only upon settlement, cancellation, or dispute resolution
- **Role-based access control** — four roles (DEFAULT_ADMIN, ADMIN, BOT, MERCHANT) gate all privileged operations
- **Platform fee** — a configurable basis-point fee is deducted on every successful settlement and accumulated in a treasury
- **Dispute system** — buyers may open disputes within a configurable refund window; admins resolve in favor of buyer (full refund) or merchant (fee-deducted payout)
- **AI fraud scoring** — a BOT role can write a 0–100 risk score on any order on-chain
- **Reputation engine** — buyers earn XP and tier badges per completed order; merchants maintain a score that rises or falls with each settlement outcome
- **Daily spend cap** — per-wallet daily USDC spend is tracked and enforced against a global limit

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     commerce_core                       │
│  create_order · release_escrow · cancel_order           │
│  raise_dispute · resolve_dispute · deliver_digital      │
│  set_risk_score                                         │
└───────┬─────────────┬──────────────┬────────────────────┘
        │             │              │
        ▼             ▼              ▼
  escrow_logic   reputation_    config_manager
  (funds lock,   manager        (fees, limits,
   treasury,     (XP, tiers,    windows)
   daily spend)  badges)
        │
        ▼
  access_control
  (roles gate)
        │
        ▼
    events
  (on-chain log)
```

All core shared objects are created at deploy time and passed by reference into every entry function. There are no admin-owned objects required at call time beyond the caller's wallet.

---

## Module Reference

### `access_control`

Manages role-based permissions. A single shared `RoleManager` object stores a mapping of `address → vector<role_bytes>`.

**Roles**

| Constant | Bytes | Description |
|---|---|---|
| `ROLE_DEFAULT_ADMIN` | `b"DEFAULT_ADMIN_ROLE"` | Deployer; can grant/revoke any role |
| `ROLE_ADMIN` | `b"ADMIN_ROLE"` | Can release escrow, resolve disputes, withdraw treasury, update config |
| `ROLE_BOT` | `b"BOT_ROLE"` | Can write risk scores on orders |
| `ROLE_MERCHANT` | `b"MERCHANT_ROLE"` | Can deliver digital products; flagged as verified on orders |

**Entry Functions**

```
grant_role(role_manager, account, role, ctx)
revoke_role(role_manager, account, role, ctx)
```

Both require `DEFAULT_ADMIN_ROLE`. Granting a role that already exists aborts with `ERoleAlreadyGranted`. Revoking a non-existent role aborts with `ERoleNotGranted`.

**View Functions**

```
has_role(role_manager, account, role): bool
is_admin(role_manager, account): bool   // ADMIN or DEFAULT_ADMIN
is_bot(role_manager, account): bool
is_merchant(role_manager, account): bool
```

---

### `config_manager`

Stores all runtime parameters that govern the protocol. All values are adjustable by admins without redeploying.

**Shared Object:** `ConfigManager`

**Parameters**

| Parameter | Default | Description |
|---|---|---|
| `platform_fee_bps` | 250 (2.5%) | Fee deducted on settlement, in basis points |
| `admin_approval_threshold` | 500,000,000 (500 USDC) | Orders above this amount require admin release |
| `daily_spend_limit` | 1,000,000,000 (1,000 USDC) | Max USDC a wallet may spend in 24 hours |
| `refund_window_seconds` | 604,800 (7 days) | Window after order creation in which buyer may dispute |
| `verification_expiry_seconds` | 31,536,000 (1 year) | Merchant verification validity period |

**Setter Functions** (all require `ADMIN_ROLE`)

```
set_platform_fee(config, bps, role_manager, ctx)
set_admin_approval_threshold(config, amount, role_manager, ctx)
set_daily_spend_limit(config, amount, role_manager, ctx)
set_refund_window(config, seconds, role_manager, ctx)
set_verification_expiry(config, seconds, role_manager, ctx)
```

**View Functions**

```
get_platform_fee_bps(config): u16
get_admin_approval_threshold(config): u64
get_daily_spend_limit(config): u64
get_refund_window(config): u64
get_verification_expiry(config): u64
```

---

### `escrow_logic`

Holds the actual USDC funds for every order. Each order gets an `EscrowRecord` keyed by `order_id` inside a shared `EscrowManager`. Platform fees accumulate in a `Balance<USDC>` treasury field.

**Shared Object:** `EscrowManager`

**Core Operations**

```
lock_funds(escrow_manager, order_id, merchant, buyer, Coin<USDC>, clock, ctx)
release_funds_with_fee(escrow_manager, order_id, fee_bps, ctx): (u64, u64)
refund_funds(escrow_manager, order_id, ctx)
release_funds(escrow_manager, order_id, ctx): u64
```

**Treasury**

```
withdraw_treasury(escrow_manager, amount, recipient, role_manager, ctx)
treasury_balance(escrow_manager): u64
```

**Daily Spend Tracking**

```
track_daily_spend(escrow_manager, wallet, amount, config, clock)
get_daily_spent(escrow_manager, wallet, clock): u64
reset_daily_spend(escrow_manager, wallet, role_manager, ctx)
```

---

### `commerce_core`

The primary entry-point module. Orchestrates orders by calling into `escrow_logic`, `reputation_manager`, `config_manager`, and `access_control`.

**Shared Object:** `CommerceCore`

**Order Status Constants**

| Value | Constant | Meaning |
|---|---|---|
| 0 | `ORDER_STATUS_PENDING` | Funds locked, awaiting action |
| 1 | `ORDER_STATUS_COMPLETED` | Auto-completed (digital + below threshold) |
| 2 | `ORDER_STATUS_DISPUTED` | Buyer raised a dispute |
| 3 | `ORDER_STATUS_CANCELLED` | Order cancelled, buyer refunded |
| 4 | `ORDER_STATUS_ESCROW_RELEASED` | Admin released escrow to merchant |
| 5 | `ORDER_STATUS_REFUNDED` | Dispute resolved in buyer's favor |

**Entry Functions**

```
create_order(core, escrow_manager, config, rep_manager, role_manager, product_id, merchant_wallet, product_type, Coin<USDC>, clock, ctx)
release_escrow(core, escrow_manager, rep_manager, config, role_manager, order_id, clock, ctx)
cancel_order(core, escrow_manager, role_manager, order_id, ctx)
deliver_digital_product(core, role_manager, order_id, content_hash, ctx)
raise_dispute(core, config, order_id, clock, ctx)
resolve_dispute(core, escrow_manager, rep_manager, config, role_manager, order_id, favor_buyer, clock, ctx)
set_risk_score(core, role_manager, order_id, score, ctx)
```

**View Functions**

```
get_order_risk_score(core, order_id): u8
get_order_fee(core, order_id): u64
get_order_status(core, order_id): u8
```

---

### `reputation_manager`

Tracks buyer XP/tiers and merchant quality scores.

**Buyer Tiers**

| XP Threshold | Tier |
|---|---|
| 0 – 99 | Bronze |
| 100 – 499 | Silver |
| 500+ | Gold |

**Merchant Score**

| Event | Score Delta |
|---|---|
| Order settled without dispute | +5 (capped at 100) |
| Dispute resolved against merchant | −20 (floored at 0) |

**View Functions**

```
get_buyer_xp(rep_manager, wallet): u64
get_buyer_tier(rep_manager, wallet): vector<u8>
get_merchant_score(rep_manager, wallet): u64
get_merchant_order_count(rep_manager, wallet): u64
```

---

### `events`

| Event | Fields | Emitted When |
|---|---|---|
| `OrderCreated` | order_id, buyer, merchant, amount | Order is created |
| `OrderCompleted` | order_id | Order settles |
| `OrderDisputed` | order_id, buyer | Buyer raises dispute |
| `DisputeResolved` | order_id, favor_buyer | Admin resolves dispute |
| `RiskScoreSet` | order_id, score | BOT sets fraud score |
| `XPAwarded` | buyer, amount | XP awarded to buyer |
| `TierUpgraded` | buyer, tier | Buyer crosses XP threshold |
| `TierBadgeMinted` | wallet, tier | Badge minted for wallet |

---

### `mock_usdc`

Fake USDC for local development only. Mimics Circle's USDC interface (module `usdc`, struct `USDC`, 6 decimals). Do **not** use on mainnet.

---

## Order Lifecycle

```
create_order()
     │
     ├─ [digital + amount < threshold] ──► auto complete_order()
     │                                     fee deducted, XP awarded, COMPLETED
     │
     └─ [all other cases] ────────────────► PENDING
                                               │
              ┌────────────────────────────────┼──────────────────────┐
              ▼                                ▼                      ▼
       cancel_order()                   raise_dispute()       release_escrow()
       full refund, CANCELLED           DISPUTED              fee deducted, ESCROW_RELEASED
                                               │
                                     resolve_dispute()
                                    ┌──────────┴──────────┐
                                    ▼                     ▼
                              favor_buyer=true      favor_buyer=false
                              full refund           merchant paid - fee
                              REFUNDED              ESCROW_RELEASED
```

---

## Role System

| Operation | Required Role |
|---|---|
| Grant / revoke roles | DEFAULT_ADMIN |
| Update config parameters | ADMIN or DEFAULT_ADMIN |
| Release escrow | ADMIN or DEFAULT_ADMIN |
| Resolve disputes | ADMIN or DEFAULT_ADMIN |
| Withdraw treasury | ADMIN or DEFAULT_ADMIN |
| Set risk score on order | BOT |
| Deliver digital product | MERCHANT (must match order.merchant) |
| Cancel order | Buyer or ADMIN/DEFAULT_ADMIN |
| Raise dispute | Buyer only |
| Create order | Any wallet |

---

## Fee Model

```
fee_amount      = total_payment * platform_fee_bps / 10,000
merchant_payout = total_payment - fee_amount
```

**Example** — 150 USDC order at 2.5% fee:
```
fee_amount      = 150,000,000 * 250 / 10,000 = 3,750,000  (3.75 USDC)
merchant_payout = 150,000,000 - 3,750,000   = 146,250,000 (146.25 USDC)
```

No fee is charged on cancellations or buyer-favored dispute refunds.

---

## Dispute Resolution

1. **Buyer calls `raise_dispute`** — valid only if `PENDING`, not already disputed, and within `refund_window_seconds`
2. **Admin calls `resolve_dispute`** with `favor_buyer: bool`:
   - `true` → full refund to buyer; merchant score −20; status = `REFUNDED`
   - `false` → merchant paid minus fee; buyer earns XP; merchant score +5; status = `ESCROW_RELEASED`

---

## Reputation & Badges

Every completed order awards 10 XP to the buyer. Tier is recalculated after each award.

Badge minting via `mint_tier_badge` is idempotent — a wallet already holding a tier badge will not receive a duplicate.

---

## Configuration Defaults

| Parameter | Default Value | Unit |
|---|---|---|
| `platform_fee_bps` | 250 | Basis points (2.5%) |
| `admin_approval_threshold` | 500,000,000 | USDC micro-units (500 USDC) |
| `daily_spend_limit` | 1,000,000,000 | USDC micro-units (1,000 USDC) |
| `refund_window_seconds` | 604,800 | Seconds (7 days) |
| `verification_expiry_seconds` | 31,536,000 | Seconds (1 year) |

---

## Shared Object Addresses

### Sui Testnet (Active) ✅

| Object | Address |
|---|---|
| **Package** | `0x08d8ad38d8f4c3f5c2418f2d3d6074b6c01ad5e4be24d0087e55669b22db63c8` |
| **CommerceCore** | `0x9e0912ec621c42ba0dd5845829ae2780cd08acb185a60ef100a7f7b9857866ac` |
| **EscrowManager** | `0x8d84f92239f429f7ab4b1fc15c86c8831f024fc572e7226385c67a23d51b54d7` |
| **ConfigManager** | `0xb75738cce91d139ed6f2f5410b285948524e0abc029343fe606e4e03e8c34155` |
| **RoleManager** | `0x8d3937e563e21314cff23286fa3849bce952c3a4744b0669222765ff4643f30a` |
| **ReputationManager** | `0x1b4e4788e188f670d2ac7a0c524d2ea8f5a0cec72b44bb4ab678732ea66ce22b` |
| **BadgeManager** | `0x1c69c03d026dcb155b29550c6c916494d7786b3d1b5ce723ed2a6a1b74e89eae` |
| **TreasuryCap (mock USDC)** | `0x15e7d6512072b3e04a99308a6189d2a2abcc53a5318f73c2514a59f9d970e629` |
| **Deploy Tx** | `7baUq6X3g3w1vgB4mEDY13TghjUf2euJEMGZAfeeD7Dc` |

> View on Sui Explorer: https://suiscan.xyz/testnet/object/0x08d8ad38d8f4c3f5c2418f2d3d6074b6c01ad5e4be24d0087e55669b22db63c8

### Sui Localnet (Testing History)

| Object | Address |
|---|---|
| Package | `0x71cb5a24592aa9f73c8833773357b5f4c367526d11e5ff8e67e0865dd4055d3d` |
| CommerceCore | `0x618f8390607769e10b7adb0eed821cb65bd6196c30b732ada5125f0e30ca3cc1` |
| EscrowManager | `0x825cfd97894b735da0945989945c63a9df5e2aec82da756920aa3cec3ea0842a` |

---

## Test Coverage

The final test suite (`test_final.sh`) executes 21 transactions across 8 groups, all passing on localnet.

| Group | Scenario | Result |
|---|---|---|
| 1 | Config Manager — set fee, threshold, spend limit, refund window | ✅ |
| 2 | Escrow + Admin Release — 150 USDC → risk scored (20) → admin release, 3.75 USDC fee | ✅ |
| 3 | Dispute → Buyer Wins — 120 USDC → dispute → full refund | ✅ |
| 4 | Dispute → Merchant Wins — 110 USDC → dispute → merchant paid, 2.75 USDC fee | ✅ |
| 5 | Cancel Order — 130 USDC → cancelled → full refund, no fee | ✅ |
| 6 | Digital Delivery — 200 USDC → IPFS hash stored on-chain | ✅ |
| 7 | Treasury Withdraw — admin withdraws 6 USDC accumulated fees | ✅ |
| 8 | Reputation & Badges — Bronze, Silver, Gold badges minted | ✅ |

**Result: 21/21 PASSED**

---

## Error Codes

### `commerce_core`

| Code | Constant | Condition |
|---|---|---|
| 1 | `ENotMerchant` | Caller is not the order's merchant |
| 2 | `ENotBuyer` | Caller is not the order's buyer |
| 3 | `EOrderNotFound` | order_id does not exist |
| 4 | `EInvalidStatus` | Order status does not allow this operation |
| 5 | `EDisputeTooLate` | Refund window has expired |
| 6 | `EAlreadyDisputed` | Order already has a dispute |
| 7 | `ENotAuthorized` | Caller lacks the required role |
| 8 | `EOrderNotPending` | Order status is not PENDING |

### `escrow_logic`

| Code | Constant | Condition |
|---|---|---|
| 1 | `EOrderNotFound` | Escrow record not found |
| 2 | `EOrderAlreadyReleased` | Funds already released |
| 4 | `EDailyLimitExceeded` | Daily USDC spend limit exceeded |
| 5 | `EInvalidAmount` | Payment amount is zero |
| 6 | `ENotAuthorized` | Caller lacks ADMIN role |
| 7 | `EInsufficientTreasury` | Treasury balance less than requested |

### `access_control`

| Code | Constant | Condition |
|---|---|---|
| 1 | `ENotAuthorized` | Caller lacks DEFAULT_ADMIN_ROLE |
| 2 | `ERoleAlreadyGranted` | Role already assigned to address |
| 3 | `ERoleNotGranted` | Role not found on address |

### `config_manager`

| Code | Constant | Condition |
|---|---|---|
| 1 | `ENotAuthorized` | Caller lacks ADMIN role |
| 2 | `EInvalidBasisPoints` | fee_bps > 10,000 |

---

## Integration Guide

### Frontend — Placing an Order

```typescript
// 1. Split USDC coin to exact order amount
const [coin] = txb.splitCoins(txb.object(usdcCoinId), [txb.pure(orderAmountMicro)]);

// 2. Call create_order
txb.moveCall({
  target: `${PACKAGE_ID}::commerce_core::create_order`,
  arguments: [
    txb.object(COMMERCE_CORE),
    txb.object(ESCROW_MANAGER),
    txb.object(CONFIG_MANAGER),
    txb.object(REP_MANAGER),
    txb.object(ROLE_MANAGER),
    txb.pure(productId),
    txb.pure(merchantWallet),
    txb.pure(0), // PRODUCT_TYPE_DIGITAL
    coin,
    txb.object(CLOCK),
  ],
});
```

### Admin — Releasing Escrow

```bash
sui client call \
  --package $PKG --module commerce_core --function release_escrow \
  --args $COMMERCE_CORE $ESCROW_MANAGER $REP_MANAGER $CONFIG_MANAGER $ROLE_MANAGER \
         <order_id> $CLOCK \
  --gas-budget 50000000
```

### Admin — Withdrawing Treasury

```bash
sui client call \
  --package $PKG --module escrow_logic --function withdraw_treasury \
  --args $ESCROW_MANAGER <amount_micro_usdc> <recipient_address> $ROLE_MANAGER \
  --gas-budget 10000000
```

### USDC Micro-Unit Reference

| USDC | Micro-units |
|---|---|
| 1 USDC | 1,000,000 |
| 10 USDC | 10,000,000 |
| 100 USDC | 100,000,000 |
| 500 USDC | 500,000,000 |
| 1,000 USDC | 1,000,000,000 |

---

*Quilvion Protocol — built on Sui Move 2024 · Testnet deployed ✅*