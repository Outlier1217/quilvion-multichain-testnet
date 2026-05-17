from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from app.database import get_db, Merchant, Product
import os

router = APIRouter()

# Simple admin auth — env se secret key
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "quilvion-admin-2025")

def verify_admin(x_admin_secret: str = Header(...)):
    if x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Invalid admin secret")
    return True

# ── Dashboard stats ────────────────────────────────────────────────────────────
@router.get("/stats")
def admin_stats(db: Session = Depends(get_db), _=Depends(verify_admin)):
    total_merchants = db.query(Merchant).count()
    pending_merchants = db.query(Merchant).filter(Merchant.status == "pending").count()
    approved_merchants = db.query(Merchant).filter(Merchant.status == "approved").count()
    total_products = db.query(Product).count()
    pending_products = db.query(Product).filter(Product.status == "pending").count()
    approved_products = db.query(Product).filter(Product.status == "approved").count()
    rejected_products = db.query(Product).filter(Product.status == "rejected").count()
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
def get_all_merchants(db: Session = Depends(get_db), _=Depends(verify_admin)):
    merchants = db.query(Merchant).order_by(Merchant.created_at.desc()).all()
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
    db: Session = Depends(get_db),
    _=Depends(verify_admin)
):
    status = body.get("status")
    if status not in ["approved", "rejected", "pending"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    merchant = db.query(Merchant).filter(Merchant.id == merchant_id).first()
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")
    merchant.status = status
    db.commit()
    return {"success": True, "merchant_id": merchant_id, "new_status": status}

# ── All products ───────────────────────────────────────────────────────────────
@router.get("/products")
def get_all_products(db: Session = Depends(get_db), _=Depends(verify_admin)):
    products = db.query(Product).order_by(Product.created_at.desc()).all()
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

# ── Approve/reject product ─────────────────────────────────────────────────────
@router.patch("/products/{product_id}/status")
def update_product_status(
    product_id: int,
    body: dict,
    db: Session = Depends(get_db),
    _=Depends(verify_admin)
):
    status = body.get("status")
    if status not in ["approved", "rejected", "pending"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    product.status = status
    db.commit()
    return {"success": True, "product_id": product_id, "new_status": status}

# ── Delete product ─────────────────────────────────────────────────────────────
@router.delete("/products/{product_id}")
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    _=Depends(verify_admin)
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    db.delete(product)
    db.commit()
    return {"success": True}