from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from app.database import get_db, get_evm_db, EvmMerchant, EvmProduct, Order, Configuration
from app.schemas import ConfigurationOut, ConfigurationUpdate
import os
from datetime import datetime

router = APIRouter()

# Simple admin auth — env se secret key
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "quilvion-admin-2025")

def verify_admin(x_admin_secret: str = Header(...)):
    if x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Invalid admin secret")
    return True

# ── Dashboard stats ────────────────────────────────────────────────────────────
@router.get("/stats")
def admin_stats(db: Session = Depends(get_evm_db), _=Depends(verify_admin)):
    total_merchants = db.query(EvmMerchant).count()
    pending_merchants = db.query(EvmMerchant).filter(EvmMerchant.status == "pending").count()
    approved_merchants = db.query(EvmMerchant).filter(EvmMerchant.status == "approved").count()
    total_products = db.query(EvmProduct).count()
    pending_products = db.query(EvmProduct).filter(EvmProduct.status == "pending").count()
    approved_products = db.query(EvmProduct).filter(EvmProduct.status == "approved").count()
    rejected_products = db.query(EvmProduct).filter(EvmProduct.status == "rejected").count()
    return {
        "merchants": {
            "total": total_merchants,
            "pending": pending_merchants,
            "approved": approved_merchants,
        },
        "products": {
            "total": total_products,
            "pending": pending_products,
            "approved": approved_products,
            "rejected": rejected_products,
        }
    }

# ── All merchants ──────────────────────────────────────────────────────────────
@router.get("/merchants")
def get_all_merchants(db: Session = Depends(get_evm_db), _=Depends(verify_admin)):
    merchants = db.query(EvmMerchant).order_by(EvmMerchant.created_at.desc()).all()
    return [
        {
            "id": m.id,
            "wallet_address": m.wallet_address,
            "company_name": m.company_name,
            "category": m.category,
            "contact_email": m.contact_email,
            "description": m.description,
            "website": m.website,
            "status": m.status,
            "created_at": str(m.created_at),
        }
        for m in merchants
    ]

# ── Approve/reject merchant ────────────────────────────────────────────────────
@router.patch("/merchants/{merchant_id}/status")
def update_merchant_status(
    merchant_id: int,
    body: dict,
    db: Session = Depends(get_evm_db),
    _=Depends(verify_admin)
):
    status = body.get("status")
    if status not in ["approved", "rejected", "pending"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    merchant = db.query(EvmMerchant).filter(EvmMerchant.id == merchant_id).first()
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")
    merchant.status = status
    db.commit()
    return {"success": True, "merchant_id": merchant_id, "new_status": status}

# ── All products ───────────────────────────────────────────────────────────────
@router.get("/products")
def get_all_products(db: Session = Depends(get_evm_db), _=Depends(verify_admin)):
    products = db.query(EvmProduct).order_by(EvmProduct.created_at.desc()).all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "merchant_name": p.merchant_name,
            "merchant_wallet": p.merchant_wallet,
            "price_usdc": p.price_usdc,
            "category": p.category,
            "emoji": p.emoji,
            "description": p.description,
            "tags": p.tags.split(",") if p.tags else [],
            "images": p.images.split(",") if p.images else [],
            "status": p.status,
            "created_at": str(p.created_at),
        }
        for p in products
    ]


@router.get("/orders/pending")
def get_pending_orders(db: Session = Depends(get_db), _=Depends(verify_admin)):
    orders = db.query(Order).filter(Order.status == "PENDING").order_by(Order.created_at.desc()).all()
    return [
        {
            "id": o.id,
            "buyer_wallet": o.buyer_wallet,
            "merchant_wallet": o.merchant_wallet,
            "product_id": o.product_id,
            "product_name": o.product_name,
            "amount_usdc": o.amount_usdc,
            "status": o.status,
            "tx_digest": o.tx_digest,
            "risk_score": o.risk_score,
            "delivery_info": o.delivery_info,
            "created_at": str(o.created_at),
            "updated_at": str(o.updated_at) if o.updated_at else None,
        }
        for o in orders
    ]

# ── Approve/reject product ─────────────────────────────────────────────────────
@router.patch("/products/{product_id}/status")
def update_product_status(
    product_id: int,
    body: dict,
    db: Session = Depends(get_evm_db),
    _=Depends(verify_admin)
):
    status = body.get("status")
    if status not in ["approved", "rejected", "pending"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    product = db.query(EvmProduct).filter(EvmProduct.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    product.status = status
    db.commit()
    return {"success": True, "product_id": product_id, "new_status": status}

# ── Delete product ─────────────────────────────────────────────────────────────
@router.delete("/products/{product_id}")
def delete_product(
    product_id: int,
    db: Session = Depends(get_evm_db),
    _=Depends(verify_admin)
):
    product = db.query(EvmProduct).filter(EvmProduct.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    db.delete(product)
    db.commit()
    return {"success": True}


# ── Protocol Configuration Management ──────────────────────────────────────────
def get_or_create_config(db: Session) -> Configuration:
    """Get the singleton configuration, create if doesn't exist"""
    config = db.query(Configuration).first()
    if not config:
        config = Configuration()
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


@router.get("/configuration", response_model=ConfigurationOut)
def get_configuration(db: Session = Depends(get_db), _=Depends(verify_admin)):
    """Fetch current protocol configuration"""
    config = get_or_create_config(db)
    return config


@router.post("/configuration/sync")
def sync_configuration_from_chain(db: Session = Depends(get_db), _=Depends(verify_admin)):
    """
    Sync configuration from on-chain (Sui blockchain).
    This should be called after transactions are confirmed.
    For now, returns success — in production, read from Sui RPC.
    """
    config = get_or_create_config(db)
    config.last_synced_at = datetime.utcnow()
    db.commit()
    db.refresh(config)
    return {
        "success": True,
        "message": "Configuration sync queued",
        "config": ConfigurationOut.from_orm(config)
    }


@router.patch("/configuration")
def update_configuration(
    update: ConfigurationUpdate,
    db: Session = Depends(get_db),
    _=Depends(verify_admin)
):
    """Update protocol configuration (after on-chain transaction confirmed)"""
    config = get_or_create_config(db)
    
    # Only update fields that are explicitly provided
    if update.platform_fee_bps is not None:
        config.platform_fee_bps = update.platform_fee_bps
    if update.admin_approval_threshold_micro is not None:
        config.admin_approval_threshold_micro = update.admin_approval_threshold_micro
    if update.daily_spend_limit_micro is not None:
        config.daily_spend_limit_micro = update.daily_spend_limit_micro
    if update.dispute_refund_window_seconds is not None:
        config.dispute_refund_window_seconds = update.dispute_refund_window_seconds
    if update.merchant_verification_expiry_seconds is not None:
        config.merchant_verification_expiry_seconds = update.merchant_verification_expiry_seconds
    
    config.last_synced_at = datetime.utcnow()
    db.commit()
    db.refresh(config)
    
    return ConfigurationOut.from_orm(config)