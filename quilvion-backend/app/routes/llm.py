"""
POST /api/llm/* — All Claude LLM endpoints
These are async (1-2s) — call after fast ML score is shown.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.llm.claude_client import (
    call_claude,
    SYSTEM_FRAUD_EXPLAINER,
    SYSTEM_PRODUCT_WRITER,
    SYSTEM_DISPUTE_SUMMARIZER,
    SYSTEM_MERCHANT_PROFILER,
    SYSTEM_XP_NOTIFIER,
    SYSTEM_BUYER_ASSISTANT,
)

router = APIRouter()


# ── 1. Fraud Explanation ──────────────────────────────────────────────────────

class FraudExplainRequest(BaseModel):
    order_id:       str
    risk_score:     int
    risk_level:     str
    signals:        list[str]
    amount_usdc:    float
    buyer_wallet:   str
    merchant_wallet: str
    buyer_wallet_age_days: int = 0
    buyer_total_orders:    int = 0
    buyer_dispute_count:   int = 0

class FraudExplainResponse(BaseModel):
    order_id:    str
    explanation: str
    recommended_action: str


@router.post("/fraud-explanation", response_model=FraudExplainResponse)
async def fraud_explanation(req: FraudExplainRequest):
    """
    LLM explains WHY the ML model gave this risk score.
    Like Stripe Radar — score + human reason.
    """
    try:
        prompt = f"""
Order ID: {req.order_id}
Risk Score: {req.risk_score}/100 ({req.risk_level})
Amount: {req.amount_usdc} USDC
Buyer wallet: {req.buyer_wallet} ({req.buyer_wallet_age_days} days old, {req.buyer_total_orders} prior orders, {req.buyer_dispute_count} disputes)
Merchant wallet: {req.merchant_wallet}

Risk signals detected:
{chr(10).join(f"- {s}" for s in req.signals)}

Explain this risk assessment in 2-4 sentences and provide a recommended action.
""".strip()

        explanation = call_claude(SYSTEM_FRAUD_EXPLAINER, prompt)

        # Extract recommended action from explanation
        action = "Admin review recommended"
        if req.risk_score >= 75:
            action = "Block transaction immediately"
        elif req.risk_score >= 50:
            action = "Requires admin approval before release"
        elif req.risk_score >= 20:
            action = "Hold in escrow, monitor"
        else:
            action = "Auto-complete approved"

        return FraudExplainResponse(
            order_id=req.order_id,
            explanation=explanation,
            recommended_action=action,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 2. Product Description Generator ─────────────────────────────────────────

class ProductDescRequest(BaseModel):
    merchant_wallet: str
    raw_notes:       str   # bullet points from merchant
    category:        Optional[str] = None
    price_usdc:      Optional[float] = None

class ProductDescResponse(BaseModel):
    description: str
    word_count:  int


@router.post("/product-description", response_model=ProductDescResponse)
async def generate_product_description(req: ProductDescRequest):
    """
    Merchant types bullet points → Claude writes polished listing.
    """
    try:
        context = f"Category: {req.category}" if req.category else ""
        price   = f"Price: {req.price_usdc} USDC" if req.price_usdc else ""

        prompt = f"""
Convert these merchant notes into a polished product description:

{req.raw_notes}

{context}
{price}
""".strip()

        description = call_claude(SYSTEM_PRODUCT_WRITER, prompt)

        return ProductDescResponse(
            description=description,
            word_count=len(description.split()),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 3. Dispute Summarizer ─────────────────────────────────────────────────────

class DisputeSummaryRequest(BaseModel):
    order_id:            str
    buyer_wallet:        str
    merchant_wallet:     str
    product_name:        str
    amount_usdc:         float
    order_created_at:    str
    dispute_raised_at:   str
    buyer_total_orders:  int   = 0
    buyer_dispute_count: int   = 0
    buyer_account_age_days: int = 0
    merchant_total_orders:  int = 0
    merchant_success_rate:  float = 1.0
    risk_score:          int  = 0
    dispute_reason:      Optional[str] = None
    content_hash:        Optional[str] = None

class DisputeSummaryResponse(BaseModel):
    order_id:   str
    summary:    str
    recommendation: str   # REFUND | RELEASE | INVESTIGATE


@router.post("/dispute-summary", response_model=DisputeSummaryResponse)
async def dispute_summary(req: DisputeSummaryRequest):
    """
    LLM summarizes dispute context for admin — no manual digging needed.
    """
    try:
        delivery = f"Content hash on-chain: {req.content_hash}" if req.content_hash else "No content hash recorded (product not delivered)"

        prompt = f"""
Dispute Details:
- Order ID: {req.order_id}
- Product: {req.product_name} ({req.amount_usdc} USDC)
- Buyer: {req.buyer_wallet} | Account age: {req.buyer_account_age_days} days | Orders: {req.buyer_total_orders} | Disputes: {req.buyer_dispute_count}
- Merchant: {req.merchant_wallet} | Orders: {req.merchant_total_orders} | Success rate: {req.merchant_success_rate*100:.0f}%
- Order created: {req.order_created_at}
- Dispute raised: {req.dispute_raised_at}
- Risk score: {req.risk_score}/100
- Delivery status: {delivery}
- Dispute reason: {req.dispute_reason or "Not specified"}

Summarize this dispute and provide a clear recommendation.
""".strip()

        summary = call_claude(SYSTEM_DISPUTE_SUMMARIZER, prompt)

        # Determine recommendation from context
        if req.content_hash:
            recommendation = "RELEASE"
        elif req.buyer_dispute_count == 0 and req.merchant_success_rate < 0.8:
            recommendation = "REFUND"
        elif req.risk_score > 60:
            recommendation = "INVESTIGATE"
        else:
            recommendation = "INVESTIGATE"

        return DisputeSummaryResponse(
            order_id=req.order_id,
            summary=summary,
            recommendation=recommendation,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 4. Merchant Profile Summary ───────────────────────────────────────────────

class MerchantProfileRequest(BaseModel):
    merchant_wallet:        str
    total_orders:           int   = 0
    completed_orders:       int   = 0
    dispute_count:          int   = 0
    disputes_won:           int   = 0
    avg_delivery_hours:     float = 0.0
    verification_expires_days: int = 0
    stake_balance_usdc:     float = 0.0
    total_volume_usdc:      float = 0.0
    account_age_days:       int   = 0

class MerchantProfileResponse(BaseModel):
    merchant_wallet: str
    profile_summary: str
    overall_risk:    str   # Low | Medium | High


@router.post("/merchant-profile", response_model=MerchantProfileResponse)
async def merchant_profile(req: MerchantProfileRequest):
    """
    Admin gets an instant merchant risk profile — no manual data review.
    """
    try:
        success_rate = (req.completed_orders / req.total_orders * 100) if req.total_orders > 0 else 0

        prompt = f"""
Merchant: {req.merchant_wallet}
- Account age: {req.account_age_days} days
- Total orders: {req.total_orders} | Completed: {req.completed_orders} ({success_rate:.0f}% success rate)
- Disputes: {req.dispute_count} total, {req.disputes_won} resolved in merchant's favor
- Average delivery time: {req.avg_delivery_hours:.1f} hours
- Total volume: {req.total_volume_usdc:.0f} USDC
- Stake balance: {req.stake_balance_usdc:.0f} USDC
- Verification expires in: {req.verification_expires_days} days

Generate a merchant profile card for admin review.
""".strip()

        profile = call_claude(SYSTEM_MERCHANT_PROFILER, prompt)

        # Determine risk level
        if success_rate >= 90 and req.dispute_count <= 2:
            risk = "Low"
        elif success_rate >= 75 or req.dispute_count <= 5:
            risk = "Medium"
        else:
            risk = "High"

        return MerchantProfileResponse(
            merchant_wallet=req.merchant_wallet,
            profile_summary=profile,
            overall_risk=risk,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 5. XP Tier Upgrade Message ────────────────────────────────────────────────

class XPMessageRequest(BaseModel):
    buyer_wallet:       str
    new_tier:           str   # Bronze | Silver | Gold
    total_orders:       int
    total_spent_usdc:   float
    avg_risk_score:     float
    xp_points:          int

class XPMessageResponse(BaseModel):
    message: str
    tier:    str


@router.post("/xp-message", response_model=XPMessageResponse)
async def xp_tier_message(req: XPMessageRequest):
    """
    Personalized tier upgrade notification — uses buyer's actual data.
    """
    try:
        prompt = f"""
Buyer just reached {req.new_tier} tier!
Stats:
- Total orders completed: {req.total_orders}
- Total spent: {req.total_spent_usdc:.0f} USDC
- XP points: {req.xp_points}
- Average fraud score across orders: {req.avg_risk_score:.0f}/100 (lower is better — they're a trusted buyer)

Write a personalized congratulations message using their actual numbers.
""".strip()

        message = call_claude(SYSTEM_XP_NOTIFIER, prompt)

        return XPMessageResponse(message=message, tier=req.new_tier)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 6. Buyer Purchase Assistant (Chat) ────────────────────────────────────────

class BuyerChatRequest(BaseModel):
    buyer_wallet:   str
    message:        str
    chain:          str = "sui"
    # Optional context
    buyer_xp:       Optional[int]   = None
    buyer_tier:     Optional[str]   = None
    buyer_orders:   Optional[int]   = None
    chat_history:   Optional[list[dict]] = None   # [{role, content}]

class BuyerChatResponse(BaseModel):
    reply:   str
    sources: list[str] = []


@router.post("/buyer-chat", response_model=BuyerChatResponse)
async def buyer_chat(req: BuyerChatRequest):
    """
    Conversational buyer assistant.
    Knows about the platform, products, escrow, dispute process.
    """
    try:
        context = f"""
Platform: Quilvion multichain commerce
Buyer wallet: {req.buyer_wallet}
Chain: {req.chain}
Buyer XP: {req.buyer_xp or 'unknown'}
Buyer tier: {req.buyer_tier or 'Bronze'}
Orders completed: {req.buyer_orders or 0}

Platform facts:
- Payment token: USDC (stablecoin)
- Escrow: all orders above 100 USDC are held in escrow until delivery
- Dispute window: 7 days after order creation
- Digital products auto-complete on purchase if under threshold
- Tiers: Bronze (0 XP) → Silver (100 XP) → Gold (500 XP)
- Each completed order awards XP
- Risk scores: 0-100 (AI fraud detection, higher = more risky)
- Chains supported: Sui, Ethereum/EVM, Solana, Aptos
""".strip()

        full_message = f"{context}\n\nBuyer question: {req.message}"

        reply = call_claude(SYSTEM_BUYER_ASSISTANT, full_message)

        return BuyerChatResponse(reply=reply, sources=["Quilvion platform docs"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))