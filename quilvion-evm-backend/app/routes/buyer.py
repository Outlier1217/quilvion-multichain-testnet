"""buyer.py"""
from pydantic import BaseModel
from fastapi import APIRouter, Depends  # Depends add karo agar nahi hai
from sqlalchemy.orm import Session
from app.database import get_evm_db, get_db, EvmProduct, Order
from datetime import datetime, timedelta
import httpx

router = APIRouter(tags=["Buyer"])

class AskRequest(BaseModel):
    buyer_wallet: str
    message: str
    chain: str = "sui"

@router.post("/ask")
async def ask(req: AskRequest, db: Session = Depends(get_evm_db)):
    from app.llm.claude_client import call_claude, SYSTEM_BUYER_ASSISTANT
    
    # DB se approved products fetch karo
    products = db.query(EvmProduct).filter(EvmProduct.status == "approved").all()
    
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


# ── Mock products for marketplace ─────────────────────────────────────────────
MOCK_PRODUCTS = [
    {
        "id": 1,
        "name": "Complete Web3 Development Bootcamp",
        "description": "A comprehensive 40-hour course covering Solidity, Move, and Rust. Build 5 real dApps from scratch with hands-on projects and code reviews.",
        "price_usdc": 89,
        "category": "Education",
        "emoji": "🎓",
        "merchant_wallet": "0x5ae3c435809e3bb32c22284ab148eac5403bdf09d44c49d2ebd0405bd95707a4",
        "merchant_name": "Web3Academy",
        "merchant_orders": 234,
        "merchant_success_rate": 0.98,
        "rating": 4.9,
        "review_count": 189,
        "tags": ["Solidity", "Move", "Beginner-friendly"],
        "images": ["https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=500"],
        "delivery_info": "Digital content delivered instantly",
        "status": "approved",
    },
    {
        "id": 2,
        "name": "DeFi Analytics Dashboard Template",
        "description": "Production-ready Next.js dashboard with real-time price feeds, portfolio tracking, and on-chain analytics. Includes 3 months of updates.",
        "price_usdc": 149,
        "category": "Templates",
        "emoji": "📊",
        "merchant_wallet": "0x5ae3c435809e3bb32c22284ab148eac5403bdf09d44c49d2ebd0405bd95707a4",
        "merchant_name": "DevForge",
        "merchant_orders": 89,
        "merchant_success_rate": 0.96,
        "rating": 4.7,
        "review_count": 67,
        "tags": ["React", "Next.js", "DeFi"],
        "images": ["https://images.unsplash.com/photo-1526374965328-7f5ae4e8a83f?w=500"],
        "delivery_info": "Downloadable template + documentation",
        "status": "approved",
    },
    {
        "id": 3,
        "name": "Smart Contract Security Audit Report",
        "description": "Professional audit of your Move/Solidity contract. Includes vulnerability assessment, gas optimization, and detailed remediation guide.",
        "price_usdc": 2.50,
        "category": "Services",
        "emoji": "🔒",
        "merchant_wallet": "0x5ae3c435809e3bb32c22284ab148eac5403bdf09d44c49d2ebd0405bd95707a4",
        "merchant_name": "AuditPro",
        "merchant_orders": 156,
        "merchant_success_rate": 0.99,
        "rating": 5.0,
        "review_count": 234,
        "tags": ["Security", "Audit", "Move"],
        "images": ["https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=500"],
        "delivery_info": "Digital report via email",
        "status": "approved",
    },
]

@router.get("/products")
def get_all_products(
    category: str = None,
    db: Session = Depends(get_evm_db)
):
    """Buyer marketplace — approved products from database"""
    query = db.query(EvmProduct).filter(EvmProduct.status == "approved")
    if category and category != "All":
        query = query.filter(EvmProduct.category == category)
    
    products = query.order_by(EvmProduct.created_at.desc()).all()
    
    # If no products in DB, return mock data for testing
    if not products:
        if category and category != "All":
            return [p for p in MOCK_PRODUCTS if p["category"] == category]
        return MOCK_PRODUCTS
    
    return [
        {
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "price_usdc": p.price_usdc,
            "category": p.category,
            "emoji": p.emoji,
            "merchant_wallet": p.merchant_wallet,
            "merchant_name": p.merchant_name,
            "merchant_orders": p.merchant_orders or 0,
            "merchant_success_rate": p.merchant_success_rate or 0.0,
            "rating": p.rating or 0.0,
            "review_count": p.review_count or 0,
            "tags": [t.strip() for t in p.tags.split(",") if t.strip()] if p.tags else [],
            "images": [i.strip() for i in p.images.split(",") if i.strip()] if p.images else [],
            "delivery_info": p.delivery_info or None,
            "status": p.status,
        }
        for p in products
    ]


@router.get("/stats/{wallet_address}")
async def get_buyer_stats(
    wallet_address: str,
    db: Session = Depends(get_db)
):
    """Get buyer XP, tier, daily spend, and order stats"""
    from app.database import BuyerProfile
    try:
        orders = db.query(Order).filter(Order.buyer_wallet == wallet_address).all()
        total_orders = len(orders)
        completed_orders = sum(1 for o in orders if o.status in ("COMPLETED", "ESCROW_RELEASED"))

        today = datetime.utcnow().date()
        daily_spent = sum(o.amount_usdc for o in orders if o.created_at and o.created_at.date() == today)

        profile = db.query(BuyerProfile).filter(BuyerProfile.wallet_address == wallet_address).first()
        if profile:
            xp = profile.xp
            tier = profile.tier
        else:
            xp = (total_orders * 5) + (completed_orders * 10)
            tier = "Gold" if xp >= 500 else "Silver" if xp >= 100 else "Bronze"

        return {
            "xp": xp,
            "tier": tier,
            "dailySpent": daily_spent,
            "dailyLimit": 1000,
            "totalOrders": total_orders,
            "completedOrders": completed_orders,
            "averageOrderValue": sum(o.amount_usdc for o in orders) / len(orders) if orders else 0.0,
        }
    except Exception as e:
        print(f"Error fetching buyer stats: {str(e)}")
        return {"xp": 0, "tier": "Bronze", "dailySpent": 0, "dailyLimit": 1000, "totalOrders": 0, "completedOrders": 0, "averageOrderValue": 0}


@router.get("/{wallet_address}")
async def get_buyer_profile(
    wallet_address: str,
    db: Session = Depends(get_db)
):
    """Get buyer profile (alias for /stats/{wallet_address})"""
    
    try:
        # Get all orders for this buyer
        orders = db.query(Order).filter(Order.buyer_wallet == wallet_address).all()
        
        total_orders = len(orders)
        completed_orders = sum(1 for o in orders if o.status == "COMPLETED")
        
        # Calculate daily spent from today's orders
        today = datetime.utcnow().date()
        today_orders = [o for o in orders if o.created_at and o.created_at.date() == today]
        daily_spent = sum(o.amount_usdc for o in today_orders) if today_orders else 0.0
        
        # Calculate XP: 10 XP per completed order (from README)
        xp = completed_orders * 10
        
        # Determine tier based on XP (from README)
        if xp >= 500:
            tier = "Gold"
        elif xp >= 100:
            tier = "Silver"
        else:
            tier = "Bronze"
        
        average_order = sum(o.amount_usdc for o in orders) / len(orders) if orders else 0.0
        
        return {
            "xp": xp,
            "tier": tier,
            "dailySpent": daily_spent,
            "dailyLimit": 1000,  # From README: 1,000 USDC
            "totalOrders": total_orders,
            "completedOrders": completed_orders,
            "averageOrderValue": average_order,
        }
    
    except Exception as e:
        print(f"Error fetching buyer stats: {str(e)}")
        return {
            "xp": 0,
            "tier": "Bronze",
            "dailySpent": 0,
            "dailyLimit": 1000,
            "totalOrders": 0,
            "completedOrders": 0,
            "averageOrderValue": 0,
        }