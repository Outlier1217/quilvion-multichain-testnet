"""
POST /api/risk/score
ML-only endpoint — fast (milliseconds), no LLM call here.
Frontend shows this immediately, then fetches explanation separately.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from app.ml.model import predict_fraud_score

router = APIRouter()


class TransactionFeatures(BaseModel):
    # Core identifiers
    order_id:       str
    buyer_wallet:   str
    merchant_wallet: str
    amount_usdc:    float = Field(..., description="USDC amount (e.g. 150.00)")
    chain:          str   = Field(..., description="sui | evm | solana | aptos")

    # Wallet metadata (from your DB / on-chain)
    buyer_wallet_age_days:       int   = 0
    buyer_total_orders:          int   = 0
    buyer_dispute_count:         int   = 0
    buyer_avg_order_amount:      float = 0.0
    merchant_total_orders:       int   = 0
    merchant_success_rate:       float = 1.0
    merchant_dispute_count:      int   = 0
    merchant_verification_days:  int   = 0

    # Optional: raw ML features if you have them (V1-V28 from PCA)
    # Pass these if available for highest accuracy
    raw_features: Optional[dict] = None


class RiskScoreResponse(BaseModel):
    order_id:    str
    risk_score:  int   = Field(..., description="0-100, higher = more risky")
    risk_level:  str   = Field(..., description="LOW | MEDIUM | HIGH | CRITICAL")
    signals:     list[str]
    auto_action: str   = Field(..., description="AUTO_COMPLETE | ESCROW | ADMIN_REVIEW | BLOCK")


def score_to_level(score: int) -> str:
    if score < 20:  return "LOW"
    if score < 50:  return "MEDIUM"
    if score < 75:  return "HIGH"
    return "CRITICAL"


def score_to_action(score: int, amount: float, threshold: float = 100.0) -> str:
    if score >= 75:             return "BLOCK"
    if score >= 50:             return "ADMIN_REVIEW"
    if amount >= threshold:     return "ESCROW"
    return "AUTO_COMPLETE"


def extract_signals(tx: TransactionFeatures, score: int) -> list[str]:
    """Human-readable signals that contributed to this score."""
    signals = []

    if tx.buyer_wallet_age_days < 3:
        signals.append(f"Buyer wallet is only {tx.buyer_wallet_age_days} day(s) old")
    if tx.buyer_total_orders == 0:
        signals.append("First-time buyer on platform")
    if tx.buyer_dispute_count > 2:
        signals.append(f"Buyer has {tx.buyer_dispute_count} prior disputes")
    if tx.buyer_avg_order_amount > 0 and tx.amount_usdc > tx.buyer_avg_order_amount * 3:
        signals.append(f"Order is {tx.amount_usdc / tx.buyer_avg_order_amount:.1f}x buyer's average amount")

    if tx.merchant_total_orders < 5:
        signals.append(f"Merchant has only {tx.merchant_total_orders} completed orders")
    if tx.merchant_success_rate < 0.85:
        signals.append(f"Merchant success rate is {tx.merchant_success_rate*100:.0f}%")
    if tx.merchant_dispute_count > 3:
        signals.append(f"Merchant has {tx.merchant_dispute_count} disputes")

    if tx.amount_usdc > 500:
        signals.append(f"High value order: {tx.amount_usdc} USDC")

    if not signals:
        signals.append("No significant risk signals detected")

    return signals


@router.post("/score", response_model=RiskScoreResponse)
async def get_risk_score(tx: TransactionFeatures):
    """
    Fast ML risk scoring endpoint.
    Returns score 0-100 in milliseconds.
    For explanation, call POST /api/llm/fraud-explanation separately.
    """
    try:
        # Use raw PCA features if provided (highest accuracy)
        if tx.raw_features:
            ml_score = predict_fraud_score(tx.raw_features)
        else:
            # Heuristic-based scoring using wallet metadata
            heuristic_score = 0
            if tx.buyer_wallet_age_days < 3:  heuristic_score += 25
            if tx.buyer_total_orders == 0:    heuristic_score += 15
            if tx.buyer_dispute_count > 2:    heuristic_score += 20
            if tx.merchant_success_rate < 0.85: heuristic_score += 15
            if tx.amount_usdc > 500:          heuristic_score += 10
            if tx.merchant_total_orders < 5:  heuristic_score += 10
            ml_score = min(heuristic_score, 95)

        signals    = extract_signals(tx, ml_score)
        risk_level = score_to_level(ml_score)
        action     = score_to_action(ml_score, tx.amount_usdc)

        return RiskScoreResponse(
            order_id=tx.order_id,
            risk_score=ml_score,
            risk_level=risk_level,
            signals=signals,
            auto_action=action,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))