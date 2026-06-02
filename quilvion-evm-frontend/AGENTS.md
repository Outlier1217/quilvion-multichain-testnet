# AGENTS.md — Quilvion AI Agent System

This document describes the AI agents, models, and autonomous decision systems integrated into the Quilvion Web3 commerce platform. It is intended for developers, auditors, and investors who need to understand how AI is used across the stack.

---

## Overview

Quilvion uses two distinct AI systems that operate independently and serve different purposes:

| System | Model | Latency | Purpose |
|---|---|---|---|
| Fraud Detection | XGBoost (ML) | ~50ms | Risk scoring on every purchase |
| Language Model | Groq LLaMA 3.3 70B | ~1–2s | Explanations, chat, generation |

These systems are intentionally separated. The ML model produces a score in milliseconds before the LLM explanation loads — buyers see the risk level immediately without waiting for language generation.

---

## Agent 1 — Fraud Detection (XGBoost)

### What it does

Every time a buyer attempts a purchase, this agent runs before the wallet signs the transaction. It produces a risk score from 0 to 100 and triggers one of three automated actions based on the result.

### Inputs

```json
{
  "order_id": "string",
  "buyer_wallet": "0x...",
  "merchant_wallet": "0x...",
  "amount_usdc": 149.0,
  "chain": "sui",
  "buyer_wallet_age_days": 45,
  "buyer_total_orders": 3
}
```

### Output

```json
{
  "order_id": "string",
  "risk_score": 34,
  "risk_level": "LOW",
  "signals": ["New wallet — 45 days old", "First order with this merchant"],
  "auto_action": "AUTO_COMPLETE",
  "flagged": false
}
```

### Risk levels and actions

| Score | Level | Action |
|---|---|---|
| 0–49 | LOW | `AUTO_COMPLETE` — transaction proceeds instantly |
| 50–74 | MEDIUM | `ESCROW_HOLD` — funds held on-chain until delivery |
| 75–100 | HIGH / CRITICAL | `BLOCKED` — UI prevents the transaction entirely |

### Signals the model considers

- Buyer wallet age in days
- Buyer's total historical orders
- Order amount relative to platform average
- First interaction with this specific merchant
- Chain context (Sui testnet)

### API endpoint

```
POST /api/risk/score
```

### Model file

```
quilvion-backend/app/ml/fraud_model.pkl
```

The model is loaded once on backend startup via the FastAPI lifespan function and kept in memory for all subsequent requests.

---

## Agent 2 — Language Model (Groq LLaMA 3.3 70B)

This agent handles all natural language tasks across the platform. It is invoked through six distinct features, each with a dedicated system prompt. All prompts enforce short, plain-text responses — no markdown, no bullet points, maximum 2–4 sentences per response.

### Architecture

```
Frontend event (buy attempt / chat message / form submit)
        ↓
FastAPI endpoint
        ↓
System prompt + structured context injected
        ↓
Groq API → LLaMA 3.3 70B
        ↓
Plain text response returned
        ↓
Frontend displays inline
```

### Client module

```
quilvion-backend/app/llm/claude_client.py
```

All six features call the same `call_claude(system_prompt, user_message)` function — the function name is kept generic so no routes need changing if the underlying model changes.

---

## Feature 1 — Fraud Explanation

**Trigger:** Automatically after the ML risk score returns on the Buy Modal

**Purpose:** The XGBoost model produces a number — this feature translates that number into a sentence a buyer can understand. It mirrors the approach used by Stripe Radar and similar fintech fraud systems.

**System prompt behaviour:**
- Maximum 2 sentences
- Must reference specific signals that drove the score
- Must end with one recommended action: Approve, Review, or Block

**Example output:**
> "This order was flagged because the buyer wallet is 12 days old and the purchase is 6x their order average. Recommend admin review before releasing funds."

**API endpoint:**
```
POST /api/llm/fraud-explanation
```

**Input includes:** risk score, risk level, signals array, buyer wallet, merchant wallet, amount, wallet age, total orders

---

## Feature 2 — Buyer Chat Assistant

**Trigger:** Buyer sends a message in the AI Help tab

**Purpose:** A conversational assistant that answers questions about the marketplace, escrow mechanics, disputes, and product discovery. Unlike a static FAQ, this agent receives the **live product catalog from PostgreSQL** as context on every message — so it can answer questions like *"show me courses under $50"* or *"which merchant has the highest success rate"* accurately.

**What the agent receives per message:**
- Full list of approved products (name, price, category, merchant, tags)
- Buyer wallet address and chain
- The buyer's question

**What it returns:**
- A short plain-text reply (max 3 sentences)
- An array of up to 3 relevant products with clickable chips in the UI

**System prompt behaviour:**
- Must be brief and direct
- If recommending a product, must name it and its price explicitly
- If data is unavailable, must say so in one sentence

**API endpoint:**
```
POST /api/buyer/ask
```

---

## Feature 3 — Product Description Generator

**Trigger:** Merchant clicks "✨ AI Generate" in the product form

**Purpose:** Converts a merchant's raw notes (product name, category, tags, price) into a polished 40-word product listing. This reduces the time to list a product and improves listing quality across the marketplace.

**System prompt behaviour:**
- Maximum 40 words
- Active voice only
- Output is the description text only — no title, no labels

**Example:**
- Input: `python course, 10 hours, beginner, includes projects`
- Output: `"A comprehensive 10-hour Python course built for complete beginners. Includes 5 hands-on projects so you leave with a real portfolio."`

**API endpoint:**
```
POST /api/merchant/generate-description
```

---

## Feature 4 — Dispute Summarizer

**Trigger:** Admin opens a dispute for review

**Purpose:** When a buyer raises a dispute, the admin needs to understand the full context quickly. This agent compiles all available data — buyer history, product details, merchant track record, risk score, timeline — into a single paragraph with a clear recommended action.

**System prompt behaviour:**
- Maximum 3 sentences
- Must include: buyer, product, amount, issue, merchant reputation
- Must end with exactly one of: Refund / Release / Investigate

**Example output:**
> "Buyer (wallet: 0xAb0…) purchased 'Advanced React Course' for 120 USDC on May 3 and reports non-delivery after 72 hours. Merchant has 34 prior orders at 96% success rate and a risk score of 12/100 on this transaction. Recommend: Investigate — merchant has a clean record but the delivery window has been exceeded."

**API endpoint:**
```
POST /api/llm/dispute-summary
```

---

## Feature 5 — Merchant Risk Profiler

**Trigger:** Admin reviews a merchant application or profile

**Purpose:** Generates a concise merchant profile card for the admin, summarising order volume, success rate, dispute history, and an overall risk rating. Turns raw database numbers into a readable risk assessment.

**System prompt behaviour:**
- Maximum 3 sentences
- Must cover: orders, success rate, disputes, overall risk
- Must end with: `Overall Risk: Low / Medium / High`

**Example output:**
> "This merchant has completed 89 orders with a 96% success rate and two disputes, both resolved in their favour. Average delivery time is 1.8 hours. Overall Risk: Low."

**API endpoint:**
```
POST /api/llm/merchant-profile
```

---

## Feature 6 — XP Tier Notification

**Trigger:** Buyer reaches a new loyalty tier (Bronze → Silver → Gold)

**Purpose:** Generates a personalized upgrade message using the buyer's actual order data — not a generic congratulations. This creates a psychological hook that reinforces continued use of the platform.

**System prompt behaviour:**
- Maximum 2 sentences
- Must reference the buyer's specific numbers (orders completed, USDC spent, fraud score average)
- Warm and encouraging tone

**Example output:**
> "You've reached Silver tier — 12 orders completed and 340 USDC spent on Quilvion. Your fraud score averaged just 8/100 across all transactions, making you one of our most trusted buyers."

**API endpoint:**
```
POST /api/llm/xp-message
```

---

## Safety and Guardrails

### ML model guardrails

- Score ≥ 75 hard-blocks the UI — the confirm button is disabled and the wallet is never prompted
- Signals are surfaced to the buyer transparently so they understand why a transaction was flagged
- The model does not store or log wallet addresses beyond the current request

### LLM guardrails

- All system prompts enforce plain-text output — no markdown, no links, no code
- Response length is capped at 2–4 sentences per feature
- The buyer chat assistant only has access to approved product data — it cannot access pending or rejected listings
- The LLM has no ability to initiate transactions, modify database records, or interact with the blockchain directly

### Admin authentication

The admin panel is protected by a secret key passed as an HTTP header (`x-admin-secret`). All admin routes validate this header before executing. The secret is set via environment variable and never exposed to the frontend bundle.

---

## Data flow summary

```
Buyer clicks Buy Now
        │
        ├──► POST /api/risk/score
        │         XGBoost scores the order (~50ms)
        │         Risk score + signals returned to UI
        │
        └──► POST /api/llm/fraud-explanation (async)
                  LLaMA generates plain-text explanation (~1–2s)
                  Loads below the risk score in Buy Modal

Buyer sends chat message
        │
        └──► POST /api/buyer/ask
                  PostgreSQL queried for approved products
                  Full catalog injected into LLM context
                  LLaMA replies with text + product array
                  UI renders product chips below the message

Merchant submits product form
        │
        └──► POST /api/merchant/generate-description (optional)
                  Name + tags + category sent to LLaMA
                  40-word description returned and auto-filled

Admin approves merchant / product
        │
        └──► PATCH /api/admin/merchants/{id}/status
             PATCH /api/admin/products/{id}/status
                  Status updated in PostgreSQL
                  Product appears in buyer marketplace immediately
```

---

## Environment variables required for AI features

```bash
# Groq API (LLM)
GROQ_API_KEY=gsk_...

# No additional env vars needed for ML model
# Model is loaded from: app/ml/fraud_model.pkl
```

---

## Adding a new LLM feature

1. Add a new system prompt constant in `app/llm/claude_client.py`
2. Add a new route in the appropriate routes file
3. Call `call_claude(YOUR_SYSTEM_PROMPT, structured_context)` — the function handles the Groq API call
4. Return the string response directly to the frontend
5. Add the endpoint to the `root()` function in `main.py` for discoverability

The `call_claude` function signature is intentionally simple — one system prompt, one user message, one string response. This makes it easy to swap the underlying model without touching any route code.