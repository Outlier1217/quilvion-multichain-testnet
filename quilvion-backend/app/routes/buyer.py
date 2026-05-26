"""buyer.py"""
from pydantic import BaseModel
from fastapi import APIRouter, Depends  # Depends add karo agar nahi hai
from sqlalchemy.orm import Session
from app.database import get_db, Product
from app.database import get_db, Product
from sqlalchemy.orm import Session
router = APIRouter()

class AskRequest(BaseModel):
    buyer_wallet: str
    message: str
    chain: str = "sui"

@router.post("/ask")
async def ask(req: AskRequest, db: Session = Depends(get_db)):
    from app.llm.claude_client import call_claude, SYSTEM_BUYER_ASSISTANT
    
    # DB se approved products fetch karo
    products = db.query(Product).filter(Product.status == "approved").all()
    
    product_list = "\n".join([
        f"- ID:{p.id} | {p.name} | ${p.price_usdc} USDC | Category: {p.category} | Merchant: {p.merchant_name} | Tags: {p.tags}"
        for p in products
    ])
    
    # Context ke saath message banao
    context_message = f"""Available products on Quilvion marketplace:
{product_list if product_list else "No products listed yet."}

Buyer wallet: {req.buyer_wallet}
Chain: {req.chain}

Buyer's question: {req.message}"""
    
    reply = call_claude(SYSTEM_BUYER_ASSISTANT, context_message)
    return {"reply": reply, "products": [
        {
            "id": p.id,
            "name": p.name,
            "price_usdc": p.price_usdc,
            "category": p.category,
            "merchant_name": p.merchant_name,
            "emoji": p.emoji,
            "tags": p.tags.split(",") if p.tags else [],
        }
        for p in products
    ]}


# ── ye route add karo ─────────────────────────────────────────────────────────
@router.get("/products")
def get_all_products(
    category: str = None,
    db: Session = Depends(get_db)
):
    """Buyer marketplace — sirf approved products"""
    query = db.query(Product).filter(Product.status == "approved")
    if category and category != "All":
        query = query.filter(Product.category == category)
    products = query.order_by(Product.created_at.desc()).all()
    return [
        {
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
        }
        for p in products
    ]