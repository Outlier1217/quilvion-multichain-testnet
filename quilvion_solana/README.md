# Quilvion — On-Chain Commerce Protocol (Solana / Anchor)

**Framework:** Anchor `0.29.0`  
**Language:** Rust  
**Token:** SPL USDC (6 decimals — 1 USDC = 1,000,000 lamports)  
**Program ID:** `8YPzbK3t3vgJkV2dPo33wDDhyaV3oghtUn9RbQf2aSDx`  
**License:** MIT

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [On-Chain Accounts](#on-chain-accounts)
   - [PlatformConfig](#platformconfig)
   - [Order](#order)
   - [EscrowAccount](#escrowaccount)
   - [DailySpend](#dailyspend)
   - [BuyerReputation](#buyerreputation)
   - [MerchantReputation](#merchantreputation)
4. [Instructions](#instructions)
   - [Config Instructions](#config-instructions)
   - [Order Instructions](#order-instructions)
   - [Dispute Instructions](#dispute-instructions)
   - [Reputation Instructions](#reputation-instructions)
5. [Order Lifecycle](#order-lifecycle)
6. [Two Settlement Paths](#two-settlement-paths)
7. [Fee Model](#fee-model)
8. [Dispute Resolution](#dispute-resolution)
9. [Reputation & Badges](#reputation--badges)
10. [PDA Seeds Reference](#pda-seeds-reference)
11. [Account Sizes](#account-sizes)
12. [Events Reference](#events-reference)
13. [Error Codes](#error-codes)
14. [Deployment Guide](#deployment-guide)
15. [Integration Guide](#integration-guide)
16. [Security Considerations](#security-considerations)

---

## Overview

Quilvion is a decentralized commerce protocol deployed as a single Anchor program on Solana. It handles the full lifecycle of a USDC-denominated product order — from payment and escrow, through optional admin review, to settlement, cancellation, or dispute resolution.

**Key capabilities:**

- **Dual-path settlement** — low-value orders pay merchant directly at creation; high-value orders are held in a PDA escrow and released by an admin
- **SPL USDC escrow** — funds are held in a program-derived token account and released via PDA signer seeds, never by an EOA key
- **Platform fee** — deducted at creation (direct path) or at release (escrow path) and routed to a treasury token account
- **Dispute system** — buyers may raise disputes within a configurable `refund_window`; admin resolves in favor of buyer (full refund including fee) or merchant (fee-deducted payout)
- **AI risk scoring** — a designated bot wallet writes a 0–100 fraud score on any order on-chain
- **Daily spend cap** — per-wallet daily USDC spend tracked in a `DailySpend` PDA, reset automatically each UTC day
- **Reputation engine** — buyers earn XP and tier badges; merchants maintain a 0–1000 score adjusted per order settlement

---

## Architecture

```
                       ┌────────────────────────────────────┐
  Buyer / Admin ───────►         commerce_core              │
                       │                                    │
                       │  initialize_config · update_config │
                       │  create_order · complete_order     │
                       │  deliver_digital_product           │
                       │  release_escrow · cancel_order     │
                       │  raise_dispute · resolve_dispute   │
                       │  set_risk_score                    │
                       │  withdraw_treasury                 │
                       │  initialize_buyer_rep · award_xp  │
                       │  initialize_merchant_rep           │
                       │  update_merchant_score             │
                       │  mint_tier_badge                   │
                       └───────┬────────────────────────────┘
                               │  reads / writes PDAs
              ┌────────────────┼────────────────────────────┐
              ▼                ▼                            ▼
       PlatformConfig      Order PDA              BuyerReputation PDA
       (global config)  + EscrowAccount PDA    + MerchantReputation PDA
                        + DailySpend PDA
                               │
                               ▼
                    SPL Token Accounts
              (buyer · merchant · escrow · treasury)
```

All mutable state lives in PDAs — there are no program-owned token mints. The program only moves SPL tokens using CPI calls to `anchor_spl::token::transfer`, and escrow releases are authorized via PDA signer seeds (not a keypair).

---

## On-Chain Accounts

### `PlatformConfig`

A single global configuration PDA. Initialized once by the deployer and updatable by the stored `admin` pubkey.

**Seeds:** `[b"platform_config"]`  
**Space:** 91 bytes

| Field | Type | Description |
|---|---|---|
| `admin` | `Pubkey` | Address authorized to release escrow, resolve disputes, update config |
| `bot` | `Pubkey` | Address authorized to call `set_risk_score` |
| `daily_spend_limit` | `u64` | Max USDC lamports a wallet may spend per day |
| `admin_approval_threshold` | `u64` | Orders above this amount go to escrow path |
| `platform_fee_bps` | `u16` | Fee in basis points (e.g. 250 = 2.5%) |
| `refund_window` | `i64` | Seconds after `created_at` within which a dispute can be raised |
| `treasury` | `Pubkey` | Pubkey of the treasury wallet (not token account) |
| `bump` | `u8` | PDA canonical bump |

---

### `Order`

One PDA per order. Created by the buyer at `create_order`.

**Seeds:** `[b"order", buyer_pubkey, product_id_le_bytes]`  
**Space:** 110 bytes

| Field | Type | Description |
|---|---|---|
| `order_id` | `u64` | Equal to `product_id` passed at creation |
| `buyer` | `Pubkey` | Wallet that created the order |
| `merchant` | `Pubkey` | Merchant wallet address |
| `amount` | `u64` | Net USDC lamports (after fee deduction) |
| `platform_fee` | `u64` | Fee deducted in USDC lamports |
| `status` | `OrderStatus` | Current state of the order (see enum below) |
| `product_id` | `u64` | Product identifier, also used in PDA seeds |
| `risk_score` | `u8` | AI fraud score 0–100, written by bot |
| `content_hash` | `[u8; 32]` | IPFS or content hash for digital delivery |
| `created_at` | `i64` | Unix timestamp at order creation |
| `is_verified_merchant` | `bool` | Off-chain KYC flag passed by frontend |
| `is_escrowed` | `bool` | True if order went through escrow path |
| `bump` | `u8` | PDA canonical bump |

**`OrderStatus` Enum**

| Variant | Meaning |
|---|---|
| `Pending` | Direct path — funds sent, awaiting completion |
| `Escrowed` | High-value — funds held in escrow PDA token account |
| `Completed` | Successfully settled |
| `Cancelled` | Cancelled, buyer refunded |
| `Disputed` | Buyer raised a dispute |
| `Resolved` | Admin resolved the dispute |

---

### `EscrowAccount`

Tracks metadata for a locked escrow. Paired with an SPL token account that holds the actual USDC.

**Seeds:** `[b"escrow", buyer_pubkey, product_id_le_bytes]`  
**Space:** 82 bytes

| Field | Type | Description |
|---|---|---|
| `order_id` | `u64` | Matching order ID |
| `buyer` | `Pubkey` | Buyer's wallet |
| `merchant` | `Pubkey` | Merchant's wallet |
| `amount` | `u64` | Net USDC lamports in escrow (fee excluded) |
| `locked` | `bool` | True while funds are locked |
| `bump` | `u8` | PDA canonical bump (used as signer seed for token transfers) |

> **Important:** The `EscrowAccount` PDA acts as the SPL token account authority. Token releases are signed using `CpiContext::new_with_signer` with seeds `[b"escrow", buyer_pubkey, product_id_le_bytes, bump]`.

---

### `DailySpend`

Per-wallet daily USDC spend tracker. Created on first order and reused across days.

**Seeds:** `[b"daily_spend", buyer_pubkey]`  
**Space:** 49 bytes

| Field | Type | Description |
|---|---|---|
| `wallet` | `Pubkey` | Owner wallet |
| `amount_spent` | `u64` | Cumulative USDC lamports spent today |
| `day_timestamp` | `i64` | Unix timestamp of the start of the current day (`unix_timestamp / 86400 * 86400`) |
| `bump` | `u8` | PDA canonical bump |

The daily counter is reset automatically inside `create_order` whenever `day_timestamp` is older than the current UTC day. No separate crank or admin call is needed.

---

### `BuyerReputation`

Per-buyer XP and tier state. Must be initialized by the buyer before they can receive XP.

**Seeds:** `[b"buyer_rep", buyer_pubkey]`  
**Space:** 45 bytes

| Field | Type | Description |
|---|---|---|
| `wallet` | `Pubkey` | Owner wallet |
| `total_xp` | `u64` | Cumulative XP earned |
| `current_tier` | `u8` | 0 = Bronze, 1 = Silver, 2 = Gold |
| `has_badge` | `[bool; 3]` | Whether badge has been minted for each tier |
| `bump` | `u8` | PDA canonical bump |

**XP Thresholds**

| XP | Tier | Badge Token ID |
|---|---|---|
| 0 – 99 | Bronze (0) | — |
| 100 – 499 | Silver (1) | 1 |
| 500+ | Gold (2) | 2 |

---

### `MerchantReputation`

Per-merchant order and dispute stats.

**Seeds:** `[b"merchant_rep", merchant_pubkey]`  
**Space:** 60 bytes

| Field | Type | Description |
|---|---|---|
| `wallet` | `Pubkey` | Merchant wallet |
| `total_orders` | `u64` | Total settled orders |
| `disputes_raised` | `u64` | Total orders that had a dispute |
| `score` | `u64` | 0–1000 quality score, starts at 500 |
| `has_badge` | `[bool; 3]` | Badge slots (reserved for future use) |
| `bump` | `u8` | PDA canonical bump |

**Score Adjustments**

| Event | Delta |
|---|---|
| Order settled without dispute | +10 (capped at 1000) |
| Dispute raised on order | −20 (floored at 0 via `saturating_sub`) |

---

## Instructions

### Config Instructions

#### `initialize_config`

Creates the `PlatformConfig` PDA. Called once by the deployer.

**Signer:** `admin`

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `daily_spend_limit` | `u64` | Per-wallet daily cap in USDC lamports |
| `admin_approval_threshold` | `u64` | Threshold above which orders go to escrow |
| `platform_fee_bps` | `u16` | Fee in basis points (max 10000) |
| `refund_window` | `i64` | Dispute window in seconds |

**Accounts required:** `admin` (signer, mut), `bot` (CHECK), `treasury` (CHECK), `config` (init PDA), `system_program`

Reverts with `InvalidFee` if `platform_fee_bps > 10000`.

---

#### `update_config`

Updates all four config parameters. Admin-only.

**Signer:** `admin`  
**Validation:** `admin.key() == config.admin`

**Accounts required:** `admin` (signer), `config` (mut PDA)

---

### Order Instructions

#### `create_order`

The primary buyer-facing instruction. Creates an `Order` PDA, checks daily spend, computes the platform fee, and routes payment.

**Signer:** `buyer`

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `product_id` | `u64` | Product identifier — also used in PDA seeds |
| `amount` | `u64` | Total USDC lamports buyer is paying (gross, before fee) |
| `is_verified_merchant` | `bool` | Off-chain KYC flag from frontend |

**Fee computation:**
```
fee        = (amount * platform_fee_bps) / 10_000
net_amount = amount - fee
```

**Settlement path (determined by `amount` vs `admin_approval_threshold`):**

| Condition | Path | Token flow |
|---|---|---|
| `amount <= threshold` | **Direct** | `fee` → treasury token account; `net_amount` → merchant token account |
| `amount > threshold` | **Escrow** | `amount` (full gross) → escrow token account; `EscrowAccount.locked = true` |

> On the direct path, the buyer signs two token transfers in one instruction. On the escrow path, a single transfer moves the full gross amount; fee split happens at release.

**Accounts required:** `buyer` (signer, mut), `merchant_wallet` (CHECK), `order` (init PDA), `escrow_account` (init_if_needed PDA), `daily_spend` (init_if_needed PDA), `config` (PDA), `buyer_token_account` (mut), `merchant_token_account` (mut), `escrow_token_account` (mut), `treasury_token_account` (mut), `token_program`, `system_program`

Emits: `OrderCreated`

---

#### `complete_order`

Marks a `Pending` (direct path) order as `Completed`.

**Signer:** `buyer`  
**Constraint:** `has_one = buyer`

**Accounts required:** `buyer` (signer), `order` (mut PDA)

Emits: `OrderCompleted`

---

#### `deliver_digital_product`

Merchant records an IPFS CID or content hash on-chain for a `Pending` or `Escrowed` order. The caller must be the order's stored `merchant` pubkey.

**Signer:** `merchant`

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `content_hash` | `[u8; 32]` | IPFS CID or SHA-256 content hash |

**Accounts required:** `merchant` (signer), `order` (mut PDA)

Emits: `DigitalProductDelivered`

---

#### `release_escrow`

Admin releases escrowed funds to the merchant with fee deduction. Order must be in `Escrowed` status.

**Signer:** `admin`  
**Validation:** `admin.key() == config.admin`

**Token flows (signed by `EscrowAccount` PDA):**
```
escrow_token_account → merchant_token_account  (net_amount = escrow.amount)
escrow_token_account → treasury_token_account  (fee = order.platform_fee)
```

**Accounts required:** `admin` (signer), `config` (PDA), `order` (mut PDA), `escrow_account` (mut PDA), `escrow_token_account` (mut), `merchant_token_account` (mut), `treasury_token_account` (mut), `token_program`

Emits: `OrderCompleted`

---

#### `cancel_order`

Cancels a `Pending` or `Escrowed` order. Only the buyer can cancel. For escrowed orders, the full gross amount (`net + fee`) is refunded.

**Signer:** `buyer`  
**Constraint:** `has_one = buyer`

**Refund logic:**
- If `order.is_escrowed == false`: no token movement (direct path funds already sent, this just changes status)
- If `order.is_escrowed == true`: `total_refund = escrow.amount + order.platform_fee` is transferred from escrow back to buyer

**Accounts required:** `buyer` (signer), `order` (mut PDA), `escrow_account` (mut PDA), `escrow_token_account` (mut), `buyer_token_account` (mut), `token_program`

Emits: `OrderCancelled`

---

### Dispute Instructions

#### `raise_dispute`

Buyer flags an order as disputed. Valid for `Pending`, `Escrowed`, or `Completed` orders within `refund_window` seconds of `created_at`.

**Signer:** `buyer`  
**Constraint:** `has_one = buyer`

**Validation:**
- `clock.unix_timestamp - order.created_at <= config.refund_window`

**Accounts required:** `buyer` (signer), `config` (PDA), `order` (mut PDA)

Emits: `OrderDisputed`

---

#### `resolve_dispute`

Admin resolves a `Disputed` order. Only acts on token accounts if the order was escrowed (`order.is_escrowed == true`).

**Signer:** `admin`  
**Validation:** `admin.key() == config.admin`

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `favor_buyer` | `bool` | `true` → refund buyer; `false` → pay merchant |

**Token flows (escrow path only, signed by `EscrowAccount` PDA):**

| `favor_buyer` | Flow |
|---|---|
| `true` | `escrow → buyer` (full gross: `escrow.amount + order.platform_fee`) |
| `false` | `escrow → merchant` (`escrow.amount`), then `escrow → treasury` (`order.platform_fee`) |

For direct-path orders (`is_escrowed == false`), status is updated to `Resolved` with no additional token movements (funds already disbursed at creation).

**Accounts required:** `admin` (signer), `config` (PDA), `order` (mut PDA), `escrow_account` (mut PDA), `escrow_token_account` (mut), `buyer_token_account` (mut), `merchant_token_account` (mut), `treasury_token_account` (mut), `token_program`

Emits: `DisputeResolved`

---

#### `set_risk_score`

Bot wallet writes a 0–100 fraud score to an order. The bot address is stored in `PlatformConfig.bot` — only that exact pubkey may call this instruction.

**Signer:** `bot`  
**Validation:** `bot.key() == config.bot`

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `score` | `u8` | Fraud score 0–100 |

**Accounts required:** `bot` (signer), `config` (PDA), `order` (mut PDA)

Emits: `RiskScoreSet`

---

#### `withdraw_treasury`

Admin withdraws USDC from the treasury token account to their own token account.

**Signer:** `admin`  
**Validation:** `admin.key() == config.admin`, `treasury_token_account.amount >= amount`

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `amount` | `u64` | USDC lamports to withdraw |

**Accounts required:** `admin` (signer), `config` (PDA), `treasury_token_account` (mut), `admin_token_account` (mut), `token_program`

---

### Reputation Instructions

#### `initialize_buyer_rep`

Creates a `BuyerReputation` PDA for the buyer. Must be called before the buyer can receive XP. Payer is the buyer themselves.

**Signer:** `buyer`

**Accounts required:** `buyer` (signer, mut), `buyer_rep` (init PDA), `system_program`

---

#### `award_xp`

Awards XP to a buyer's reputation account. Called by the admin off-chain after a successful order settlement. Automatically checks for tier upgrades and emits a `TierUpgraded` event if a threshold is crossed.

**Signer:** `admin`  
**Validation:** `admin.key() == config.admin`

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `_order_id` | `u64` | Order reference (for indexer tracking) |
| `xp_amount` | `u64` | XP to award (typically 10 per order) |

XP accumulates with `saturating_add` — no overflow possible.

**Accounts required:** `admin` (signer), `config` (PDA), `buyer_wallet` (CHECK), `buyer_rep` (mut PDA)

Emits: `XPAwarded`, optionally `TierUpgraded`

---

#### `initialize_merchant_rep`

Creates a `MerchantReputation` PDA for the merchant. Payer is the merchant. Initial score is set to 500 (neutral midpoint of the 0–1000 range).

**Signer:** `merchant`

**Accounts required:** `merchant` (signer, mut), `merchant_rep` (init PDA), `system_program`

---

#### `update_merchant_score`

Updates a merchant's score and dispute counter after an order settlement. Called by the admin off-chain.

**Signer:** `admin`  
**Validation:** `admin.key() == config.admin`

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `_order_id` | `u64` | Order reference |
| `dispute_raised` | `bool` | Whether this order had a dispute |

**Accounts required:** `admin` (signer), `config` (PDA), `merchant_wallet` (CHECK), `merchant_rep` (mut PDA)

---

#### `mint_tier_badge`

Records badge ownership in the `BuyerReputation` PDA. Callable by the buyer once their `current_tier` is above Bronze (tier ≥ 1) and the badge has not already been minted for that tier.

**Signer:** `buyer`  
**Constraint:** `buyer_rep.wallet == buyer.key()`

Reverts with `InsufficientXP` if `current_tier == 0` (Bronze), and `BadgeAlreadyMinted` if the badge was already recorded.

**Accounts required:** `buyer` (signer), `buyer_rep` (mut PDA)

Emits: `TierBadgeMinted`

---

## Order Lifecycle

```
      Buyer calls create_order(product_id, amount, ...)
                       │
          ┌────────────┴──────────────────┐
          │                               │
   amount <= threshold            amount > threshold
   (DIRECT PATH)                  (ESCROW PATH)
          │                               │
   fee → treasury                 full amount → escrow
   net → merchant                 status = Escrowed
   status = Pending                       │
          │                      Admin calls release_escrow()
          │                               │
          │                        net → merchant
          │                        fee → treasury
          │                        status = Completed
          │                               │
          └──────────────┬────────────────┘
                         │ (from Pending or Escrowed)
           ┌─────────────┼──────────────────────┐
           ▼             ▼                      ▼
    complete_order()  cancel_order()      raise_dispute()
    (Pending only)    (buyer only)        (buyer, within window)
           │               │                    │
    status=Completed  status=Cancelled     status=Disputed
                           │                    │
                   escrowed? full refund  resolve_dispute()
                   to buyer               (admin)
                                    ┌──────────┴──────────────┐
                                    ▼                         ▼
                              favor_buyer=true        favor_buyer=false
                              full refund to buyer    net → merchant
                              status=Resolved         fee → treasury
                                                      status=Resolved
```

---

## Two Settlement Paths

A key design difference from the EVM version is that the Solana program has **two distinct token flows** at order creation, determined by `amount` vs `admin_approval_threshold`:

### Direct Path (`amount <= threshold`)

Funds split immediately at `create_order`:

```
Buyer Token Account ──(net_amount)──► Merchant Token Account
Buyer Token Account ──(fee)─────────► Treasury Token Account
Order status → Pending
```

The order is considered settled on the merchant side at creation. `complete_order` simply marks the status as `Completed` with no additional token movement.

### Escrow Path (`amount > threshold`)

Full gross amount held until admin review:

```
Buyer Token Account ──(amount)──► Escrow Token Account
EscrowAccount.locked = true
Order status → Escrowed
```

At `release_escrow`, the EscrowAccount PDA signs two CPI transfers:

```
Escrow Token Account ──(net_amount)──► Merchant Token Account
Escrow Token Account ──(fee)─────────► Treasury Token Account
```

---

## Fee Model

```
fee        = (amount × platform_fee_bps) / 10,000
net_amount = amount - fee
```

**Example** — 150 USDC at 2.5% (250 bps):

```
fee        = 150,000,000 × 250 / 10,000 = 3,750,000  (3.75 USDC)
net_amount = 150,000,000 − 3,750,000   = 146,250,000 (146.25 USDC)
```

On the **direct path**, both transfers happen in the same `create_order` instruction. On the **escrow path**, the full `150,000,000` goes to the escrow token account, and the fee is split out only at `release_escrow` or `resolve_dispute`.

For **cancellations** on the escrow path, the full gross amount (`net + fee`) is refunded — the fee is not retained.

---

## Dispute Resolution

**Step 1** — Buyer calls `raise_dispute`:
- Must be within `config.refund_window` seconds of `order.created_at`
- Valid from `Pending`, `Escrowed`, or `Completed` status
- Moves status to `Disputed`

**Step 2** — Admin calls `resolve_dispute(order_id, favor_buyer)`:

| `favor_buyer` | Token movement (escrow path) | Status |
|---|---|---|
| `true` | `escrow → buyer` (full gross: `escrow.amount + platform_fee`) | `Resolved` |
| `false` | `escrow → merchant` (net), `escrow → treasury` (fee) | `Resolved` |

For direct-path orders, only the status is updated — no token movement occurs because funds were already disbursed at creation.

---

## Reputation & Badges

### Buyer XP Flow

1. Buyer calls `initialize_buyer_rep` once to create their PDA
2. Admin calls `award_xp` after each order settlement (off-chain trigger)
3. `award_xp` uses `saturating_add` to update XP and checks:
   - If `total_xp >= 500` → `current_tier = 2` (Gold)
   - If `total_xp >= 100` → `current_tier = 1` (Silver)
   - Otherwise → `current_tier = 0` (Bronze)
4. If `current_tier` increased, `TierUpgraded` is emitted
5. Buyer can then call `mint_tier_badge` to record the badge in their PDA

### Badge Rules

- Badge is stored as `has_badge: [bool; 3]` in the `BuyerReputation` PDA (indices 0/1/2 = Bronze/Silver/Gold)
- Calling `mint_tier_badge` on a tier already in `has_badge` reverts with `BadgeAlreadyMinted`
- Calling `mint_tier_badge` while at Bronze (`current_tier == 0`) reverts with `InsufficientXP`

### Merchant Scoring

- Initial score: **500** (neutral midpoint of 0–1000 range)
- Settled without dispute: **+10** (capped at 1000 via `.min(1000)`)
- Dispute raised: **−20** (floored at 0 via `saturating_sub`)

Score formula is a running aggregate — not a ratio. Unlike the EVM version, the Solana version uses a fixed-delta approach rather than recalculating from totals each time.

---

## PDA Seeds Reference

| Account | Seeds | Derivation |
|---|---|---|
| `PlatformConfig` | `[b"platform_config"]` | `Pubkey::find_program_address(&[b"platform_config"], &program_id)` |
| `Order` | `[b"order", buyer_pubkey, product_id_le_bytes]` | `product_id.to_le_bytes()` — 8 bytes little-endian |
| `EscrowAccount` | `[b"escrow", buyer_pubkey, product_id_le_bytes]` | Same `product_id` as the Order |
| `DailySpend` | `[b"daily_spend", buyer_pubkey]` | Per-wallet, reused across orders |
| `BuyerReputation` | `[b"buyer_rep", buyer_pubkey]` | Per-wallet |
| `MerchantReputation` | `[b"merchant_rep", merchant_pubkey]` | Per-merchant wallet |

> All seeds use the **canonical bump** stored in each account's `bump` field. Always use `find_program_address` client-side to derive the PDA and bump before passing them in.

---

## Account Sizes

| Account | Space (bytes) | Breakdown |
|---|---|---|
| `PlatformConfig` | 91 | 8 disc + 32 + 32 + 8 + 8 + 2 + 8 + 32 + 1 |
| `Order` | 110 | 8 disc + 8 + 32 + 32 + 8 + 8 + 1 + 8 + 1 + 32 + 8 + 1 + 1 + 1 |
| `EscrowAccount` | 82 | 8 disc + 8 + 32 + 32 + 8 + 1 + 1 |
| `DailySpend` | 49 | 8 disc + 32 + 8 + 8 + 1 |
| `BuyerReputation` | 45 | 8 disc + 32 + 8 + 1 + 3 + 1 |
| `MerchantReputation` | 60 | 8 disc + 32 + 8 + 8 + 8 + 3 + 1 |

Account rent (in SOL) depends on current Solana rent-exemption rates. All accounts are initialized as rent-exempt; the payer is the signer of the respective `init` instruction.

---

## Events Reference

All events are emitted via Anchor's `emit!` macro and can be subscribed to using `program.addEventListener` in the TypeScript SDK.

| Event | Fields | Emitted By |
|---|---|---|
| `OrderCreated` | `order_id, buyer, merchant, amount` | `create_order` |
| `OrderCompleted` | `order_id` | `complete_order`, `release_escrow` |
| `OrderCancelled` | `order_id` | `cancel_order` |
| `OrderDisputed` | `order_id, buyer` | `raise_dispute` |
| `DisputeResolved` | `order_id, favor_buyer` | `resolve_dispute` |
| `RiskScoreSet` | `order_id, score` | `set_risk_score` |
| `XPAwarded` | `buyer, amount` | `award_xp` |
| `TierUpgraded` | `buyer, tier` | `award_xp` (on tier change) |
| `TierBadgeMinted` | `wallet, tier` | `mint_tier_badge` |
| `DigitalProductDelivered` | `order_id, content_hash` | `deliver_digital_product` |

---

## Error Codes

| Error Code | Message | Condition |
|---|---|---|
| `InvalidOrderStatus` | Order already completed or cancelled | Status is not valid for the requested operation |
| `RefundWindowExpired` | Refund window has expired, cannot raise dispute | `elapsed > config.refund_window` |
| `DailyLimitExceeded` | Daily spend limit exceeded for this wallet | New cumulative spend exceeds `daily_spend_limit` |
| `Unauthorized` | Unauthorized: you don't have the required role | Signer does not match admin/bot/buyer/merchant |
| `InvalidRiskScore` | Risk score must be between 0 and 100 | `score > 100` |
| `NotDisputed` | Order is not in disputed state | `resolve_dispute` called on non-Disputed order |
| `InvalidFee` | Platform fee bps cannot exceed 10000 | `platform_fee_bps > 10000` |
| `InsufficientTreasury` | Insufficient treasury balance | `treasury_token_account.amount < amount` |
| `NotEscrowed` | Order not in escrowed state | `release_escrow` called on non-Escrowed order |
| `NotPending` | Order not in pending state | `complete_order` called on non-Pending order |
| `MerchantNotVerified` | Merchant not verified for this order | Reserved — not currently enforced at runtime |
| `InsufficientXP` | XP not enough for badge mint | `current_tier == 0` on `mint_tier_badge` |
| `BadgeAlreadyMinted` | Badge already minted for this tier | `has_badge[tier] == true` |

---

## Deployment Guide

### Prerequisites

```bash
# Install Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install 0.29.0
avm use 0.29.0

# Verify
anchor --version   # anchor-cli 0.29.0
solana --version
```

### Build

```bash
anchor build
```

The compiled `.so` is output to `target/deploy/commerce_core.so`. The IDL is at `target/idl/commerce_core.json`.

### Deploy

```bash
# Localnet
solana config set --url localhost
solana-test-validator &
anchor deploy

# Devnet
solana config set --url devnet
anchor deploy --provider.cluster devnet
```

### Initialize PlatformConfig

After deploying, call `initialize_config` once:

```typescript
await program.methods
  .initializeConfig(
    new BN(5_000_000_000),  // dailySpendLimit:        5,000 USDC
    new BN(100_000_000),    // adminApprovalThreshold: 100 USDC
    250,                    // platformFeeBps:         2.5%
    new BN(604_800)         // refundWindow:           7 days
  )
  .accounts({
    admin:         adminKeypair.publicKey,
    bot:           botPublicKey,
    treasury:      treasuryPublicKey,
    config:        configPDA,
    systemProgram: SystemProgram.programId,
  })
  .signers([adminKeypair])
  .rpc();
```

---

## Integration Guide

### Deriving PDAs (TypeScript)

```typescript
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

const PROGRAM_ID = new PublicKey("8YPzbK3t3vgJkV2dPo33wDDhyaV3oghtUn9RbQf2aSDx");

// PlatformConfig
const [configPDA, configBump] = PublicKey.findProgramAddressSync(
  [Buffer.from("platform_config")],
  PROGRAM_ID
);

// Order PDA
const productId = new BN(42);
const [orderPDA, orderBump] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("order"),
    buyerPublicKey.toBuffer(),
    productId.toArrayLike(Buffer, "le", 8),
  ],
  PROGRAM_ID
);

// Escrow PDA
const [escrowPDA, escrowBump] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("escrow"),
    buyerPublicKey.toBuffer(),
    productId.toArrayLike(Buffer, "le", 8),
  ],
  PROGRAM_ID
);

// DailySpend PDA
const [dailySpendPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("daily_spend"), buyerPublicKey.toBuffer()],
  PROGRAM_ID
);

// BuyerReputation PDA
const [buyerRepPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("buyer_rep"), buyerPublicKey.toBuffer()],
  PROGRAM_ID
);

// MerchantReputation PDA
const [merchantRepPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("merchant_rep"), merchantPublicKey.toBuffer()],
  PROGRAM_ID
);
```

### Placing an Order

```typescript
const amount = new BN(150_000_000); // 150 USDC

await program.methods
  .createOrder(productId, amount, true)
  .accounts({
    buyer:                 buyerKeypair.publicKey,
    merchantWallet:        merchantPublicKey,
    order:                 orderPDA,
    escrowAccount:         escrowPDA,
    dailySpend:            dailySpendPDA,
    config:                configPDA,
    buyerTokenAccount:     buyerUsdcTokenAccount,
    merchantTokenAccount:  merchantUsdcTokenAccount,
    escrowTokenAccount:    escrowUsdcTokenAccount,
    treasuryTokenAccount:  treasuryUsdcTokenAccount,
    tokenProgram:          TOKEN_PROGRAM_ID,
    systemProgram:         SystemProgram.programId,
  })
  .signers([buyerKeypair])
  .rpc();
```

### Listening to Events

```typescript
program.addEventListener("OrderCreated", (event) => {
  console.log(`Order ${event.orderId} created — ${event.amount} lamports`);
});

program.addEventListener("RiskScoreSet", (event) => {
  console.log(`Order ${event.orderId} risk score: ${event.score}`);
});
```

### Reading Order State

```typescript
const order = await program.account.order.fetch(orderPDA);
console.log(order.status);      // { pending: {} } | { escrowed: {} } | ...
console.log(order.riskScore);   // 0–100
console.log(order.contentHash); // [u8; 32]
```

### USDC Lamport Reference

| USDC | Lamports (`u64`) |
|---|---|
| 1 USDC | 1,000,000 |
| 10 USDC | 10,000,000 |
| 100 USDC | 100,000,000 |
| 500 USDC | 500,000,000 |
| 1,000 USDC | 1,000,000,000 |
| 5,000 USDC | 5,000,000,000 |

---

## Security Considerations

**PDA signer security** — All escrow token transfers on the escrow path are signed using `CpiContext::new_with_signer` with the `EscrowAccount` PDA seeds. No private key is ever used to authorize the movement of escrowed funds. The bump stored in `EscrowAccount.bump` is the canonical bump derived at initialization.

**Borrow checker pattern in `resolve_dispute`** — All values from `escrow_account` and `order` (bump, amounts, keys) are copied into local variables before the mutable borrow of `escrow_account.locked`. This avoids Rust's simultaneous mutable and immutable borrow conflict that would otherwise prevent reading from accounts after a mutable reference is taken.

**`saturating_*` arithmetic** — XP (`award_xp`) and merchant score (`update_merchant_score`) use `saturating_add` and `saturating_sub` respectively, making integer overflow and underflow impossible at the language level.

**Daily spend auto-reset** — The `DailySpend` account resets inside `create_order` based on `clock.unix_timestamp`. There is no separate crank needed, but the reset depends on an order being placed. A wallet that has not placed an order since the previous day will appear to have a non-zero spent amount until the next `create_order` call, at which point it resets. `getDailySpent` should always be read relative to the current UTC day on the client side.

**`init_if_needed` on `EscrowAccount` and `DailySpend`** — These accounts are initialized with `init_if_needed` to avoid requiring a separate setup transaction. If an `EscrowAccount` already exists for the same `(buyer, product_id)` pair, the instruction will reuse it. Clients should ensure `product_id` values are unique per order to avoid PDA collisions.

**Direct-path dispute limitation** — For orders on the direct path (`is_escrowed == false`), funds are already disbursed at `create_order`. If a dispute is subsequently raised and resolved in the buyer's favor, no on-chain refund is possible through this contract — refund would need to happen out-of-band. Platforms should consider routing all orders above a meaningful threshold through escrow.

**Treasury withdraw authority** — `withdraw_treasury` requires the `admin` signer and checks `admin.key() == config.admin`. The treasury SPL token account's authority must separately be the `admin` wallet for the transfer to succeed. Ensure the treasury token account's authority matches the configured admin at deployment.

---

*Quilvion Protocol — Solana Edition · Anchor 0.29.0 · Rust*