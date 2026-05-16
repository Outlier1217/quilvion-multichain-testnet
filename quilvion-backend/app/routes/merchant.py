from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from app.database import get_db, Merchant, Product
from app.schemas import MerchantCreate, MerchantOut, ProductCreate
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


def _product_to_dict(p: Product) -> dict:
    return {
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
        "delivery_info": p.delivery_info,
        "status": p.status,
        "rating": p.rating,
        "review_count": p.review_count,
        "merchant_orders": p.merchant_orders,
        "merchant_success_rate": p.merchant_success_rate,
        "created_at": str(p.created_at),
    }


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
        status="approved",
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
        raise HTTPException(status_code=404, detail="Pehle merchant register karo")
    if merchant.status != "approved":
        raise HTTPException(status_code=403, detail="Merchant approved nahi hai abhi")

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
        delivery_info=data.delivery_info,
        status="approved",
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
    return [_product_to_dict(p) for p in products]


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
    product.delivery_info = data.delivery_info
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
