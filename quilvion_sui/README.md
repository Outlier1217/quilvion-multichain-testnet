# Quilvion — On-Chain Commerce Protocol

**Network:** Sui Blockchain (Move 2024)  
**Token:** USDC (6 decimals — 1 USDC = 1,000,000 micro-units)  
**Status:** 100% test-passing on Sui localnet

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
```
Deposits the full coin into an `EscrowRecord`. The coin must be split to the exact order amount on the frontend before calling.

```
release_funds_with_fee(escrow_manager, order_id, fee_bps, ctx): (u64, u64)
```
Calculates fee = `total * fee_bps / 10000`, sends fee to treasury, sends remainder to merchant. Returns `(merchant_amount, fee_amount)`.

```
refund_funds(escrow_manager, order_id, ctx)
```
Returns the full escrowed amount to the buyer. No fee is charged.

```
release_funds(escrow_manager, order_id, ctx): u64
```
Sends full amount to merchant with no fee (legacy / dispute path).

**Treasury**

```
withdraw_treasury(escrow_manager, amount, recipient, role_manager, ctx)
treasury_balance(escrow_manager): u64
```
Only `ADMIN` or `DEFAULT_ADMIN` may withdraw. Amount is in USDC micro-units.

**Daily Spend Tracking**

```
track_daily_spend(escrow_manager, wallet, amount, config, clock)
get_daily_spent(escrow_manager, wallet, clock): u64
reset_daily_spend(escrow_manager, wallet, role_manager, ctx)    // admin only
```

The tracker resets automatically at UTC midnight. If the wallet's cumulative spend for the day plus the new order amount exceeds `daily_spend_limit`, the transaction aborts with `EDailyLimitExceeded`.

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

#### `create_order`

```move
public fun create_order(
    core, escrow_manager, config, rep_manager, role_manager,
    product_id: u64,
    merchant_wallet: address,
    product_type: u8,
    payment: Coin<USDC>,
    clock, ctx
)
```

- Checks and records daily USDC spend for the buyer
- Locks `payment` in escrow
- Marks the order's `is_verified_merchant` flag based on the merchant's current `MERCHANT_ROLE`
- **Auto-complete:** if `product_type == 0` (digital) **and** `amount < admin_approval_threshold`, the order is immediately completed in the same call, XP is awarded, and fees are deducted

#### `release_escrow`

Admin-only. Force-releases funds to merchant with fee deduction. Status moves to `ESCROW_RELEASED`. Requires `ADMIN_ROLE`.

#### `cancel_order`

Callable by the buyer or any admin. Refunds full USDC to buyer with no fee. Only valid when status is `PENDING`.

#### `deliver_digital_product`

```move
public fun deliver_digital_product(
    core, role_manager,
    order_id: u64,
    content_hash: vector<u8>,
    ctx
)
```

Requires `MERCHANT_ROLE` and the caller must be the order's merchant. Records an IPFS or other content hash on-chain in the order struct.

#### `raise_dispute`

Callable only by the buyer. Order must be `PENDING` and not yet disputed. The elapsed time since `created_at` must be within `refund_window_seconds`. Moves status to `DISPUTED`.

#### `resolve_dispute`

Admin-only.

- `favor_buyer = true` → status `REFUNDED`, full USDC returned to buyer, merchant score penalized
- `favor_buyer = false` → status `ESCROW_RELEASED`, USDC minus fee sent to merchant, buyer earns XP

#### `set_risk_score`

```move
public fun set_risk_score(core, role_manager, order_id: u64, score: u8, ctx)
```

Requires `BOT_ROLE`. Score must be 0–100. Stored on the order and emitted as an event.

**View Functions**

```
get_order_risk_score(core, order_id): u8
get_order_fee(core, order_id): u64         // USDC fee charged (0 if pending)
get_order_status(core, order_id): u8
```

---

### `reputation_manager`

Tracks buyer XP/tiers and merchant quality scores. Two shared objects are created at init: `ReputationManager` and `BadgeManager`.

**Buyer Reputation**

Each completed (or admin-released) order awards `10 XP` to the buyer.

| XP Threshold | Tier |
|---|---|
| 0 – 99 | Bronze |
| 100 – 499 | Silver |
| 500+ | Gold |

A `TierUpgraded` event is emitted whenever a buyer crosses a threshold.

**Merchant Reputation**

Merchants start at score 100.

| Event | Score Delta |
|---|---|
| Order settled without dispute | +5 (capped at 100) |
| Dispute resolved against merchant | −20 (floored at 0) |

**Badges**

```
mint_tier_badge(badge_manager, wallet, tier: u8, ctx)
has_badge(badge_manager, wallet, tier: u8): bool
```

Tier values: `0 = Bronze`, `1 = Silver`, `2 = Gold`. Badges are idempotent — minting a badge a wallet already holds is a no-op.

**View Functions**

```
get_buyer_xp(rep_manager, wallet): u64
get_buyer_tier(rep_manager, wallet): vector<u8>
get_merchant_score(rep_manager, wallet): u64
get_merchant_order_count(rep_manager, wallet): u64
```

---

### `events`

Thin wrapper around `sui::event::emit`. All structs have `copy, drop`.

| Event | Fields | Emitted When |
|---|---|---|
| `OrderCreated` | order_id, buyer, merchant, amount | Order is created |
| `OrderCompleted` | order_id | Order settles (auto or manual) |
| `OrderDisputed` | order_id, buyer | Buyer raises dispute |
| `DisputeResolved` | order_id, favor_buyer | Admin resolves dispute |
| `RiskScoreSet` | order_id, score | BOT sets fraud score |
| `XPAwarded` | buyer, amount | XP awarded to buyer |
| `TierUpgraded` | buyer, tier | Buyer crosses XP threshold |
| `TierBadgeMinted` | wallet, tier | Badge minted for wallet |

---

### `mock_usdc`

Fake USDC for local development only. Mimics Circle's USDC interface (module name `usdc`, struct name `USDC`, 6 decimals). Do **not** deploy to testnet or mainnet.

```move
public fun mint(cap: &mut TreasuryCap<USDC>, amount: u64, recipient: address, ctx)
```

---

## Order Lifecycle

```
create_order()
     │
     ├─ [digital + amount < threshold] ──► auto complete_order()
     │                                           │
     │                                    fee deducted, merchant paid,
     │                                    buyer earns XP, status = COMPLETED
     │
     └─ [all other cases] ────────────────► status = PENDING
                                                   │
                  ┌────────────────────────────────┼────────────────────────┐
                  ▼                                ▼                        ▼
           cancel_order()                   raise_dispute()         release_escrow()
           (buyer or admin)                 (buyer, within window)  (admin)
                  │                                │                        │
           full refund to buyer            status = DISPUTED         fee deducted,
           status = CANCELLED                      │                 merchant paid,
                                      resolve_dispute()             status = ESCROW_RELEASED
                                         (admin)
                                     ┌───────┴──────────┐
                                     ▼                  ▼
                               favor_buyer=true   favor_buyer=false
                               full refund        merchant paid
                               status = REFUNDED  fee deducted
                                                  status = ESCROW_RELEASED
```

---

## Role System

All privileged operations gate on roles stored in `RoleManager`. The deployer wallet automatically receives `DEFAULT_ADMIN_ROLE` at init.

| Operation | Required Role |
|---|---|
| Grant / revoke roles | DEFAULT_ADMIN |
| Update config parameters | ADMIN or DEFAULT_ADMIN |
| Release escrow | ADMIN or DEFAULT_ADMIN |
| Resolve disputes | ADMIN or DEFAULT_ADMIN |
| Withdraw treasury | ADMIN or DEFAULT_ADMIN |
| Reset daily spend | ADMIN or DEFAULT_ADMIN |
| Set risk score on order | BOT |
| Deliver digital product | MERCHANT (and must match order.merchant) |
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

Fees accumulate in `EscrowManager.treasury` and are withdrawable any time by an admin. No fee is charged on cancellations or buyer-favored dispute refunds.

---

## Dispute Resolution

1. **Buyer calls `raise_dispute`** — only valid if the order is `PENDING`, not already disputed, and the current time is within `refund_window_seconds` of `created_at`.
2. **Admin calls `resolve_dispute`** with `favor_buyer: bool`:
   - `true` — full USDC returned to buyer; merchant score −20; status = `REFUNDED`
   - `false` — USDC minus platform fee sent to merchant; fee goes to treasury; buyer earns XP; merchant score +5; status = `ESCROW_RELEASED`

---

## Reputation & Badges

**Buyer XP Flow**

Every `complete_order`, `release_escrow` (non-disputed), or `resolve_dispute` (favor_buyer=false) calls `award_xp`, adding 10 XP to the buyer's record. The tier is recalculated after each XP award.

**Merchant Score Flow**

Every settlement calls `update_merchant_score`. Passing `dispute_raised=true` decreases score by 20; `dispute_raised=false` increases by 5.

**Badge Minting**

Badges are separate from the reputation score and must be minted explicitly (e.g., by a backend service) using `mint_tier_badge`. The call is idempotent — a wallet already holding a badge tier will not receive a duplicate.

---

## Configuration Defaults

| Parameter | Default Value | Unit |
|---|---|---|
| `platform_fee_bps` | 250 | Basis points (2.5%) |
| `admin_approval_threshold` | 500,000,000 | USDC micro-units (500 USDC) |
| `daily_spend_limit` | 1,000,000,000 | USDC micro-units (1,000 USDC) |
| `refund_window_seconds` | 604,800 | Seconds (7 days) |
| `verification_expiry_seconds` | 31,536,000 | Seconds (1 year) |

All of the above can be changed at runtime by any address holding `ADMIN_ROLE`.

---

## Shared Object Addresses

These are the deployed addresses on the localnet used during final testing.

| Object | Address |
|---|---|
| Package | `0x71cb5a24...55d3d` |
| CommerceCore | `0x618f8390...3cc1` |
| EscrowManager | `0x825cfd97...842a` |
| ConfigManager | `0xb8311b66...630f` |
| RoleManager | `0xda833ef1...70fc` |
| ReputationManager | `0x787c7e67...b040` |
| BadgeManager | `0x66e46d53...1435` |
| TreasuryCap (mock USDC) | `0xaebad5a6...3a23` |

> **Note:** These addresses are localnet-specific. After any new deployment, update all object IDs before running scripts.

---

## Test Coverage

The final test suite (`test_final.sh`) executes 20 transactions across 8 groups, all passing on localnet.

| Group | Scenario | Orders | Expected Outcome |
|---|---|---|---|
| 1 | Config Manager | — | Set fee, threshold, spend limit, refund window |
| 2 | Escrow + Admin Release | Order N | 150 USDC locked → risk scored (20) → admin release, 3.75 USDC fee |
| 3 | Dispute → Buyer Wins | Order N+1 | 120 USDC locked → dispute raised → full refund to buyer |
| 4 | Dispute → Merchant Wins | Order N+2 | 110 USDC locked → dispute raised → merchant paid, 2.75 USDC fee |
| 5 | Cancel Order | Order N+3 | 130 USDC locked → cancelled → full refund to buyer, no fee |
| 6 | Digital Delivery | Order N+4 | 200 USDC locked → IPFS hash stored on-chain |
| 7 | Treasury Withdraw | — | Admin withdraws 6 USDC from accumulated fees |
| 8 | Reputation & Badges | — | Bronze, Silver, Gold badges minted (idempotent) |

**USDC flows verified:**

```
Order N   : 150 USDC → escrow → risk scored → admin release (fee 3.75 USDC)
Order N+1 : 120 USDC → escrow → dispute     → buyer refund  (0 fee)
Order N+2 : 110 USDC → escrow → dispute     → merchant wins (fee 2.75 USDC)
Order N+3 : 130 USDC → escrow → cancelled   → full refund   (0 fee)
Order N+4 : 200 USDC → escrow → digital content hash stored on-chain
```

---

## Error Codes

### `commerce_core`

| Code | Constant | Condition |
|---|---|---|
| 1 | `ENotMerchant` | Caller is not the order's merchant |
| 2 | `ENotBuyer` | Caller is not the order's buyer |
| 3 | `EOrderNotFound` | order_id does not exist in the table |
| 4 | `EInvalidStatus` | Order status does not allow this operation |
| 5 | `EDisputeTooLate` | Refund window has expired |
| 6 | `EAlreadyDisputed` | Order already has a dispute |
| 7 | `ENotAuthorized` | Caller lacks the required role |
| 8 | `EOrderNotPending` | Order status is not PENDING |

### `escrow_logic`

| Code | Constant | Condition |
|---|---|---|
| 1 | `EOrderNotFound` | Escrow record not found |
| 2 | `EOrderAlreadyReleased` | Funds already released or unlocked |
| 4 | `EDailyLimitExceeded` | Wallet daily USDC spend would exceed limit |
| 5 | `EInvalidAmount` | Payment amount is zero |
| 6 | `ENotAuthorized` | Caller lacks ADMIN role |
| 7 | `EInsufficientTreasury` | Treasury balance less than requested withdrawal |

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

1. Query `ConfigManager` to read `admin_approval_threshold` and `daily_spend_limit`
2. Check the buyer's current daily spend via `get_daily_spent`
3. Split the buyer's USDC coin to the exact order amount:
   ```
   coin::split(&mut usdc_coin, order_amount, ctx)
   ```
4. Call `commerce_core::create_order` with all shared objects + the split coin

### Frontend — Checking Order State

```
get_order_status(core, order_id): u8
get_order_fee(core, order_id): u64
get_order_risk_score(core, order_id): u8
```

### Backend Bot — Writing Risk Scores

Grant `BOT_ROLE` to the bot's wallet. Call `set_risk_score` after order creation to record the fraud score on-chain. Score range: 0 (clean) to 100 (high risk).

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

### USDC Micro-Unit Quick Reference

| USDC | Micro-units |
|---|---|
| 1 USDC | 1,000,000 |
| 10 USDC | 10,000,000 |
| 100 USDC | 100,000,000 |
| 500 USDC | 500,000,000 |
| 1,000 USDC | 1,000,000,000 |

---

*Quilvion Protocol — built on Sui Move 2024*