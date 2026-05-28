from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class MerchantCreate(BaseModel):
    wallet_address: str
    company_name: str
    description: str
    website: Optional[str] = ""
    category: str
    contact_email: str


class MerchantOut(BaseModel):
    id: int
    wallet_address: str
    company_name: str
    description: str
    website: str
    category: str
    contact_email: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class ProductCreate(BaseModel):
    merchant_wallet: str
    name: str
    description: str
    price_usdc: float
    category: str
    emoji: str = "🎁"
    tags: List[str] = []
    images: List[str] = []
    delivery_info: str


class ProductOut(BaseModel):
    id: int
    merchant_wallet: str
    merchant_name: str
    name: str
    description: str
    price_usdc: float
    category: str
    emoji: str
    tags: List[str]
    delivery_info: str
    status: str
    rating: float
    review_count: int
    merchant_orders: int
    merchant_success_rate: float
    created_at: datetime

    class Config:
        from_attributes = True


class ConfigurationOut(BaseModel):
    """Protocol configuration parameters"""
    id: int
    platform_fee_bps: int
    admin_approval_threshold_micro: int
    daily_spend_limit_micro: int
    dispute_refund_window_seconds: int
    merchant_verification_expiry_seconds: int
    last_synced_at: Optional[datetime]
    updated_at: datetime

    class Config:
        from_attributes = True


class ConfigurationUpdate(BaseModel):
    """Update configuration parameters"""
    platform_fee_bps: Optional[int] = None
    admin_approval_threshold_micro: Optional[int] = None
    daily_spend_limit_micro: Optional[int] = None
    dispute_refund_window_seconds: Optional[int] = None
    merchant_verification_expiry_seconds: Optional[int] = None