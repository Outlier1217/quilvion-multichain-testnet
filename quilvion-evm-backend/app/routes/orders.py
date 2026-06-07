from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import datetime
import httpx
import os

from app.database import get_db, Order, BuyerProfile
from app.encrypt import decrypt_delivery_info, should_decrypt_for_buyer

router = APIRouter(prefix="/orders", tags=["orders"])


class DeliveryInfoUpdate(BaseModel):
    order_id: int
    merchant_wallet: str
    delivery_info: str


class OrderStatusUpdate(BaseModel):
    order_id: int
    status: str
    wallet: str


# ── XP Helper ─────────────────────────────────────────────────────────────────
async def update_buyer_xp(wallet: str, event: str, db: Session):
    profile = db.query(BuyerProfile).filter(BuyerProfile.wallet_address == wallet).first()
    if not profile:
        profile = BuyerProfile(
            wallet_address=wallet,
            xp=0,
            tier="Bronze",
            total_orders=0,
            completed_orders=0,
        )
        db.add(profile)

    xp_rewards = {"order_placed": 5, "order_completed": 10, "order_disputed": 0}
    profile.xp += xp_rewards.get(event, 0)
    profile.total_orders = db.query(Order).filter(Order.buyer_wallet == wallet).count()
    profile.completed_orders = db.query(Order).filter(
        Order.buyer_wallet == wallet, Order.status == "COMPLETED"
    ).count()

    if profile.xp >= 500:
        profile.tier = "Gold"
    elif profile.xp >= 100:
        profile.tier = "Silver"
    else:
        profile.tier = "Bronze"

    db.commit()


# ── Create Order ───────────────────────────────────────────────────────────────
@router.post("/create")
async def create_order(order_data: dict, db: Session = Depends(get_db)):
    tx_hash = order_data.get("tx_hash") or order_data.get("tx_digest")
    if tx_hash:
        existing = db.query(Order).filter(Order.tx_hash == tx_hash).first()
        if existing:
            return {"success": True, "order_id": existing.id, "message": "Order already exists"}

    order = Order(
        buyer_wallet=order_data.get("buyer_wallet"),
        merchant_wallet=order_data.get("merchant_wallet"),
        product_id=order_data.get("product_id"),
        product_name=order_data.get("product_name"),
        amount_usdc=order_data.get("amount_usdc"),
        status=order_data.get("status", "PENDING"),
        chain=order_data.get("chain", "evm"),
        network=order_data.get("network", "somniaTestnet"),
        tx_digest=order_data.get("tx_digest"),
        tx_hash=tx_hash,
        risk_score=order_data.get("risk_score"),
        delivery_info=order_data.get("delivery_info"),
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    try:
        await update_buyer_xp(order.buyer_wallet, "order_placed", db)
    except Exception as e:
        print(f"XP update failed (non-critical): {e}")

    return {"success": True, "order_id": order.id}


# ── Update Delivery Info ───────────────────────────────────────────────────────
@router.post("/update-delivery")
async def update_delivery_info(data: DeliveryInfoUpdate, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == data.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.merchant_wallet != data.merchant_wallet:
        raise HTTPException(status_code=403, detail="Not authorized")

    from app.encrypt import encrypt_delivery_info
    order.delivery_info = encrypt_delivery_info(data.delivery_info)
    order.updated_at = datetime.datetime.utcnow()
    db.commit()
    return {"success": True, "delivery_info": "[Encrypted]"}


# ── Sync Status ────────────────────────────────────────────────────────────────
@router.post("/sync-status")
async def sync_order_status(data: OrderStatusUpdate, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == data.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if data.wallet != order.buyer_wallet and data.wallet != order.merchant_wallet:
        raise HTTPException(status_code=403, detail="Not authorized")

    allowed_statuses = ["PENDING", "COMPLETED", "ESCROW_RELEASED", "REFUNDED", "DISPUTED", "CANCELLED"]
    if data.status not in allowed_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(allowed_statuses)}")

    order.status = data.status.strip().upper()
    order.updated_at = datetime.datetime.utcnow()
    db.commit()

    if data.status.upper() == "COMPLETED":
        try:
            await update_buyer_xp(order.buyer_wallet, "order_completed", db)
        except Exception as e:
            print(f"XP update failed: {e}")

    print(f"[SYNC] Order {data.order_id} → {data.status} by {data.wallet}")
    return {"success": True, "order_id": order.id, "status": order.status}


# ── Get Buyer Orders ───────────────────────────────────────────────────────────
@router.get("/buyer/{wallet_address}")
async def get_buyer_orders(wallet_address: str, db: Session = Depends(get_db)):
    orders = db.query(Order).filter(
        Order.buyer_wallet == wallet_address
    ).order_by(Order.created_at.desc()).all()

    result = []
    for order in orders:
        delivery_info = None
        normalized_status = (order.status or "").strip().upper()
        if normalized_status in {"COMPLETED", "ESCROW_RELEASED", "REFUNDED"} and order.delivery_info:
            delivery_info = decrypt_delivery_info(order.delivery_info)

        result.append({
            "id": order.id,
            "buyer_wallet": order.buyer_wallet,
            "merchant_wallet": order.merchant_wallet,
            "product_id": order.product_id,
            "product_name": order.product_name,
            "amount_usdc": order.amount_usdc,
            "status": order.status,
            "chain": order.chain,
            "network": order.network,
            "tx_digest": order.tx_digest,
            "tx_hash": order.tx_hash,
            "risk_score": order.risk_score,
            "delivery_info": delivery_info,
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "updated_at": order.updated_at.isoformat() if order.updated_at else None,
        })

    return result


# ── Get Merchant Orders ────────────────────────────────────────────────────────
@router.get("/merchant/{wallet_address}")
async def get_merchant_orders(wallet_address: str, db: Session = Depends(get_db)):
    orders = db.query(Order).filter(
        Order.merchant_wallet == wallet_address
    ).order_by(Order.created_at.desc()).all()

    return [
        {
            "id": order.id,
            "buyer_wallet": order.buyer_wallet,
            "merchant_wallet": order.merchant_wallet,
            "product_id": order.product_id,
            "product_name": order.product_name,
            "amount_usdc": order.amount_usdc,
            "status": order.status,
            "chain": order.chain,
            "network": order.network,
            "tx_digest": order.tx_digest,
            "tx_hash": order.tx_hash,
            "risk_score": order.risk_score,
            "delivery_info": order.delivery_info,
            "created_at": order.created_at.isoformat() if order.created_at else None,
        }
        for order in orders
    ]


# ── Get Single Order ───────────────────────────────────────────────────────────
@router.get("/{order_id}")
async def get_order(order_id: int, wallet: Optional[str] = None, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    delivery_info = None
    if wallet and should_decrypt_for_buyer(order.buyer_wallet, wallet, order.status):
        delivery_info = decrypt_delivery_info(order.delivery_info) if order.delivery_info else None

    return {
        "id": order.id,
        "buyer_wallet": order.buyer_wallet,
        "merchant_wallet": order.merchant_wallet,
        "product_id": order.product_id,
        "product_name": order.product_name,
        "amount_usdc": order.amount_usdc,
        "status": order.status,
        "tx_digest": order.tx_digest,
        "risk_score": order.risk_score,
        "delivery_info": delivery_info,
        "created_at": order.created_at.isoformat() if order.created_at else None,
    }


# ── Update Order Status (merchant/admin) ──────────────────────────────────────
@router.patch("/{order_id}/status")
async def update_order_status(order_id: int, status: str, wallet: str, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if status == "COMPLETED" and order.merchant_wallet != wallet:
        raise HTTPException(status_code=403, detail="Only merchant can mark as completed")

    order.status = status
    order.updated_at = datetime.datetime.utcnow()
    db.commit()
    return {"success": True, "status": status}
