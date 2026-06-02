# Quilvion — AI-Powered Web3 Commerce Platform

**Quilvion** is a decentralized digital marketplace built on the **Sui blockchain**, combining on-chain escrow protection with AI-driven fraud detection and a natural language shopping assistant. It enables merchants to list digital products and buyers to purchase them securely — with every transaction protected by smart contracts and analyzed by machine learning.

---

## Live Architecture

```
Buyer / Merchant / Admin
        ↓
   Next.js 15 Frontend
        ↓
   FastAPI Backend (Python)
   ├── XGBoost ML Model (fraud scoring)
   └── Groq LLaMA 3.3 70B (LLM)
        ↓
   PostgreSQL (Neon) — product & merchant DB
        ↓
   Sui Testnet — on-chain escrow & settlement
```

---

## Smart Contract — Sui Testnet

| Object | Address |
|---|---|
| Package | `0xb6ee5d...a2c4` |
| Commerce Core | `0x49523b...a4f` |
| Escrow Manager | `0x26652...3a3` |
| Config Manager | `0xbc97b9...7eb` |
| Role Manager | `0x54b04b...eea` |
| Reputation Manager | `0x191468...316` |
| Badge Manager | `0xfe79d9...735` |
| USDC Faucet | `0x18774...325` |

All purchases above **100 USDC** are held in escrow until the merchant delivers. Under 100 USDC auto-completes on-chain. The faucet allows any wallet to mint test USDC — no treasury cap required.

---

## Product Flows

### Buyer Flow

1. Connect Slush wallet
2. Browse marketplace — products fetched live from PostgreSQL
3. Filter by category or search by name / tag
4. Click a product → full detail modal with image gallery (up to 4 images), merchant reputation, escrow terms
5. Click **Buy Now** → AI risk assessment runs (ML score + LLM explanation)
6. If risk score < 75, buyer confirms with USDC coin object ID → transaction submitted on Sui
7. Track orders and raise disputes from the Orders tab

### Merchant Flow

1. Connect wallet → apply as merchant (company name, category, contact)
2. Admin reviews and approves the merchant application
3. Once approved — access the Merchant Dashboard with:
   - Revenue stats, order history, success rate
   - Product management: add, edit, delete listings
   - Up to 4 product images per listing (Cloudinary CDN)
   - AI-generated product descriptions (one click)
4. New products go to **pending** status until admin approves

### Admin Flow

1. Login with secret key at `/admin`
2. **Overview tab** — live stats: total merchants, products, pending reviews
3. **Merchants tab** — approve / reject / suspend merchant applications
4. **Products tab** — approve / reject / delete product listings, view images and descriptions
5. All changes reflect immediately in the buyer marketplace

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

The ML model runs in milliseconds — the risk score appears before the LLM explanation loads.

### LLM — Groq LLaMA 3.3 70B

Six distinct LLM features, each with a dedicated system prompt enforcing short (2–4 sentence) plain-text responses:

| Feature | Trigger | Output |
|---|---|---|
| **Fraud explanation** | After ML score on Buy Modal | Human-readable reason why the score is what it is |
| **Buyer chat assistant** | AI Help tab | Answers questions about products, escrow, disputes — with live product data from the DB |
| **Product description generator** | Merchant product form | Polished 40-word listing from bullet-point inputs |
| **Dispute summarizer** | Admin dispute review | One-paragraph context summary with recommended action |
| **Merchant risk profiler** | Admin merchant review | 3-sentence profile with overall risk rating |
| **XP tier notification** | Buyer tier upgrade | Personalized 2-sentence message using real order data |

The buyer chat assistant receives the **full live product catalog** as context on every message, so it can accurately answer questions like *"show me courses under $50"* or *"which merchant has the best success rate"* and surface clickable product chips in the reply.

---

## Tech Stack

### Frontend
- **Next.js 15** (App Router)
- **TypeScript**
- **Tailwind CSS** + inline styles for dark theme
- **Framer Motion** — page transitions and modal animations
- **@mysten/dapp-kit** — Sui wallet connection (Slush)
- **Cloudinary** — product image upload and CDN delivery

### Backend
- **FastAPI** (Python)
- **SQLAlchemy** + **PostgreSQL** (Neon serverless)
- **XGBoost** — trained fraud detection model
- **Groq API** — LLaMA 3.3 70B inference
- **Cloudinary SDK** — server-side image upload

### Blockchain
- **Sui Testnet** — Move smart contracts
- **USDC** — custom test token with shared faucet
- Escrow, dispute, role management — all on-chain

---

## Pages

| Route | Description |
|---|---|
| `/` | Buyer dashboard — browse, orders, AI chat |
| `/merchant` | Merchant portal — onboarding, product management, stats |
| `/admin` | Admin panel — merchant and product approval (secret key protected) |

---

## Key Design Decisions

**Escrow threshold at 100 USDC** — low-value purchases settle instantly to reduce friction. High-value purchases hold funds on-chain, protecting buyers from non-delivery without requiring trust.

**ML before LLM** — the risk score appears in ~50ms from the XGBoost model. The LLM explanation loads asynchronously after, so buyers are never blocked waiting for AI output.

**Pending-by-default for products** — merchants can list freely, but products only appear in the buyer marketplace after admin approval. This prevents spam and maintains marketplace quality without requiring pre-registration.

**PostgreSQL as the source of truth** — on-chain data is expensive and slow to query. Product listings, merchant profiles, and order metadata live in PostgreSQL. The Sui blockchain handles only payment settlement and escrow logic.

**Live product context in AI chat** — the buyer assistant fetches the current approved product catalog on every message, so AI responses reflect the actual marketplace state rather than a static snapshot.

---

## Environment Variables

### Backend (`quilvion-backend/.env`)

```
DATABASE_URL=postgresql://...@....neon.tech/neondb?sslmode=require
GROQ_API_KEY=gsk_...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
ADMIN_SECRET=quilvion-admin-2025
```

### Frontend (`quilvion-sui-frontend/.env.local`)

```
NEXT_PUBLIC_API_URL=https://your-backend.app.github.dev
NEXT_PUBLIC_ADMIN_SECRET=quilvion-admin-2025
```

---

## Running Locally

```bash
# Backend
cd quilvion-backend
pip install -r requirements.txt
python main.py

# Frontend
cd quilvion-sui-frontend
pnpm install
pnpm dev
```

Backend starts on `http://localhost:8000`. Frontend starts on `http://localhost:3000`.

On startup the backend automatically creates all PostgreSQL tables and loads the XGBoost model.

---

## Repository Structure

```
quilvion-multichain-testnet/
├── quilvion-backend/
│   ├── main.py                    # FastAPI app, lifespan, router registration
│   ├── app/
│   │   ├── database.py            # SQLAlchemy models (Merchant, Product)
│   │   ├── schemas.py             # Pydantic request/response schemas
│   │   ├── ml/
│   │   │   └── model.py           # XGBoost fraud model loader
│   │   ├── llm/
│   │   │   └── claude_client.py   # Groq API client + all system prompts
│   │   └── routes/
│   │       ├── buyer.py           # Product listing + AI chat
│   │       ├── merchant.py        # Merchant CRUD + image upload + AI description
│   │       ├── admin.py           # Approval routes (secret-key protected)
│   │       ├── risk.py            # ML scoring endpoint
│   │       ├── llm.py             # Fraud explanation + other LLM endpoints
│   │       └── dispute.py         # Dispute management
│   └── requirements.txt
│
└── quilvion-sui-frontend/
    ├── src/
    │   ├── app/
    │   │   ├── page.tsx           # Buyer dashboard
    │   │   ├── merchant/page.tsx  # Merchant portal
    │   │   └── admin/page.tsx     # Admin panel
    │   ├── components/
    │   │   ├── BuyerChat.tsx      # AI chat widget
    │   │   ├── BuyModal.tsx       # Purchase flow + risk assessment
    │   │   ├── MerchantProductForm.tsx  # Product add/edit + image upload
    │   │   ├── MerchantOnboard.tsx      # Merchant registration wizard
    │   │   ├── MerchantStats.tsx        # Revenue and order dashboard
    │   │   ├── OrderCard.tsx            # Order display + dispute button
    │   │   ├── RiskBadge.tsx            # ML risk level indicator
    │   │   └── MintUsdc.tsx             # Testnet faucet widget
    │   └── lib/
    │       ├── api.ts             # All backend API calls
    │       ├── products.ts        # Product type + static fallback data
    │       └── sui/
    │           ├── constants.ts   # Contract addresses + config
    │           └── transactions.ts # Move call builders
    └── public/
        └── logo.png
```