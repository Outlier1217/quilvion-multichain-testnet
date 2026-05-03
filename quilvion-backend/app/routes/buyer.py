"""buyer.py"""
from fastapi import APIRouter
from pydantic import BaseModel
router = APIRouter()

class AskRequest(BaseModel):
    buyer_wallet: str
    message: str
    chain: str = "sui"

@router.post("/ask")
async def ask(req: AskRequest):
    from app.llm.claude_client import call_claude, SYSTEM_BUYER_ASSISTANT
    reply = call_claude(SYSTEM_BUYER_ASSISTANT, f"Buyer ({req.buyer_wallet}) on {req.chain}: {req.message}")
    return {"reply": reply}