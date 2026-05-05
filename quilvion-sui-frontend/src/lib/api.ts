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