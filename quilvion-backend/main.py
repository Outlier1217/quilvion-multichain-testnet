"""
Quilvion Backend — FastAPI
ML (XGBoost fraud detection) + LLM (Groq) integrated
"""

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn

from app.routes import risk, llm, merchant, dispute, buyer


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load ML model on startup"""
    from app.ml.model import load_model
    load_model()
    print("✅ ML model loaded")
    yield
    print("👋 Shutting down")


app = FastAPI(
    title="Quilvion AI Backend",
    description="ML fraud detection + Groq LLM for Quilvion multichain commerce",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(risk.router,     prefix="/api/risk",     tags=["Risk & ML"])
app.include_router(llm.router,      prefix="/api/llm",      tags=["LLM"])
app.include_router(merchant.router, prefix="/api/merchant",  tags=["Merchant"])
app.include_router(dispute.router,  prefix="/api/dispute",   tags=["Dispute"])
app.include_router(buyer.router,    prefix="/api/buyer",     tags=["Buyer"])


@app.get("/")
def root():
    return {
        "service": "Quilvion AI Backend",
        "status": "running",
        "endpoints": {
            "risk_score":          "POST /api/risk/score",
            "fraud_explanation":   "POST /api/llm/fraud-explanation",
            "product_description": "POST /api/llm/product-description",
            "dispute_summary":     "POST /api/llm/dispute-summary",
            "merchant_profile":    "POST /api/llm/merchant-profile",
            "xp_message":          "POST /api/llm/xp-message",
            "buyer_chat":          "POST /api/llm/buyer-chat",
            "merchant_generate":   "POST /api/merchant/generate-description",
            "dispute_raise":       "POST /api/dispute/raise",
            "buyer_assistant":     "POST /api/buyer/ask",
        }
    }


@app.get("/health")
def health():
    from app.ml.model import is_model_loaded
    return {
        "status": "healthy",
        "ml_model": "loaded" if is_model_loaded() else "not_loaded",
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)