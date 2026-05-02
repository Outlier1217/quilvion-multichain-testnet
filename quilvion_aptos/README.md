# Quilvion — On-Chain Commerce Protocol (Aptos / Move)

**Language:** Move  
**Framework:** Aptos Framework  
**Token:** USDC via Fungible Asset (6 decimals — 1 USDC = 1,000,000 octas)  
**Module Address:** `@commerce_core`  
**License:** MIT

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Module Reference](#module-reference)
   - [roles](#roles)
   - [config_manager](#config_manager)
   - [escrow_logic](#escrow_logic)
   - [reputation_manager](#reputation_manager)
   - [events](#events)
   - [commerce_core](#commerce_core)
4. [On-Chain Resources](#on-chain-resources)
5. [Order Lifecycle](#order-lifecycle)
6. [Product Types](#product-types)
7. [Fee Model](#fee-model)
8. [Dispute Resolution](#dispute-resolution)
9. [Reputation & Badges](#reputation--badges)
10. [Configuration Defaults](#configuration-defaults)
11. [Events Reference](#events-reference)
12. [Error Codes](#error-codes)
13. [Deployment Guide](#deployment-guide)
14. [Integration Guide](#integration-guide)
15. [Known Notes & Production Wiring](#known-notes--production-wiring)
16. [Security Considerations](#security-considerations)

---

## Overview

Quilvion is a decentralized commerce protocol deployed as a set of Move modules on the Aptos blockchain. It handles the complete lifecycle of a USDC-denominated product order — from payment and escrow through optional admin review to settlement, cancellation, or dispute resolution.

**Key capabilities:**

- **Global resource escrow** — funds and metadata are stored in module-level `key` resources published at `@commerce_core`, with `aptos_std::table` tracking per-order balances
- **Two product types** — `DIGITAL` (type 1) and `PHYSICAL` (type 2), each with distinct auto-completion logic
- **Platform fee** — computed at order creation and stored separately; split out from the escrowed amount at settlement
- **Admin threshold** — orders below the threshold with a digital product type can be auto-completed by anyone; above the threshold requires a merchant or admin
- **Dispute system** — buyers raise disputes within a configurable `refund_window`; admins resolve in favor of buyer (full refund) or merchant (fee-deducted payout)
- **AI risk scoring** — a designated bot address writes a 0–100 fraud score on any order on-chain
- **Daily spend cap** — per-wallet USDC spend tracked using `timestamp::now_seconds()`, reset automatically each UTC day
- **Reputation engine** — buyers earn XP and automatic tier badges; merchants maintain a score derived from total dispute count

---

## Architecture

```
                    ┌──────────────────────────────────────────┐
  Buyer / Admin ────►          commerce_core                   │
                    │  create_order · complete_order            │
                    │  release_escrow · cancel_order            │
                    │  deliver_digital_product                  │
                    │  raise_dispute · resolve_dispute          │
                    │  set_risk_score · withdraw_treasury       │
                    └──────┬───────┬────────────────┬──────────┘
                           │       │                │
                  ┌────────▼──┐  ┌─▼─────────────┐ │
                  │  escrow_  │  │ reputation_   │ │
                  │  logic    │  │ manager       │ │
                  │           │  │               │ │
                  │ balances  │  │ BuyerStats    │ │
                  │ fees      │  │ MerchantStats │ │
                  │ daily_    │  │ Badge         │ │
                  │  spend    │  └───────────────┘ │
                  └───────────┘                    │
                           │                       │
                    ┌──────▼──────┐  ┌─────────────▼──┐
                    │   roles     │  │ config_manager  │
                    │             │  │                 │
                    │ super_admin │  │ fee_bps         │
                    │ admins      │  │ threshold       │
                    │ bots        │  │ spend_limit     │
                    │ merchants   │  │ refund_window   │
                    └─────────────┘  └─────────────────┘
                                │
                           events
                    (Aptos event v2 — #[event])
```

All persistent state is stored in Move resources (`has key`) published at the `@commerce_core` address. There are no object-scoped stores — every module publishes one or more top-level resources at init time. All inter-module calls use `acquires` annotations to explicitly declare resource access.

---

## Module Reference

### `roles`

Manages access control for all privileged operations. Publishes a single `Roles` resource at `@commerce_core` containing the super admin address and three `Table<address, bool>` maps for admins, bots, and merchants.

**Resource: `Roles`** (published at `@commerce_core`)

| Field | Type | Description |
|---|---|---|
| `super_admin` | `address` | Set at init; only this address can grant or revoke roles |
| `admins` | `Table<address, bool>` | Addresses with admin privileges |
| `bots` | `Table<address, bool>` | Addresses authorized to set risk scores |
| `merchants` | `Table<address, bool>` | Addresses authorized to deliver products |

**Init**

```move
public fun init(account: &signer)
```

Publishes the `Roles` resource. The signer's address becomes the `super_admin`. Called once at deployment from the module initializer.

**Assert Helpers** — abort if the condition is not met

```move
public fun assert_super_admin(addr: address) acquires Roles
public fun assert_admin(addr: address)       acquires Roles  // passes for super_admin too
public fun assert_bot(addr: address)         acquires Roles
public fun assert_merchant(addr: address)    acquires Roles
```

**View Helpers**

```move
public fun has_admin_role(addr: address): bool    acquires Roles
public fun has_bot_role(addr: address): bool      acquires Roles
public fun has_merchant_role(addr: address): bool acquires Roles
```

**Grant / Revoke** — all require `super_admin`

```move
public fun grant_admin_role(account: &signer, new_admin: address)     acquires Roles
public fun grant_bot_role(account: &signer, new_bot: address)         acquires Roles
public fun grant_merchant_role(account: &signer, new_merchant: address) acquires Roles

public fun revoke_admin_role(account: &signer, admin: address)       acquires Roles
public fun revoke_bot_role(account: &signer, bot: address)           acquires Roles
public fun revoke_merchant_role(account: &signer, merchant: address)  acquires Roles
```

Granting a role that already exists aborts with `E_ALREADY_HAS_ROLE`. Revoking uses `table::remove` which will abort if the entry does not exist.

**Error Codes**

| Code | Constant | Condition |
|---|---|---|
| 1 | `E_NOT_SUPER_ADMIN` | Caller is not the super admin |
| 2 | `E_NOT_ADMIN` | Caller is neither super admin nor in admins table |
| 3 | `E_NOT_BOT` | Caller is not in bots table |
| 4 | `E_NOT_MERCHANT` | Caller is not in merchants table |
| 5 | `E_ALREADY_HAS_ROLE` | Role already granted to this address |

---

### `config_manager`

Stores all runtime protocol parameters in a single `Config` resource at `@commerce_core`. All setters require admin role. All values are readable by any module via getter functions.

**Resource: `Config`** (published at `@commerce_core`)

| Field | Type | Default | Description |
|---|---|---|---|
| `admin` | `address` | Deployer | Admin address recorded at init |
| `daily_spend_limit` | `u64` | 1,000,000,000 (1,000 USDC) | Max USDC octas a buyer may spend per day |
| `admin_threshold` | `u64` | 100,000,000 (100 USDC) | Orders above this require merchant or admin to complete |
| `platform_fee_bps` | `u64` | 250 (2.5%) | Platform fee in basis points |
| `refund_window` | `u64` | 86,400 (24 hours) | Seconds after `created_at` within which a buyer may dispute |
| `treasury` | `address` | Deployer | Recipient of collected platform fees |

**Init**

```move
public fun init(account: &signer)
```

Publishes `Config` with the defaults above. Called once at deployment.

**Setters** (all require `roles::assert_admin`)

```move
public fun set_daily_spend_limit(account: &signer, limit: u64)     acquires Config
public fun set_admin_threshold(account: &signer, threshold: u64)   acquires Config
public fun set_platform_fee(account: &signer, bps: u64)            acquires Config  // max 10000
public fun set_refund_window(account: &signer, secs: u64)          acquires Config
public fun set_treasury(account: &signer, treasury_addr: address)  acquires Config
```

`set_platform_fee` aborts with `E_INVALID_FEE_BPS` (code 1) if `bps > 10000`.

**Getters**

```move
public fun get_daily_spend_limit(): u64  acquires Config
public fun get_admin_threshold(): u64    acquires Config
public fun get_platform_fee_bps(): u64   acquires Config
public fun get_refund_window(): u64      acquires Config
public fun get_treasury(): address       acquires Config
```

---

### `escrow_logic`

Tracks locked funds and daily spend per wallet. Publishes a single `Escrow` resource at `@commerce_core` containing four tables. Does **not** perform actual coin transfers — it records accounting state only. Coin movement is handled in `commerce_core` via `transfer_funds`.

**Resource: `Escrow`** (published at `@commerce_core`)

| Field | Type | Description |
|---|---|---|
| `balances` | `Table<u64, u64>` | `order_id → locked USDC octas` |
| `platform_fees` | `Table<u64, u64>` | `order_id → fee octas` (stored separately from net) |
| `daily_spend` | `Table<address, u64>` | `wallet → octas spent today` |
| `last_reset` | `Table<address, u64>` | `wallet → unix day number of last reset` |

**Fund Lifecycle**

```move
public fun lock_funds(order_id: u64, amount: u64)     acquires Escrow
public fun add_platform_fee(order_id: u64, fee: u64)  acquires Escrow
```

Called together at `create_order`. `lock_funds` records the gross amount; `add_platform_fee` stores the computed fee alongside it.

```move
public fun release_funds(order_id: u64): u64  acquires Escrow
```

Removes and returns the locked amount for the given order. Clears the fee entry if present. Caller is responsible for splitting the returned amount between merchant and treasury.

```move
public fun refund_funds(order_id: u64): u64  acquires Escrow
```

Identical accounting behavior to `release_funds` — removes and returns the locked amount. Semantically used for refunds; direction of coin transfer is determined by the caller.

```move
public fun get_platform_fee(order_id: u64): u64  acquires Escrow
```

Returns the stored fee for an order. Returns 0 if not found.

**Daily Spend Tracking**

```move
public fun check_and_update_daily_spend(
    wallet: address,
    amount: u64,
    limit: u64,
) acquires Escrow
```

Uses `timestamp::now_seconds() / 86400` as the current day number. On first call for a wallet, initializes both `daily_spend` and `last_reset` entries. If the stored day number differs from today, resets `daily_spend` to 0. Aborts with `E_DAILY_LIMIT_EXCEEDED` (code 1) if `current_spent + amount > limit`.

```move
public fun get_daily_spent(wallet: address): u64  acquires Escrow
```

Returns current day's cumulative spend. Returns 0 if wallet has never placed an order.

> **Note:** The daily reset is lazy — it happens inside `check_and_update_daily_spend` when the next order is placed. A wallet that has not placed an order since yesterday will still show yesterday's spend when queried via `get_daily_spent`. Off-chain clients should compare against the current day themselves.

---

### `reputation_manager`

Tracks buyer XP, tier badges, and merchant quality scores. Publishes three separate `key` resources at `@commerce_core`: `BuyerStats`, `MerchantStats`, and `Badge`.

**Resources** (all published at `@commerce_core`)

`BuyerStats`:

| Field | Type | Description |
|---|---|---|
| `xp` | `Table<address, u64>` | Cumulative XP per buyer |
| `last_order` | `Table<address, u64>` | Last settled order ID per buyer |

`MerchantStats`:

| Field | Type | Description |
|---|---|---|
| `score` | `Table<address, u64>` | Quality score per merchant (0–1000) |
| `order_count` | `Table<address, u64>` | Total settled orders |
| `dispute_count` | `Table<address, u64>` | Total disputed orders |

`Badge`:

| Field | Type | Description |
|---|---|---|
| `badges` | `Table<address, vector<u8>>` | List of tier IDs minted per wallet |

**Buyer XP & Tiers**

Each settled order calls `award_xp`, which adds `BASE_XP_PER_ORDER = 10` XP to the buyer. Tier is recalculated after each award:

| XP | Tier | Constant |
|---|---|---|
| 0 – 99 | Bronze | `TIER_BRONZE = 1` |
| 100 – 499 | Silver | `TIER_SILVER = 2` |
| 500+ | Gold | `TIER_GOLD = 3` |

> Tier constants are 1/2/3 on Aptos — different from the 0/1/2 used in the Solana and EVM versions.

```move
public fun award_xp(buyer: address, order_id: u64) acquires BuyerStats, Badge
```

Adds 10 XP, recalculates tier, emits `XPAwarded`. If tier changed, emits `TierUpgraded` and calls `mint_tier_badge` internally.

```move
public fun get_buyer_xp(buyer: address): u64   acquires BuyerStats
public fun get_buyer_tier(buyer: address): u8  acquires BuyerStats
```

**Merchant Scoring**

Initial score: `BASE_MERCHANT_SCORE = 1000`. Score decreases by `DISPUTE_PENALTY_PER = 10` per dispute. When dispute count reaches `MAX_DISPUTES_BEFORE_ZERO = 100`, score is set to 0.

```
score = BASE_MERCHANT_SCORE - (dispute_count × DISPUTE_PENALTY_PER)
      = 1000 - (disputes × 10)
      → floor at 0 when disputes ≥ 100
```

```move
public fun update_merchant_score(
    merchant: address,
    _order_id: u64,
    dispute_raised: bool,
) acquires MerchantStats
```

Increments `order_count`, optionally increments `dispute_count`, then recomputes score. Uses a local variable copy of `dispute_count` before recomputing to avoid simultaneous mutable and immutable borrow on the same table — a Move borrow-checker requirement.

```move
public fun get_merchant_score(merchant: address): u64         acquires MerchantStats
public fun get_merchant_order_count(merchant: address): u64   acquires MerchantStats
public fun get_merchant_dispute_count(merchant: address): u64 acquires MerchantStats
```

**Badges**

Badges are stored as a `vector<u8>` of tier IDs in the `Badge` resource. `mint_tier_badge` is an internal function — it is called automatically inside `award_xp` when a tier upgrade is detected. It is idempotent; attempting to mint a badge tier already present in the vector is a no-op (checked via `has_badge_internal`).

```move
public fun has_badge(wallet: address, tier: u8): bool  acquires Badge
```

---

### `events`

Thin wrapper around `aptos_framework::event`. All structs carry the `#[event]` attribute required by Aptos event v2. All structs have `drop, store` abilities. Emitter functions are public and called from `commerce_core` and `reputation_manager`.

See [Events Reference](#events-reference) for the full table.

---

### `commerce_core`

The primary entry-point module. Orchestrates order creation, settlement, cancellation, disputes, risk scoring, and treasury withdrawal. Publishes a single `OrderStore` resource at `@commerce_core`.

**Resource: `OrderStore`** (published at `@commerce_core`)

| Field | Type | Description |
|---|---|---|
| `orders` | `Table<u64, Order>` | All orders indexed by auto-incrementing ID |
| `next_id` | `u64` | Next order ID to assign (starts at 1) |

**`Order` Struct**

```move
struct Order has copy, drop, store {
    id:            u64,
    buyer:         address,
    merchant:      address,
    amount:        u64,          // gross USDC octas paid by buyer
    product_type:  u8,           // 1 = DIGITAL, 2 = PHYSICAL
    risk_score:    u8,           // 0–100, written by bot
    content_hash:  vector<u8>,   // IPFS or content hash
    created_at:    u64,          // timestamp::now_seconds() at creation
    delivered_at:  u64,          // timestamp of deliver_digital_product call
    is_delivered:  bool,         // separate flag; timestamp can be 0 in tests
    completed:     bool,
    disputed:      bool,
    cancelled:     bool,
}
```

Order state is represented as a set of boolean flags rather than a single enum, matching Aptos Move's `copy, drop, store` constraints on table-stored structs.

**Internal Helpers**

`transfer_funds(to: address, amount: u64)` — placeholder function. In production this is replaced with a `coin::transfer<USDC>` call authorized by the escrow vault signer. See [Known Notes & Production Wiring](#known-notes--production-wiring).

`settle_order(order: &mut Order, order_id: u64)` — shared DRY helper called by `complete_order`, `release_escrow`, and the merchant-wins path of `resolve_dispute`. It calls `escrow_logic::release_funds`, splits the returned amount into merchant payout and fee, calls `transfer_funds` for each, and triggers XP award and merchant score update.

**Public Functions**

---

#### `create_order`

```move
public fun create_order(
    buyer: &signer,
    merchant: address,
    amount: u64,
    product_type: u8,
    _is_verified_merchant: bool,
) acquires OrderStore
```

- Validates `product_type` is `1` (DIGITAL) or `2` (PHYSICAL)
- Checks and updates daily spend via `escrow_logic::check_and_update_daily_spend`
- Locks funds via `escrow_logic::lock_funds`
- Computes fee: `fee = (amount × platform_fee_bps) / 10000`, stores via `escrow_logic::add_platform_fee`
- Creates `Order` with `completed = false`, `disputed = false`, `cancelled = false`, `risk_score = 0`
- Assigns next auto-incrementing `id` (starts at 1)
- Emits `OrderCreated`

`_is_verified_merchant` is accepted for audit trail but not enforced on-chain.

---

#### `complete_order`

```move
public fun complete_order(account: &signer, order_id: u64) acquires OrderStore
```

Settles a pending order by calling the internal `settle_order` helper.

**Auto-complete path** — if `product_type == DIGITAL` AND `amount < admin_threshold`, any signer may call this function. Suitable for low-value digital orders.

**Manual path** — if either condition is not met, the caller must hold `MERCHANT_ROLE` or `ADMIN_ROLE`.

Aborts if order is already `completed`, `disputed`, or `cancelled`.

---

#### `release_escrow`

```move
public fun release_escrow(account: &signer, order_id: u64) acquires OrderStore
```

Admin override to force-settle any order that is not yet `completed` or `cancelled`. Requires `ADMIN_ROLE`. Calls `settle_order` directly, bypassing the auto/manual check of `complete_order`.

---

#### `cancel_order`

```move
public fun cancel_order(account: &signer, order_id: u64) acquires OrderStore
```

Cancels an order and refunds the full gross amount (including fee) to the buyer. Callable by the buyer or any admin. Aborts if order is `completed`, `disputed`, or already `cancelled`. Calls `escrow_logic::refund_funds` and `transfer_funds(buyer, amount)`. Emits `OrderCancelled`.

---

#### `deliver_digital_product`

```move
public fun deliver_digital_product(
    account: &signer,
    order_id: u64,
    content_hash: vector<u8>,
) acquires OrderStore
```

Merchant records a content delivery proof on-chain. Caller must be the stored `order.merchant`. Order must be `DIGITAL` type, not yet delivered, not completed, and not cancelled. Sets `content_hash`, `delivered_at`, and `is_delivered = true`. Emits `ProductDelivered`.

This does not automatically complete the order — a separate `complete_order` call is required.

---

#### `raise_dispute`

```move
public fun raise_dispute(account: &signer, order_id: u64) acquires OrderStore
```

Buyer marks an order as disputed. Caller must be `order.buyer`. Order must not be `completed`, `disputed`, or `cancelled`. Time elapsed since `created_at` must be strictly less than `refund_window`. Sets `order.disputed = true`. Emits `OrderDisputed`.

---

#### `resolve_dispute`

```move
public fun resolve_dispute(
    account: &signer,
    order_id: u64,
    favor_buyer: bool,
) acquires OrderStore
```

Admin resolves a disputed order. Requires `ADMIN_ROLE`. Order must have `disputed == true`.

| `favor_buyer` | Token flow | Reputation effect |
|---|---|---|
| `true` | Full gross refunded to buyer | Merchant score decremented (dispute penalty) |
| `false` | Net to merchant, fee to treasury | Merchant score updated (no penalty); buyer earns XP |

After resolution: `order.completed = true`, `order.disputed = false`. Emits `DisputeResolved`.

---

#### `set_risk_score`

```move
public fun set_risk_score(account: &signer, order_id: u64, score: u8) acquires OrderStore
```

Requires `BOT_ROLE`. Score must be 0–100. Writes `order.risk_score` and emits `RiskScoreSet`.

---

#### `withdraw_treasury`

```move
public fun withdraw_treasury(account: &signer, amount: u64)
```

Requires `SUPER_ADMIN`. Currently a stub — see [Known Notes & Production Wiring](#known-notes--production-wiring). In production, performs a coin transfer from the treasury vault to the caller.

---

#### View Functions

```move
public fun get_order(order_id: u64): Order                acquires OrderStore
public fun get_order_risk_score(order_id: u64): u8        acquires OrderStore
public fun unpack_order(o: Order): (u64, address, address, u64, u8, u8, vector<u8>, u64, u64, bool, bool, bool, bool)
```

`unpack_order` destructures all 13 Order fields into a tuple — primarily used in tests to inspect order state.

---

## On-Chain Resources

All persistent state on Aptos is stored in resources (`has key`) at the `@commerce_core` address. The table below lists every resource and its publishing module.

| Resource | Module | Published At |
|---|---|---|
| `Roles` | `roles` | `@commerce_core` |
| `Config` | `config_manager` | `@commerce_core` |
| `Escrow` | `escrow_logic` | `@commerce_core` |
| `BuyerStats` | `reputation_manager` | `@commerce_core` |
| `MerchantStats` | `reputation_manager` | `@commerce_core` |
| `Badge` | `reputation_manager` | `@commerce_core` |
| `OrderStore` | `commerce_core` | `@commerce_core` |

All resources must be initialized before any order can be placed. The recommended initialization order is: `roles::init` → `config_manager::init` → `escrow_logic::init` → `reputation_manager::init` → `commerce_core::init`.

---

## Order Lifecycle

```
  Buyer calls create_order(merchant, amount, product_type, ...)
                       │
                 funds locked in Escrow.balances
                 fee stored in Escrow.platform_fees
                       │
         ┌─────────────┼────────────────────────────────┐
         ▼             ▼                                 ▼
  raise_dispute()  cancel_order()               complete_order()
  (buyer, within   (buyer or admin)             or release_escrow()
   refund_window)         │                    (admin, any time)
         │         full gross refund                     │
  disputed=true    to buyer                        settle_order()
         │         cancelled=true                   (internal)
  resolve_dispute()                                      │
  (admin)                                    net → merchant
    │                                        fee → treasury
    ├─ favor_buyer=true                      XP  → buyer
    │   full refund to buyer                 merchant score +
    │   merchant score −                     completed=true
    │   completed=true
    │
    └─ favor_buyer=false
        net → merchant
        fee → treasury
        buyer earns XP
        merchant score (no penalty)
        completed=true
```

**Auto-complete eligibility** (inside `complete_order`):

| Product Type | Amount vs Threshold | Who Can Call |
|---|---|---|
| DIGITAL (1) | `< admin_threshold` | Anyone |
| DIGITAL (1) | `>= admin_threshold` | Merchant or Admin |
| PHYSICAL (2) | Any | Merchant or Admin |

---

## Product Types

| Constant | Value | Description |
|---|---|---|
| `PRODUCT_TYPE_DIGITAL` | 1 | Digital product — supports content hash delivery via `deliver_digital_product` |
| `PRODUCT_TYPE_PHYSICAL` | 2 | Physical product — no content hash delivery; manual completion required |

`deliver_digital_product` can only be called on orders with `product_type == PRODUCT_TYPE_DIGITAL`. Physical product orders must be completed manually by a merchant or admin calling `complete_order`, or by an admin calling `release_escrow`.

---

## Fee Model

Fee is computed at `create_order` and stored separately from the net amount:

```
fee        = (amount × platform_fee_bps) / 10,000
net_amount = amount - fee
```

Both `amount` (gross) and `fee` are stored in `Escrow`. At settlement, `settle_order` retrieves both and routes them:

```
transfer_funds(merchant, amount - fee)
transfer_funds(treasury, fee)
```

**Example** — 150 USDC at 2.5% (250 bps):

```
fee        = 150,000,000 × 250 / 10,000 = 3,750,000  (3.75 USDC)
net_amount = 150,000,000 − 3,750,000   = 146,250,000 (146.25 USDC)
```

For **cancellations**, the full gross amount is returned to the buyer via `escrow_logic::refund_funds` — no fee is retained.

For **buyer-favored dispute resolution**, the full gross amount is also returned to the buyer — no fee is retained.

---

## Dispute Resolution

**Step 1** — Buyer calls `raise_dispute(order_id)`:
- `caller == order.buyer`
- `!order.completed && !order.disputed && !order.cancelled`
- `timestamp::now_seconds() - order.created_at < config.refund_window`

**Step 2** — Admin calls `resolve_dispute(order_id, favor_buyer)`:

| `favor_buyer` | Funds | Reputation |
|---|---|---|
| `true` | Full gross → buyer | Merchant: `update_merchant_score(..., dispute_raised=true)` → score −10 |
| `false` | Net → merchant, fee → treasury | Merchant: `update_merchant_score(..., dispute_raised=false)` → no penalty; Buyer: `award_xp` → +10 XP |

After either resolution: `completed = true`, `disputed = false`.

---

## Reputation & Badges

### Buyer XP Flow

```
Order settles → settle_order() → reputation_manager::award_xp()
                                        │
                               +10 XP to buyer
                                        │
                              recalculate tier from XP
                                        │
                          old_tier != new_tier?
                              │              │
                             No             Yes
                                     emit TierUpgraded
                                     mint_tier_badge() (internal)
```

Badges are stored as a `vector<u8>` in `Badge.badges[wallet]`. Each tier ID (1, 2, or 3) appears at most once. `mint_tier_badge` checks `has_badge_internal` before pushing — re-minting is silently skipped.

### Merchant Score

Score starts at `1000` on first interaction. Every order with `dispute_raised = true` reduces score by 10. Score is fully recomputed after each settled order:

```
score = 1000 - (dispute_count × 10)
```

If `dispute_count >= 100`, score is forced to 0.

**Score range:** 0 – 1000 (vs 0–100 in EVM, 0–1000 in Solana)

---

## Configuration Defaults

| Parameter | Default | Human-readable |
|---|---|---|
| `daily_spend_limit` | 1,000,000,000 | 1,000 USDC |
| `admin_threshold` | 100,000,000 | 100 USDC |
| `platform_fee_bps` | 250 | 2.5% |
| `refund_window` | 86,400 | 24 hours |
| `treasury` | Deployer address | — |

All parameters are updatable at runtime by any address with `ADMIN_ROLE`.

---

## Events Reference

All events use Aptos event v2 (`#[event]` attribute, `event::emit()`). They can be subscribed to via the Aptos SDK's `getEventsByEventType` or indexed using the Aptos Indexer.

| Event | Fields | Emitted By |
|---|---|---|
| `OrderCreated` | `order_id, buyer, merchant, amount` | `create_order` |
| `OrderCompleted` | `order_id` | `settle_order` (via `complete_order`, `release_escrow`, `resolve_dispute`) |
| `OrderCancelled` | `order_id` | `cancel_order` |
| `OrderDisputed` | `order_id, buyer` | `raise_dispute` |
| `DisputeResolved` | `order_id, favor_buyer` | `resolve_dispute` |
| `RiskScoreSet` | `order_id, score` | `set_risk_score` |
| `ProductDelivered` | `order_id, content_hash` | `deliver_digital_product` |
| `XPAwarded` | `buyer, amount` | `award_xp` |
| `TierUpgraded` | `buyer, tier` | `award_xp` (on tier change) |
| `TierBadgeMinted` | `wallet, tier` | `mint_tier_badge` (internal, called from `award_xp`) |

---

## Error Codes

### `roles`

| Code | Constant | Condition |
|---|---|---|
| 1 | `E_NOT_SUPER_ADMIN` | Caller is not super admin |
| 2 | `E_NOT_ADMIN` | Caller is not admin or super admin |
| 3 | `E_NOT_BOT` | Caller is not in bots table |
| 4 | `E_NOT_MERCHANT` | Caller is not in merchants table |
| 5 | `E_ALREADY_HAS_ROLE` | Role already granted |

### `config_manager`

| Code | Constant | Condition |
|---|---|---|
| 1 | `E_INVALID_FEE_BPS` | `bps > 10000` |

### `escrow_logic`

| Code | Constant | Condition |
|---|---|---|
| 1 | `E_DAILY_LIMIT_EXCEEDED` | `daily_spent + amount > daily_spend_limit` |

### `commerce_core`

| Code | Constant | Condition |
|---|---|---|
| 1 | `E_NOT_AUTHORIZED` | Caller lacks required role or is not the buyer/merchant |
| 2 | `E_ORDER_NOT_FOUND` | Unused (table abort handles this) |
| 3 | `E_ORDER_COMPLETED` | `order.completed == true` |
| 4 | `E_ORDER_DISPUTED` | `order.disputed == true` |
| 5 | `E_ALREADY_DELIVERED` | `order.is_delivered == true` |
| 6 | `E_REFUND_WINDOW_PASSED` | `now - created_at >= refund_window` |
| 7 | `E_INVALID_PRODUCT_TYPE` | `product_type` is not 1 or 2 |
| 8 | `E_ORDER_CANCELLED` | `order.cancelled == true` |
| 9 | `E_NOT_DIGITAL_PRODUCT` | `deliver_digital_product` called on physical order |
| 10 | `E_NOT_DISPUTED` | `resolve_dispute` called on non-disputed order |
| 11 | `E_INVALID_RISK_SCORE` | `score > 100` |

---

## Deployment Guide

### Prerequisites

```bash
# Install Aptos CLI
curl -fsSL "https://aptos.dev/scripts/install_cli.py" | python3

# Verify
aptos --version
```

### `Move.toml`

```toml
[package]
name = "commerce_core"
version = "1.0.0"

[addresses]
commerce_core = "<YOUR_DEPLOYER_ADDRESS>"

[dependencies]
AptosFramework = { git = "https://github.com/aptos-labs/aptos-core.git", subdir = "aptos-move/framework/aptos-framework/", rev = "mainnet" }
```

### Compile

```bash
aptos move compile
```

### Deploy

```bash
# Testnet
aptos move publish \
  --named-addresses commerce_core=<YOUR_ADDRESS> \
  --profile testnet

# Mainnet
aptos move publish \
  --named-addresses commerce_core=<YOUR_ADDRESS> \
  --profile mainnet
```

### Initialize (call once after deploy)

Initialize all modules in order. Each `init` function publishes its resource at `@commerce_core`:

```bash
# 1. Roles
aptos move run \
  --function-id commerce_core::roles::init \
  --profile default

# 2. Config
aptos move run \
  --function-id commerce_core::config_manager::init \
  --profile default

# 3. Escrow
aptos move run \
  --function-id commerce_core::escrow_logic::init \
  --profile default

# 4. Reputation
aptos move run \
  --function-id commerce_core::reputation_manager::init \
  --profile default

# 5. Commerce Core
aptos move run \
  --function-id commerce_core::commerce_core::init \
  --profile default
```

### Grant Initial Roles

```bash
# Grant ADMIN_ROLE to operations wallet
aptos move run \
  --function-id commerce_core::roles::grant_admin_role \
  --args address:<ADMIN_ADDRESS> \
  --profile default

# Grant BOT_ROLE to fraud-scoring service
aptos move run \
  --function-id commerce_core::roles::grant_bot_role \
  --args address:<BOT_ADDRESS> \
  --profile default

# Grant MERCHANT_ROLE to a merchant wallet
aptos move run \
  --function-id commerce_core::roles::grant_merchant_role \
  --args address:<MERCHANT_ADDRESS> \
  --profile default
```

---

## Integration Guide

### TypeScript SDK — Placing an Order

```typescript
import { Aptos, AptosConfig, Network, Account } from "@aptos-labs/ts-sdk";

const aptos = new Aptos(new AptosConfig({ network: Network.TESTNET }));

const txn = await aptos.transaction.build.simple({
  sender: buyerAccount.accountAddress,
  data: {
    function: `${MODULE_ADDRESS}::commerce_core::create_order`,
    functionArguments: [
      merchantAddress,           // address
      150_000_000n,              // u64: 150 USDC
      1,                         // u8: PRODUCT_TYPE_DIGITAL
      true,                      // bool: is_verified_merchant
    ],
  },
});

const committedTxn = await aptos.signAndSubmitTransaction({
  signer: buyerAccount,
  transaction: txn,
});
await aptos.waitForTransaction({ transactionHash: committedTxn.hash });
```

### Reading Order State

```typescript
const orderResource = await aptos.getAccountResource({
  accountAddress: MODULE_ADDRESS,
  resourceType: `${MODULE_ADDRESS}::commerce_core::OrderStore`,
});

// orders is a Table — use aptos.getTableItem to fetch by key
const order = await aptos.getTableItem({
  handle: orderResource.orders.handle,
  data: {
    key_type: "u64",
    value_type: `${MODULE_ADDRESS}::commerce_core::Order`,
    key: orderId.toString(),
  },
});
console.log(order.completed, order.risk_score, order.content_hash);
```

### Subscribing to Events

```typescript
const events = await aptos.getEventsByEventType({
  eventType: `${MODULE_ADDRESS}::events::OrderCreated`,
  options: { limit: 25 },
});
events.forEach(e => console.log(e.data));
```

### USDC Octa Reference

| USDC | Octas (`u64`) |
|---|---|
| 1 USDC | 1,000,000 |
| 10 USDC | 10,000,000 |
| 100 USDC | 100,000,000 |
| 500 USDC | 500,000,000 |
| 1,000 USDC | 1,000,000,000 |

---

## Known Notes & Production Wiring

### `transfer_funds` Stub

The `transfer_funds(to, amount)` function in `commerce_core` is currently a no-op placeholder:

```move
fun transfer_funds(_to: address, _amount: u64) {
    // Production: coin::transfer<USDC>(escrow_signer, _to, _amount);
}
```

In production this must be wired to:
- A `coin::transfer<USDC>` call for Aptos Coin-based USDC, **or**
- A `fungible_asset::transfer` call for the USDC Fungible Asset standard

The escrow vault (the signer authority over the locked coins) must be a resource account derived from `@commerce_core` so the module can sign on its behalf using `account::create_signer_with_capability`.

### `withdraw_treasury` Stub

Similarly, `withdraw_treasury` currently reads the treasury address and amount but performs no token movement:

```move
public fun withdraw_treasury(account: &signer, amount: u64) {
    // Production: coin::transfer<USDC>(treasury_signer, signer::address_of(account), amount);
}
```

### `acquires` Declarations

Every function that reads or writes a `key` resource must declare it in its `acquires` list. When calling across modules (e.g. `commerce_core` calling `escrow_logic`), the callee's `acquires` propagate to the caller. If adding new module calls, ensure `acquires` chains are updated accordingly or the compiler will reject the transaction.

### Borrow Checker Pattern in `update_merchant_score`

The merchant score recomputation reads `dispute_count` into a local `u64` variable before computing `score`, because Move does not allow a mutable borrow (`borrow_mut`) and an immutable borrow (`borrow`) of the same `Table` to be alive simultaneously:

```move
// Read into local first
let dispute_count_val = *table::borrow(&stats.dispute_count, merchant);
// Then mutably update score
let score = table::borrow_mut(&mut stats.score, merchant);
*score = BASE_MERCHANT_SCORE - (dispute_count_val * DISPUTE_PENALTY_PER);
```

This is a Move-specific pattern that differs from Rust (where lifetimes are more granular) and Solidity (where no such constraint exists).

---

## Security Considerations

**Resource isolation** — All state is stored at `@commerce_core` under separate named resources. Each resource can only be mutated by its own module via `borrow_global_mut`. No external module can directly modify `Escrow`, `OrderStore`, or `Roles` without going through the provided public functions.

**`acquires` safety** — Move's `acquires` system enforces at compile time that any function reading a global resource declares it. This prevents silent cross-module state access and makes resource dependencies explicit and auditable.

**Integer safety** — Fee calculation uses integer division `(amount × fee_bps) / 10000`. Since Move u64 arithmetic does not overflow silently (the VM aborts on overflow), and `amount < u64::MAX` and `fee_bps <= 10000`, the multiplication `amount × fee_bps` could theoretically overflow for very large amounts. In production, amounts should be validated against a reasonable ceiling, or the calculation should be reordered: `(amount / 10000) × fee_bps`.

**Daily reset laziness** — The daily spend counter resets only when a new order is placed. Querying `get_daily_spent` between midnight and the next order will return stale data. Off-chain clients should compare the returned value against `last_reset` (readable from the `Escrow` resource) to determine whether the counter is current.

**Dispute window strictness** — `raise_dispute` uses a strict less-than check (`< refund_window`) rather than less-than-or-equal. A buyer attempting to dispute exactly at the boundary second will be rejected.

**`_is_verified_merchant` is off-chain** — The `create_order` function accepts this flag from the frontend for audit trail purposes but does not enforce it on-chain. Platforms requiring on-chain merchant verification should gate `create_order` via `roles::assert_merchant` instead.

**Single-address resource model** — Because all resources are published at `@commerce_core`, the deployer address is a single point of administrative control. A compromised deployer key can grant all roles and modify all config. Multi-sig or governance over the super admin address is strongly recommended in production.

---

*Quilvion Protocol — Aptos Edition · Move · Aptos Framework*