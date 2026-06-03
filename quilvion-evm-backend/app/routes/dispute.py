"""dispute.py"""
from fastapi import APIRouter
from pydantic import BaseModel
router = APIRouter()

class RaiseDisputeRequest(BaseModel):
    order_id: str
    buyer_wallet: str
    reason: str

@router.post("/raise")
async def raise_dispute(req: RaiseDisputeRequest):
    return {"status": "dispute_recorded", "order_id": req.order_id,
            "message": "Dispute raised. Admin will review within 24 hours."}