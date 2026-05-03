"""merchant.py — Merchant helper endpoints"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

class GenerateDescRequest(BaseModel):
    merchant_wallet: str
    raw_notes: str
    category: Optional[str] = None
    price_usdc: Optional[float] = None

@router.post("/generate-description")
async def generate_description(req: GenerateDescRequest):
    """Shortcut: calls LLM product description directly"""
    from app.llm.claude_client import call_claude, SYSTEM_PRODUCT_WRITER
    prompt = f"Notes: {req.raw_notes}\nCategory: {req.category or 'General'}\nPrice: {req.price_usdc or 'TBD'} USDC"
    desc = call_claude(SYSTEM_PRODUCT_WRITER, prompt)
    return {"description": desc, "word_count": len(desc.split())}