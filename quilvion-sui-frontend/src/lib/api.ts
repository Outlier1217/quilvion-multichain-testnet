// src/lib/api.ts
// FastAPI backend client — ML risk scoring + Groq LLM

import { API_BASE } from "./sui/constants";

// ── Risk Score (ML — fast) ────────────────────────────────────────────────────
export async function getRiskScore(params: {
  orderId: string;
  buyerWallet: string;
  merchantWallet: string;
  amountUsdc: number;
  buyerWalletAgeDays?: number;
  buyerTotalOrders?: number;
}) {
  const res = await fetch(`${API_BASE}/api/risk/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: params.orderId,
      buyer_wallet: params.buyerWallet,
      merchant_wallet: params.merchantWallet,
      amount_usdc: params.amountUsdc,
      chain: "sui",
      buyer_wallet_age_days: params.buyerWalletAgeDays ?? 30,
      buyer_total_orders: params.buyerTotalOrders ?? 0,
    }),
  });
  return res.json();
}

// ── Fraud Explanation (LLM — async) ──────────────────────────────────────────
export async function getFraudExplanation(params: {
  orderId: string;
  riskScore: number;
  riskLevel: string;
  signals: string[];
  amountUsdc: number;
  buyerWallet: string;
  merchantWallet: string;
  buyerWalletAgeDays?: number;
  buyerTotalOrders?: number;
}) {
  const res = await fetch(`${API_BASE}/api/llm/fraud-explanation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: params.orderId,
      risk_score: params.riskScore,
      risk_level: params.riskLevel,
      signals: params.signals,
      amount_usdc: params.amountUsdc,
      buyer_wallet: params.buyerWallet,
      merchant_wallet: params.merchantWallet,
      buyer_wallet_age_days: params.buyerWalletAgeDays ?? 30,
      buyer_total_orders: params.buyerTotalOrders ?? 0,
      buyer_dispute_count: 0,
    }),
  });
  return res.json();
}

// ── Buyer Chat (LLM) ──────────────────────────────────────────────────────────
export async function buyerChat(params: {
  buyerWallet: string;
  message: string;
  buyerTier?: string;
  buyerOrders?: number;
}) {
  const res = await fetch(`${API_BASE}/api/llm/buyer-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      buyer_wallet: params.buyerWallet,
      message: params.message,
      chain: "sui",
      buyer_tier: params.buyerTier ?? "Bronze",
      buyer_orders: params.buyerOrders ?? 0,
    }),
  });
  return res.json();
}

// ── XP Message (LLM) ─────────────────────────────────────────────────────────
export async function getXpMessage(params: {
  buyerWallet: string;
  newTier: string;
  totalOrders: number;
  totalSpentUsdc: number;
  xpPoints: number;
}) {
  const res = await fetch(`${API_BASE}/api/llm/xp-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      buyer_wallet: params.buyerWallet,
      new_tier: params.newTier,
      total_orders: params.totalOrders,
      total_spent_usdc: params.totalSpentUsdc,
      avg_risk_score: 15,
      xp_points: params.xpPoints,
    }),
  });
  return res.json();
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Merchant register
export async function registerMerchant(data: {
  wallet_address: string;
  company_name: string;
  description: string;
  website?: string;
  category: string;
  contact_email: string;
}) {
  const res = await fetch(`${API}/api/merchant/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Merchant status check by wallet
export async function getMerchantProfile(wallet: string) {
  const res = await fetch(`${API}/api/merchant/${wallet}/profile`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch merchant");
  return res.json();
}

// Merchant ke products
export async function fetchMerchantProducts(wallet: string) {
  const res = await fetch(`${API}/api/merchant/${wallet}/products`);
  if (!res.ok) throw new Error("Failed to fetch products");
  return res.json();
}

// Product add karo
export async function addProduct(data: {
  merchant_wallet: string;
  name: string;
  description: string;
  price_usdc: number;
  category: string;
  emoji: string;
  tags: string[];
  images: string[];        // ← ye add karo
  delivery_info: string;
}) {
  const res = await fetch(`${API}/api/merchant/product/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Buyer marketplace — all approved products
export async function fetchProducts(category?: string) {
  const url = category && category !== "All"
    ? `${API}/api/buyer/products?category=${encodeURIComponent(category)}`
    : `${API}/api/buyer/products`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch products");
  const data = await res.json();

  return data.map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    priceUsdc: p.price_usdc,
    category: p.category,
    emoji: p.emoji,
    merchantWallet: p.merchant_wallet,
    merchantName: p.merchant_name,
    merchantOrders: p.merchant_orders,
    merchantSuccessRate: p.merchant_success_rate,
    rating: p.rating,
    reviewCount: p.review_count,
    tags: p.tags || [],
    images: p.images || [],
  }));
}


export async function editProduct(productId: number, data: {
  merchant_wallet: string;
  name: string;
  description: string;
  price_usdc: number;
  category: string;
  emoji: string;
  tags: string[];
  images: string[];
  delivery_info: string;
}) {
  const res = await fetch(`${API}/api/merchant/product/${productId}/edit`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}