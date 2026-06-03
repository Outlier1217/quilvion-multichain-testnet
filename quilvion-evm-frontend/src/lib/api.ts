// src/lib/api.ts
// FastAPI backend client — ML risk scoring + Groq LLM

import { API_BASE } from "./evm/constants";

const API = API_BASE;

export async function getRiskScore(params: {
  orderId: string;
  buyerWallet: string;
  merchantWallet: string;
  amountUsdc: number;
  buyerWalletAgeDays?: number;
  buyerTotalOrders?: number;
}) {
  const res = await fetch(`${API}/api/risk/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: params.orderId,
      buyer_wallet: params.buyerWallet,
      merchant_wallet: params.merchantWallet,
      amount_usdc: params.amountUsdc,
      chain: "evm",
      buyer_wallet_age_days: params.buyerWalletAgeDays ?? 30,
      buyer_total_orders: params.buyerTotalOrders ?? 0,
    }),
  });
  return res.json();
}

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
  const res = await fetch(`${API}/api/llm/fraud-explanation`, {
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

export async function buyerChat(params: {
  buyerWallet: string;
  message: string;
  buyerTier?: string;
  buyerOrders?: number;
}) {
  const res = await fetch(`${API}/api/buyer/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      buyer_wallet: params.buyerWallet,
      message: params.message,
      chain: "evm",
      buyer_tier: params.buyerTier ?? "Bronze",
      buyer_orders: params.buyerOrders ?? 0,
    }),
  });
  return res.json();
}

export async function getXpMessage(params: {
  buyerWallet: string;
  newTier: string;
  totalOrders: number;
  totalSpentUsdc: number;
  xpPoints: number;
}) {
  const res = await fetch(`${API}/api/llm/xp-message`, {
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

export async function getOrderCreatedEventByDigest(_txDigest: string) {
  return null;
}

export async function createOrderRecord(data: {
  buyer_wallet: string;
  merchant_wallet: string;
  product_id: number;
  product_name: string;
  amount_usdc: number;
  status?: string;
  chain?: string;
  network?: string;
  tx_digest?: string;
  tx_hash?: string;
  risk_score?: number | null;
  delivery_info?: string | null;
}) {
  const res = await fetch(`${API}/api/orders/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

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

export async function getMerchantProfile(wallet: string) {
  const res = await fetch(`${API}/api/merchant/${wallet}/profile`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch merchant");
  return res.json();
}

export async function fetchMerchantProducts(wallet: string) {
  const res = await fetch(`${API}/api/merchant/${wallet}/products`);
  if (!res.ok) throw new Error("Failed to fetch products");
  return res.json();
}

export async function addProduct(data: {
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
  const res = await fetch(`${API}/api/merchant/product/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchProducts(category?: string) {
  const url = category && category !== "All"
    ? `${API}/api/buyer/products?category=${encodeURIComponent(category)}`
    : `${API}/api/buyer/products`;

  const res = await fetch(url);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to fetch products (${res.status}): ${errorText.substring(0, 100)}`);
  }

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
    deliveryInfo: p.delivery_info || null,
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

export async function fetchBuyerOrders(walletAddress: string) {
  if (!walletAddress) return [];

  try {
    const res = await fetch(`${API}/api/orders/buyer/${walletAddress}`);
    if (!res.ok) {
      console.warn(`Failed to load buyer orders: ${res.status}`);
      return [];
    }
    return await res.json();
  } catch (err: any) {
    console.error("fetchBuyerOrders error:", err);
    return [];
  }
}

export async function fetchBuyerStats(walletAddress: string) {
  if (!walletAddress) return null;

  try {
    const res = await fetch(`${API}/api/buyer/stats/${walletAddress}`);
    if (!res.ok) {
      console.warn(`Stats fetch returned ${res.status}: ${res.statusText}`);
      return null;
    }
    return res.json();
  } catch (err: any) {
    console.warn("fetchBuyerStats error:", err);
    return null;
  }
}

export async function fetchMerchantStats(walletAddress: string) {
  if (!walletAddress) return null;

  try {
    const res = await fetch(`${API}/api/merchant/stats/${walletAddress}`);
    if (!res.ok) return null;
    return res.json();
  } catch (err) {
    console.error("fetchMerchantStats error:", err);
    return null;
  }
}

export async function fetchMerchantOrders(merchantWallet: string) {
  if (!merchantWallet) return [];

  try {
    const res = await fetch(`${API}/api/orders/merchant/${merchantWallet}`);
    if (!res.ok) {
      console.warn(`Failed to load merchant orders: ${res.status}`);
      return [];
    }
    return await res.json();
  } catch (err) {
    console.error("fetchMerchantOrders error:", err);
    return [];
  }
}

export async function getBuyerReputation(wallet: string) {
  return { xp: 0, tier: 'Bronze' };
}
