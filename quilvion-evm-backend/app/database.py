import os
from sqlalchemy import (
    create_engine, Column, Integer, String,
    Float, Boolean, Text, DateTime
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import datetime

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable not set!")

# psycopg2 ke liye URL fix (Neon/Railway sometimes send postgres://)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,       # connection drop hone par auto-reconnect
    pool_size=5,
    max_overflow=10,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ── Models ─────────────────────────────────────────────────────────────────────

class Merchant(Base):
    __tablename__ = "merchants"

    id              = Column(Integer, primary_key=True, index=True)
    wallet_address  = Column(String(100), unique=True, index=True, nullable=False)
    company_name    = Column(String(200), nullable=False)
    description     = Column(Text, nullable=False)
    website         = Column(String(300), default="")
    category        = Column(String(100), nullable=False)
    contact_email   = Column(String(200), nullable=False)
    status          = Column(String(20), default="pending")   # pending | approved | rejected
    created_at      = Column(DateTime, default=datetime.datetime.utcnow)


class Product(Base):
    __tablename__ = "products"

    id                    = Column(Integer, primary_key=True, index=True)
    merchant_wallet       = Column(String(100), nullable=False, index=True)
    merchant_name         = Column(String(200), nullable=False)
    name                  = Column(String(300), nullable=False)
    description           = Column(Text, nullable=False)
    price_usdc            = Column(Float, nullable=False)
    category              = Column(String(100), nullable=False)
    emoji                 = Column(String(10), default="🎁")
    tags                  = Column(Text, default="")          # comma-separated
    images                = Column(Text, default="")
    delivery_info         = Column(Text, default="")
    status                = Column(String(20), default="pending")  # pending | approved | rejected
    rating                = Column(Float, default=0.0)
    review_count          = Column(Integer, default=0)
    merchant_orders       = Column(Integer, default=0)
    merchant_success_rate = Column(Float, default=1.0)
    created_at            = Column(DateTime, default=datetime.datetime.utcnow)


class Order(Base):
    __tablename__ = "orders"
    
    id = Column(Integer, primary_key=True, index=True)
    buyer_wallet = Column(String(100), nullable=False, index=True)
    merchant_wallet = Column(String(100), nullable=False, index=True)
    product_id = Column(Integer, nullable=False)
    product_name = Column(String(300), nullable=False)
    amount_usdc = Column(Float, nullable=False)
    status = Column(String(20), default="PENDING", index=True)  # PENDING, COMPLETED, DISPUTED, CANCELLED, ESCROW_RELEASED, REFUNDED
    tx_digest = Column(String(100), nullable=True)
    risk_score = Column(Integer, nullable=True)
    delivery_info = Column(Text, nullable=True)  # Merchant-provided delivery/link after completion
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class BuyerProfile(Base):
    __tablename__ = "buyer_profiles"
    
    id = Column(Integer, primary_key=True, index=True)
    wallet_address = Column(String(100), unique=True, index=True, nullable=False)
    xp = Column(Integer, default=0)
    tier = Column(String(50), default="Bronze")  # Bronze, Silver, Gold
    daily_spent = Column(Float, default=0.0)
    daily_limit = Column(Float, default=1000.0)
    total_orders = Column(Integer, default=0)
    completed_orders = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class Configuration(Base):
    __tablename__ = "configuration"
    
    id = Column(Integer, primary_key=True, index=True)
    platform_fee_bps = Column(Integer, default=250)  # basis points (250 = 2.5%)
    admin_approval_threshold_micro = Column(Integer, default=500000000)  # 500 USDC in micro-units
    daily_spend_limit_micro = Column(Integer, default=1000000000)  # 1000 USDC in micro-units
    dispute_refund_window_seconds = Column(Integer, default=604800)  # 7 days in seconds
    merchant_verification_expiry_seconds = Column(Integer, default=31536000)  # 1 year in seconds
    last_synced_at = Column(DateTime, nullable=True)  # When last synced from on-chain
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


# ── Helpers ────────────────────────────────────────────────────────────────────

def get_db():
    """FastAPI dependency — DB session per request"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
    # Add missing columns to products
    try:
        with engine.connect() as conn:
            conn.execute(__import__('sqlalchemy').text(
                "ALTER TABLE products ADD COLUMN IF NOT EXISTS images TEXT DEFAULT ''"
            ))
            # Add delivery_info to orders if table exists
            conn.execute(__import__('sqlalchemy').text(
                "ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_info TEXT DEFAULT NULL"
            ))
            conn.commit()
    except Exception:
        pass
    print("✅ PostgreSQL tables ready")