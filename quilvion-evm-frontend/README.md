# Quilvion — AI-Powered Web3 Commerce Platform

**Quilvion** is a decentralized digital marketplace built on the **Somnia EVM Testnet**, combining on-chain escrow protection with AI-driven fraud detection and a natural language shopping assistant. It enables merchants to list digital products and buyers to purchase them securely — with every transaction protected by Solidity smart contracts and analyzed by machine learning.

---

## Live Architecture
Buyer / Merchant / Admin
↓
Next.js 15 Frontend (quilvion.xyz)
↓
FastAPI Backend (Python)
├── XGBoost ML Model (fraud scoring)
└── Groq LLaMA 3.3 70B (LLM)
↓
PostgreSQL (Neon) — product, merchant & order DB
↓
Somnia EVM Testnet — on-chain escrow & settlement

---

## Smart Contracts — Somnia Testnet (Chain ID: 50312)

| Contract | Address |
|---|---|
| CommerceCore | `0xA1fa19D58335b1341c5B8217E26C766fB605B1bA` |
| EscrowLogic | `0xCE968012e486861B606Fe4790a2cf917695133c9` |
| ConfigManager | `0xbbb3907C31E127664f3E7dA49fF5Fe4c748f9A6c` |
| ReputationManager | `0x79B47945387a366b8a34B5B198AE21aEfd6b57A6` |
| SomniaAgentController | `0xdBB640163565C62512c69fEe8fd03E723BB30b40` |
| MockUSDC | `0xDbA3C917F0710869e9826F37c1e1ee0fcBa951ad` |

All purchases above **500 USDC** require admin release from escrow. Under 500 USDC auto-completes on-chain instantly. Test USDC is available via the in-app faucet (backend-minted, per-wallet cooldown).

---

## Product Flows

### Buyer Flow

1. Connect MetaMask or any EVM wallet on Somnia Testnet
2. Mint test USDC from the in-app faucet
3. Browse marketplace — products fetched live from PostgreSQL
4. Filter by category or search by name / tag
5. Click a product → full detail modal with image gallery, merchant reputation, escrow terms
6. Click **Buy Now** → AI risk assessment runs (ML score + LLM explanation)
7. If risk score < 75: approve USDC spend → `createOrder` transaction submitted on Somnia
8. Track orders, release escrow, and raise disputes from the Orders tab
9. Earn XP on every order (5 XP placed, 10 XP completed) — Bronze → Silver → Gold tiers

### Merchant Flow

1. Connect EVM wallet → apply as merchant (company name, category, contact)
2. Admin reviews and approves the merchant application
3. Once approved — access the Merchant Dashboard with:
   - Revenue stats, order history, success rate
   - Product management: add, edit, delete listings
   - Up to 4 product images per listing (Cloudinary CDN)
   - AI-generated product descriptions (one click)
4. New products go to **pending** status until admin approves

### Admin Flow

1. Connect admin wallet at `/admin` (wallet-gated, no password)
2. **Overview tab** — live stats: total merchants, products, pending reviews
3. **Merchants tab** — approve / reject merchant applications
4. **Products tab** — approve / reject / delete product listings
5. **Disputes tab** — view pending escrow orders, release or raise disputes on-chain
6. **Config tab** — update protocol parameters on-chain (platform fee, thresholds, windows) via signed EVM transactions, synced to DB

---

## AI System

Quilvion integrates two AI systems that work independently:

### ML Fraud Detection (XGBoost)

Runs on every purchase attempt before the wallet signs.

**Inputs:** buyer wallet age, total orders, order amount, merchant wallet, chain

**Output:** risk score 0–100 + risk level (LOW / MEDIUM / HIGH / CRITICAL) + signals array

**Actions:**
- Score < 50 → `AUTO_COMPLETE` (instant settlement)
- Score 50–74 → `ESCROW_HOLD` (funds locked until delivery)
- Score ≥ 75 → transaction blocked, purchase prevented

The ML model runs in ~50ms — the risk score appears before the LLM explanation loads.

### LLM — Groq LLaMA 3.3 70B

Six distinct LLM features, each with a dedicated system prompt enforcing short (2–4 sentence) plain-text responses:

| Feature | Trigger | Output |
|---|---|---|
| **Fraud explanation** | After ML score on Buy Modal | Human-readable reason why the score is what it is |
| **Buyer chat assistant** | AI Help tab | Answers questions about products, escrow, disputes — with live product data from DB |
| **Product description generator** | Merchant product form | Polished 40-word listing from bullet-point inputs |
| **Dispute summarizer** | Admin dispute review | One-paragraph context summary with recommended action |
| **Merchant risk profiler** | Admin merchant review | 3-sentence profile with overall risk rating |
| **XP tier notification** | Buyer tier upgrade | Personalized 2-sentence message using real order data |

---

## Tech Stack

### Frontend
- **Next.js 15** (App Router)
- **TypeScript**
- **Tailwind CSS** + inline styles for dark theme
- **Framer Motion** — page transitions and modal animations
- **viem** — EVM wallet connection, contract reads/writes
- **Cloudinary** — product image upload and CDN delivery

### Backend
- **FastAPI** (Python)
- **SQLAlchemy** + **PostgreSQL** (Neon serverless)
- **XGBoost** — trained fraud detection model
- **Groq API** — LLaMA 3.3 70B inference
- **Cloudinary SDK** — server-side image upload
- **cryptography (Fernet)** — encrypted delivery info storage

### Blockchain
- **Somnia EVM Testnet** (Chain ID: 50312) — Solidity smart contracts
- **MockUSDC** — ERC-20 test token, backend-minted via faucet endpoint
- **CommerceCore** — order creation, escrow lock, auto-complete logic
- **EscrowLogic** — admin-controlled escrow release
- **ConfigManager** — on-chain protocol parameters (fee, threshold, windows)
- **SomniaAgentController** — autonomous AI agent tasks (fraud relay, dispute escalation, dynamic config tuning)

---

## Pages

| Route | Description |
|---|---|
| `/` | Buyer dashboard — browse, orders, AI chat |
| `/merchant` | Merchant portal — onboarding, product management, stats |
| `/admin` | Admin panel — wallet-gated, merchant/product approval + on-chain config |

---

## Key Design Decisions

**Escrow threshold at 500 USDC** — purchases under 500 USDC auto-complete instantly on-chain. Above 500 USDC, funds are held in EscrowLogic until admin releases, protecting buyers from non-delivery.

**ML before LLM** — the XGBoost risk score appears in ~50ms. The LLM explanation loads asynchronously, so buyers are never blocked waiting for AI output.

**Backend faucet for MockUSDC** — MockUSDC has an `onlyOwner` mint function. The backend `/api/faucet/mint` endpoint holds the deployer key and mints on behalf of users, with per-wallet cooldown to prevent abuse.

**Dual database architecture** — `main_db` holds orders, buyer profiles, and configuration. `evm_merchants` and `evm_products` tables store EVM merchant/product data — both pointing to the same Neon `main_db` in production.

**On-chain first, then DB sync** — all state changes hit the blockchain first. The database is synced after transaction confirmation, keeping PostgreSQL as a query cache rather than the source of truth.

**Wallet is identity** — no username/password. Wallet address is the sole identity for buyers, merchants, and admins across all flows.

**Encrypted delivery info** — merchant delivery links and access codes are Fernet-encrypted in PostgreSQL and decrypted only for the buyer after order completion.

---

## Environment Variables

### Backend (`quilvion-evm-backend/.env`)

DATABASE_URL=postgresql://...@....neon.tech/main_db?sslmode=require
EVM_DATABASE_URL=postgresql://...@....neon.tech/main_db?sslmode=require
GROQ_API_KEY=gsk_...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
ADMIN_SECRET=quilvion-admin-2025
ENCRYPTION_KEY=...

### Frontend (`quilvion-evm-frontend/.env.local`)

NEXT_PUBLIC_API_URL=https://api-evm.quilvion.xyz

---

## Running Locally

```bash
# Backend
cd quilvion-evm-backend
pip install -r requirements.txt
python main.py

# Frontend
cd quilvion-evm-frontend
pnpm install
pnpm dev
```

Backend starts on `http://localhost:8000`. Frontend starts on `http://localhost:3000`.

Add Somnia Testnet to MetaMask:
- **Network Name:** Somnia Testnet
- **RPC URL:** `https://dream-rpc.somnia.network`
- **Chain ID:** `50312`
- **Symbol:** `STT`
- **Explorer:** `https://shannon-explorer.somnia.network`

---

## Repository Structure

quilvion-multichain-testnet/
├── quilvion-evm-backend/
│   ├── main.py
│   ├── app/
│   │   ├── database.py            # SQLAlchemy models (Merchant, Product, Order, BuyerProfile, Configuration)
│   │   ├── schemas.py
│   │   ├── encrypt.py             # Fernet encryption for delivery info
│   │   ├── ml/
│   │   │   └── model.py
│   │   ├── llm/
│   │   │   └── claude_client.py
│   │   └── routes/
│   │       ├── buyer.py
│   │       ├── merchant.py
│   │       ├── admin.py
│   │       ├── orders.py          # Order create, status sync, escrow, XP update
│   │       ├── risk.py
│   │       ├── llm.py
│   │       └── dispute.py
│   └── requirements.txt
│
├── quilvion-evm-frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx
│   │   │   ├── buyer/
│   │   │   ├── merchant/page.tsx
│   │   │   └── admin/page.tsx
│   │   ├── components/
│   │   │   ├── BuyerChat.tsx
│   │   │   ├── BuyModal.tsx       # USDC approve + createOrder + risk assessment
│   │   │   ├── MintUsdc.tsx       # Testnet faucet widget
│   │   │   ├── OrderCard.tsx
│   │   │   ├── OrderInfoGuide.tsx
│   │   │   ├── BuyerProfileCard.tsx
│   │   │   ├── ProtocolConfigCard.tsx
│   │   │   ├── MerchantProductForm.tsx
│   │   │   ├── MerchantOnboard.tsx
│   │   │   ├── MerchantStats.tsx
│   │   │   ├── ConnectButton.tsx
│   │   │   └── RiskBadge.tsx
│   │   └── lib/
│   │       ├── api.ts
│   │       ├── products.ts
│   │       └── evm/
│   │           ├── constants.ts   # Contract addresses, API_BASE, EVM_CONFIG
│   │           ├── transactions.ts
│   │           ├── wallet.ts
│   │           ├── readConfig.ts
│   │           └── transaction.ts
│   └── public/
│       └── logo.png
│
└── quilvion_evm/                  # Hardhat — Solidity contracts + deployment
├── contracts/
│   ├── CommerceCore.sol
│   ├── EscrowLogic.sol
│   ├── ConfigManager.sol
│   ├── ReputationManager.sol
│   ├── SomniaAgentController.sol
│   └── MockUSDC.sol
└── scripts/
└── deploy.js

