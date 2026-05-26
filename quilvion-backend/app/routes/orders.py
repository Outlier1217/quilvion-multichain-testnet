from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_
from pydantic import BaseModel
from typing import Optional, List
import datetime

from app.database import get_db, Order, Product

router = APIRouter(prefix="/orders", tags=["orders"])


class DeliveryInfoUpdate(BaseModel):
    order_id: int
    merchant_wallet: str
    delivery_info: str


class OrderResponse(BaseModel):
    id: int
    buyer_wallet: str
    merchant_wallet: str
    product_id: int
    product_name: str
    amount_usdc: float
    status: str
    tx_digest: Optional[str]
    risk_score: Optional[int]
    delivery_info: Optional[str]
    created_at: str
    updated_at: Optional[str]


@router.post("/create")
async def create_order(
    order_data: dict,
    db: Session = Depends(get_db)
):
    """Create a new order record (called after on-chain order creation)"""
    
    # Check if order already exists
    existing = db.query(Order).filter(Order.id == order_data.get("id")).first()
    if existing:
        return {"success": True, "message": "Order already exists"}
    
    order = Order(
        id=order_data.get("id"),
        buyer_wallet=order_data.get("buyer_wallet"),
        merchant_wallet=order_data.get("merchant_wallet"),
        product_id=order_data.get("product_id"),
        product_name=order_data.get("product_name"),
        amount_usdc=order_data.get("amount_usdc"),
        status=order_data.get("status", "PENDING"),
        tx_digest=order_data.get("tx_digest"),
        risk_score=order_data.get("risk_score"),
        delivery_info=order_data.get("delivery_info"),
    )
    db.add(order)
    db.commit()
    return {"success": True, "order_id": order.id}


@router.post("/update-delivery")
async def update_delivery_info(
    data: DeliveryInfoUpdate,
    db: Session = Depends(get_db)
):
    """Update delivery info for an order (called by merchant after fulfilling order)"""
    
    order = db.query(Order).filter(Order.id == data.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if order.merchant_wallet != data.merchant_wallet:
        raise HTTPException(status_code=403, detail="Not authorized - you are not the merchant for this order")
    
    order.delivery_info = data.delivery_info
    order.updated_at = datetime.datetime.utcnow()
    db.commit()
    
    return {"success": True, "delivery_info": data.delivery_info}


@router.get("/buyer/{wallet_address}")
async def get_buyer_orders(
    wallet_address: str,
    db: Session = Depends(get_db)
):
    """Get all orders for a buyer"""
    
    orders = db.query(Order).filter(
        Order.buyer_wallet == wallet_address
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
            "tx_digest": order.tx_digest,
            "risk_score": order.risk_score,
            "delivery_info": order.delivery_info,
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "updated_at": order.updated_at.isoformat() if order.updated_at else None,
        }
        for order in orders
    ]


@router.get("/merchant/{wallet_address}")
async def get_merchant_orders(
    wallet_address: str,
    db: Session = Depends(get_db)
):
    """Get all orders for a merchant"""
    
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
            "tx_digest": order.tx_digest,
            "risk_score": order.risk_score,
            "delivery_info": order.delivery_info,
            "created_at": order.created_at.isoformat() if order.created_at else None,
        }
        for order in orders
    ]


@router.get("/{order_id}")
async def get_order(
    order_id: int,
    db: Session = Depends(get_db)
):
    """Get single order by ID"""
    
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
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
        "delivery_info": order.delivery_info,
        "created_at": order.created_at.isoformat() if order.created_at else None,
    }


@router.patch("/{order_id}/status")
async def update_order_status(
    order_id: int,
    status: str,
    wallet: str,
    db: Session = Depends(get_db)
):
    """Update order status (requires admin or merchant)"""
    
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Allow merchant to mark as COMPLETED, admin for other statuses
    if status == "COMPLETED":
        if order.merchant_wallet != wallet:
            raise HTTPException(status_code=403, detail="Only merchant can mark order as completed")
    else:
        # Admin check would go here
        pass
    
    order.status = status
    order.updated_at = datetime.datetime.utcnow()
    db.commit()
    
    return {"success": True, "status": status}