from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from app.database import get_db, Merchant, Product, Order
from app.schemas import MerchantCreate, MerchantOut, ProductCreate
from app.encrypt import encrypt_delivery_info
from pydantic import BaseModel
import cloudinary
import cloudinary.uploader
import os

router = APIRouter()

# Cloudinary config
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
)


def _product_to_dict(p: Product, include_encrypted_delivery: bool = False) -> dict:
    """
    Convert Product to dict
    
    Args:
        p: Product model instance
        include_encrypted_delivery: If True, include encrypted delivery_info (for merchant/admin only)
    """
    result = {
        "id": p.id,
        "merchant_wallet": p.merchant_wallet,
        "merchant_name": p.merchant_name,
        "name": p.name,
        "description": p.description,
        "price_usdc": p.price_usdc,
        "category": p.category,
        "emoji": p.emoji,
        "tags": [t.strip() for t in p.tags.split(",") if t.strip()] if p.tags else [],
        "images": [i.strip() for i in p.images.split(",") if i.strip()] if p.images else [],
        "status": p.status,
        "rating": p.rating,
        "review_count": p.review_count,
        "merchant_orders": p.merchant_orders,
        "merchant_success_rate": p.merchant_success_rate,
        "created_at": str(p.created_at),
    }
    
    # Only include encrypted delivery_info for merchants/admins, not for public marketplace
    if include_encrypted_delivery:
        result["delivery_info"] = p.delivery_info
    else:
        result["delivery_info"] = None  # Hidden from public view
    
    return result


# ── Image upload ───────────────────────────────────────────────────────────────
@router.post("/product/upload-image")
async def upload_image(request: Request):
    body = await request.json()
    image_data = body.get("image")
    if not image_data:
        raise HTTPException(status_code=400, detail="No image provided")
    try:
        result = cloudinary.uploader.upload(
            image_data,
            folder="quilvion_products",
            transformation=[{"width": 800, "height": 800, "crop": "limit"}],
        )
        return {"url": result["secure_url"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


# ── Register merchant ──────────────────────────────────────────────────────────
@router.post("/register", response_model=MerchantOut)
def register_merchant(data: MerchantCreate, db: Session = Depends(get_db)):
    existing = db.query(Merchant).filter(
        Merchant.wallet_address == data.wallet_address
    ).first()
    if existing:
        return existing

    merchant = Merchant(
        wallet_address=data.wallet_address,
        company_name=data.company_name,
        description=data.description,
        website=data.website or "",
        category=data.category,
        contact_email=data.contact_email,
        status="pending",
    )
    db.add(merchant)
    db.commit()
    db.refresh(merchant)
    return merchant


# ── Get merchant by wallet ─────────────────────────────────────────────────────
@router.get("/{wallet_address}/profile", response_model=MerchantOut)
def get_merchant(wallet_address: str, db: Session = Depends(get_db)):
    merchant = db.query(Merchant).filter(
        Merchant.wallet_address == wallet_address
    ).first()
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")
    return merchant


# ── Add product ────────────────────────────────────────────────────────────────
@router.post("/product/add")
def add_product(data: ProductCreate, db: Session = Depends(get_db)):
    merchant = db.query(Merchant).filter(
        Merchant.wallet_address == data.merchant_wallet
    ).first()
    if not merchant:
        raise HTTPException(status_code=404, detail="Please Register a Merchant")
    if merchant.status != "approved":
        raise HTTPException(status_code=403, detail="Merchant is not approved yet")

    # Encrypt delivery info before storing
    encrypted_delivery_info = encrypt_delivery_info(data.delivery_info)

    product = Product(
        merchant_wallet=data.merchant_wallet,
        merchant_name=merchant.company_name,
        name=data.name,
        description=data.description,
        price_usdc=data.price_usdc,
        category=data.category,
        emoji=data.emoji,
        tags=",".join(data.tags),
        images=",".join(data.images),   # ← NAYA
        delivery_info=encrypted_delivery_info,  # ← ENCRYPTED
        status="pending",
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return {"success": True, "product_id": product.id, "name": product.name}


# ── Merchant ke apne products ──────────────────────────────────────────────────
@router.get("/{wallet_address}/products")
def get_merchant_products(wallet_address: str, db: Session = Depends(get_db)):
    products = db.query(Product).filter(
        Product.merchant_wallet == wallet_address
    ).order_by(Product.created_at.desc()).all()
    return [_product_to_dict(p, include_encrypted_delivery=True) for p in products]


# ── Admin: product status update ───────────────────────────────────────────────
@router.patch("/product/{product_id}/status")
def update_product_status(
    product_id: int,
    status: str = Query(..., pattern="^(approved|rejected|pending)$"),
    db: Session = Depends(get_db)
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    product.status = status
    db.commit()
    return {"success": True, "product_id": product_id, "new_status": status}


# ── Admin routes ───────────────────────────────────────────────────────────────
@router.get("/admin/all-merchants")
def all_merchants(db: Session = Depends(get_db)):
    return db.query(Merchant).order_by(Merchant.created_at.desc()).all()


# ── Edit product ───────────────────────────────────────────────────────────────
@router.put("/product/{product_id}/edit")
def edit_product(product_id: int, data: ProductCreate, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.merchant_wallet != data.merchant_wallet:
        raise HTTPException(status_code=403, detail="Ye tumhara product nahi hai")

    product.name         = data.name
    product.description  = data.description
    product.price_usdc   = data.price_usdc
    product.category     = data.category
    product.emoji        = data.emoji
    product.tags         = ",".join(data.tags)
    product.images       = ",".join(data.images)
    # Encrypt delivery info before storing
    product.delivery_info = encrypt_delivery_info(data.delivery_info)
    db.commit()
    return {"success": True, "product_id": product_id}

@router.get("/admin/pending-products")
def pending_products(db: Session = Depends(get_db)):
    products = db.query(Product).filter(Product.status == "pending").all()
    return [_product_to_dict(p) for p in products]


class DescriptionRequest(BaseModel):
    name: str
    category: str = ""
    tags: list[str] = []
    price: float = 0

@router.post("/generate-description")
def generate_description(data: DescriptionRequest):
    from app.llm.claude_client import call_claude, SYSTEM_PRODUCT_WRITER
    prompt = f"Product: {data.name}\nCategory: {data.category}\nTags: {', '.join(data.tags)}\nPrice: ${data.price} USDC"
    description = call_claude(SYSTEM_PRODUCT_WRITER, prompt)
    return {"description": description}


@router.get("/stats/{wallet_address}")
def get_merchant_stats(wallet_address: str, db: Session = Depends(get_db)):
    """Get merchant score, revenue, and order stats"""
    
    try:
        # Get merchant profile
        merchant = db.query(Merchant).filter(Merchant.wallet_address == wallet_address).first()
        if not merchant:
            return {
                "merchantScore": 0,
                "totalOrders": 0,
                "completedOrders": 0,
                "disputedOrders": 0,
                "totalRevenue": 0,
                "averageOrderValue": 0,
                "successRate": 100,
                "companyName": "Unknown",
                "category": "General",
            }
        
        # Get all orders for this merchant
        orders = db.query(Order).filter(Order.merchant_wallet == wallet_address).all()
        
        total_orders = len(orders)
        completed_orders = sum(1 for o in orders if o.status == "COMPLETED")
        disputed_orders = sum(1 for o in orders if o.status == "DISPUTED")
        
        # Calculate total revenue (from completed orders only)
        total_revenue = sum(o.amount_usdc for o in orders if o.status == "COMPLETED")
        
        # Calculate average order value
        average_order = sum(o.amount_usdc for o in orders) / len(orders) if orders else 0.0
        
        # Calculate success rate
        success_rate = (completed_orders / total_orders * 100) if total_orders > 0 else 100
        
        # Calculate merchant score (from README: +5 per settled order, -20 per dispute against merchant)
        # For simplicity, we estimate based on completed vs disputed
        merchant_score = min(100, completed_orders * 5 - disputed_orders * 20)
        merchant_score = max(0, merchant_score)  # Floor at 0
        
        return {
            "merchantScore": merchant_score,
            "totalOrders": total_orders,
            "completedOrders": completed_orders,
            "disputedOrders": disputed_orders,
            "totalRevenue": total_revenue,
            "averageOrderValue": average_order,
            "successRate": round(success_rate),
            "companyName": merchant.company_name,
            "category": merchant.category,
        }
    
    except Exception as e:
        print(f"Error fetching merchant stats: {str(e)}")
        return {
            "merchantScore": 0,
            "totalOrders": 0,
            "completedOrders": 0,
            "disputedOrders": 0,
            "totalRevenue": 0,
            "averageOrderValue": 0,
            "successRate": 100,
            "companyName": "Unknown",
            "category": "General",
        }
