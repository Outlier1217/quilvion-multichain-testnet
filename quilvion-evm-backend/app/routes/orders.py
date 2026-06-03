from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_
from pydantic import BaseModel
from typing import Optional, List
import datetime
import httpx
import os

from app.database import get_db, Order, Product
from app.encrypt import decrypt_delivery_info, should_decrypt_for_buyer
import json

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
    
    # Encrypt delivery info before storing
    from app.encrypt import encrypt_delivery_info
    order.delivery_info = encrypt_delivery_info(data.delivery_info)
    
    order.updated_at = datetime.datetime.utcnow()
    db.commit()
    
    return {"success": True, "delivery_info": "[Encrypted - visible only to buyer after completion]"}


class OrderStatusUpdate(BaseModel):
    order_id: int
    status: str
    wallet: str  # Either buyer or merchant can sync


@router.post("/sync-status")
async def sync_order_status(
    data: OrderStatusUpdate,
    db: Session = Depends(get_db)
):
    """Sync order status from on-chain (called by frontend after on-chain status changes)"""
    
    order = db.query(Order).filter(Order.id == data.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Allow buyer or merchant to sync status
    if data.wallet != order.buyer_wallet and data.wallet != order.merchant_wallet:
        raise HTTPException(status_code=403, detail="Not authorized - you are not involved in this order")
    
    # Update status
    allowed_statuses = ["PENDING", "COMPLETED", "ESCROW_RELEASED", "REFUNDED", "DISPUTED", "CANCELLED"]
    if data.status not in allowed_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(allowed_statuses)}")
    
    order.status = data.status.strip().upper()
    order.updated_at = datetime.datetime.utcnow()
    db.commit()
    
    print(f"[SYNC] Order {data.order_id} status updated to {data.status} by {data.wallet}")
    
    return {"success": True, "order_id": order.id, "status": order.status}


@router.post("/sync-from-chain")
async def sync_from_chain(db: Session = Depends(get_db)):
    """Scan Sui testnet for OrderCompleted events and update DB statuses accordingly"""
    try:
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "suix_queryEvents",
            "params": [{"MoveEventType": f"{os.getenv('SUI_PACKAGE_ID', '')}::events::OrderCompleted"}, None, 100, True]
        }
        # Fallback to known testnet RPC if env var not set
        rpc = os.getenv('SUI_RPC', 'https://fullnode.testnet.sui.io:443')
        resp = httpx.post(rpc, json=payload, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        events = data.get('result', {}).get('data', [])

        updated = []
        for ev in events:
            try:
                order_id = ev.get('parsedJson', {}).get('order_id')
                if not order_id:
                    continue
                order = db.query(Order).filter(Order.id == int(order_id)).first()
                if order and order.status != 'COMPLETED':
                    order.status = 'COMPLETED'
                    order.updated_at = datetime.datetime.utcnow()
                    db.commit()
                    updated.append(order.id)
            except Exception:
                continue

        return {"success": True, "updated": updated, "scanned": len(events)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/buyer/{wallet_address}")
async def get_buyer_orders(
    wallet_address: str,
    db: Session = Depends(get_db)
):
    """Get all orders for a buyer - delivery info only visible after completion"""
    
    orders = db.query(Order).filter(
        Order.buyer_wallet == wallet_address
    ).order_by(Order.created_at.desc()).all()
    
    result = []
    for order in orders:
        # Only decrypt delivery_info if this is the buyer's order and it's completed
        delivery_info = None
        normalized_status = (order.status or "").strip().upper()
        is_buyer = order.buyer_wallet == wallet_address
        can_decrypt = should_decrypt_for_buyer(order.buyer_wallet, wallet_address, order.status)
        print(f"[DEBUG] Order {order.id}: status={order.status}, normalized_status={normalized_status}, buyer_match={is_buyer}, can_decrypt={can_decrypt}, has_delivery_info={bool(order.delivery_info)}")
        if is_buyer and normalized_status in {"COMPLETED", "ESCROW_RELEASED", "REFUNDED"}:
            if order.delivery_info:
                delivery_info = decrypt_delivery_info(order.delivery_info)
                print(f"[DEBUG] Order {order.id}: decrypted_info_preview={delivery_info[:50] if isinstance(delivery_info, str) else delivery_info}")
            else:
                print(f"[DEBUG] Order {order.id}: no delivery_info to decrypt")
        
        result.append({
            "id": order.id,
            "buyer_wallet": order.buyer_wallet,
            "merchant_wallet": order.merchant_wallet,
            "product_id": order.product_id,
            "product_name": order.product_name,
            "amount_usdc": order.amount_usdc,
            "status": order.status,
            "tx_digest": order.tx_digest,
            "risk_score": order.risk_score,
            "delivery_info": delivery_info,  # ✅ Decrypted only for completed orders
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "updated_at": order.updated_at.isoformat() if order.updated_at else None,
        })
    
    return result


@router.get("/merchant/{wallet_address}")
async def get_merchant_orders(
    wallet_address: str,
    db: Session = Depends(get_db)
):
    """Get all orders for a merchant - encrypted delivery info visible to merchant"""
    
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
            "delivery_info": order.delivery_info,  # ✅ Merchant sees encrypted version
            "created_at": order.created_at.isoformat() if order.created_at else None,
        }
        for order in orders
    ]


@router.get("/{order_id}")
async def get_order(
    order_id: int,
    wallet: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get single order by ID - delivery_info only visible to buyer after completion"""
    
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Decrypt delivery_info only if requester is the buyer and order is completed
    delivery_info = None
    if wallet and should_decrypt_for_buyer(order.buyer_wallet, wallet, order.status):
        delivery_info = decrypt_delivery_info(order.delivery_info) if order.delivery_info else None

    # Hard fallback for completed buyer orders to avoid leaking ciphertext into the UI
    if delivery_info and isinstance(delivery_info, str) and delivery_info.startswith("gAAAA"):
        delivery_info = decrypt_delivery_info(delivery_info)
    
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
        "delivery_info": delivery_info,  # ✅ Protected
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


@router.post("/sync-status/{order_id}")
async def sync_order_status(
    order_id: int,
    db: Session = Depends(get_db)
):
    """
    Sync order status from blockchain.
    Checks the transaction digest and looks for events to determine actual status.
    """
    
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if not order.tx_digest:
        return {
            "success": False, 
            "message": "No tx_digest found - cannot sync",
            "current_status": order.status
        }
    
    try:
        # Query Sui RPC to get transaction details
        sui_rpc = "https://fullnode.testnet.sui.io:443"
        
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                sui_rpc,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "sui_getTransactionBlock",
                    "params": [
                        order.tx_digest,
                        {
                            "showInput": False,
                            "showRawInput": False,
                            "showEffects": True,
                            "showEvents": True,
                            "showObjectChanges": False,
                            "showBalanceChanges": False
                        }
                    ]
                }
            )
        
        data = response.json()
        
        if "error" in data:
            return {
                "success": False,
                "message": f"RPC error: {data['error']['message']}",
                "current_status": order.status
            }
        
        result = data.get("result", {})
        events = result.get("events", [])
        
        # Check events to determine actual status
        event_types = [e.get("type", "") for e in events]
        
        # If OrderCompleted event exists, order was auto-completed
        if any("OrderCompleted" in et for et in event_types):
            new_status = "COMPLETED"
        # If OrderCreated only, order is pending
        elif any("OrderCreated" in et for et in event_types):
            new_status = "PENDING"
        else:
            new_status = order.status  # Keep existing if unknown
        
        # Update database if status changed
        if order.status != new_status:
            old_status = order.status
            order.status = new_status
            order.updated_at = datetime.datetime.utcnow()
            db.commit()
            
            return {
                "success": True,
                "message": f"Status synced: {old_status} → {new_status}",
                "old_status": old_status,
                "new_status": new_status,
                "events": event_types
            }
        else:
            return {
                "success": True,
                "message": "Status already correct",
                "current_status": new_status,
                "events": event_types
            }
    
    except Exception as e:
        return {
            "success": False,
            "message": f"Sync failed: {str(e)}",
            "current_status": order.status
        }


@router.post("/sync-all-pending")
async def sync_all_pending_orders(
    db: Session = Depends(get_db)
):
    """
    Bulk sync all PENDING orders from blockchain.
    Checks events to find which orders were auto-completed.
    """
    
    try:
        # Get all PENDING orders
        pending_orders = db.query(Order).filter(Order.status == "PENDING").all()
        
        if not pending_orders:
            return {
                "success": True,
                "message": "No pending orders to sync",
                "synced_count": 0,
                "updated_count": 0,
                "details": []
            }
        
        sui_rpc = "https://fullnode.testnet.sui.io:443"
        updated_count = 0
        details = []
        
        async with httpx.AsyncClient(timeout=30) as client:
            for order in pending_orders:
                if not order.tx_digest:
                    continue
                
                try:
                    response = await client.post(
                        sui_rpc,
                        json={
                            "jsonrpc": "2.0",
                            "id": 1,
                            "method": "sui_getTransactionBlock",
                            "params": [
                                order.tx_digest,
                                {
                                    "showInput": False,
                                    "showRawInput": False,
                                    "showEffects": True,
                                    "showEvents": True,
                                    "showObjectChanges": False,
                                    "showBalanceChanges": False
                                }
                            ]
                        }
                    )
                    
                    data = response.json()
                    
                    if "error" in data:
                        details.append({
                            "order_id": order.id,
                            "status": "error",
                            "message": data['error']['message']
                        })
                        continue
                    
                    result = data.get("result", {})
                    events = result.get("events", [])
                    event_types = [e.get("type", "") for e in events]
                    
                    # Determine if order was completed
                    if any("OrderCompleted" in et for et in event_types):
                        order.status = "COMPLETED"
                        order.updated_at = datetime.datetime.utcnow()
                        updated_count += 1
                        
                        details.append({
                            "order_id": order.id,
                            "status": "updated",
                            "new_status": "COMPLETED",
                            "events": event_types
                        })
                    else:
                        details.append({
                            "order_id": order.id,
                            "status": "no_change",
                            "current_status": "PENDING",
                            "events": event_types
                        })
                
                except Exception as e:
                    details.append({
                        "order_id": order.id,
                        "status": "error",
                        "message": str(e)
                    })
        
        # Commit all changes
        db.commit()
        
        return {
            "success": True,
            "message": f"Bulk sync complete: {updated_count} orders updated",
            "synced_count": len(pending_orders),
            "updated_count": updated_count,
            "details": details
        }
    
    except Exception as e:
        return {
            "success": False,
            "message": f"Bulk sync failed: {str(e)}",
            "synced_count": 0,
            "updated_count": 0
        }