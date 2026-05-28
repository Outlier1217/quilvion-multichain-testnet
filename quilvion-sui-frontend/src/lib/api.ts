// src/lib/api.ts
// FastAPI backend client — ML risk scoring + Groq LLM

import { API_BASE, SUI_CONFIG } from "./sui/constants";

// Use API_BASE from constants to ensure consistency
const API = API_BASE;

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
  const res = await fetch(`${API_BASE}/api/buyer/ask`, {
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
  return res.json(); // { reply, products }
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

export async function getOrderCreatedEventByDigest(txDigest: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const res = await fetch('https://fullnode.testnet.sui.io:443', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sui_getTransactionBlock',
        params: [txDigest, { showEvents: true }],
      }),
    });
    const data = await res.json();
    const orderCreatedEvent = data?.result?.events?.find((event: any) =>
      String(event?.type || '').includes('OrderCreated') && event?.parsedJson?.order_id !== undefined
    );

    if (orderCreatedEvent) return orderCreatedEvent;

    await new Promise(resolve => setTimeout(resolve, 750));
  }

  return null;
}

export async function createOrderRecord(data: {
  id: number;
  buyer_wallet: string;
  merchant_wallet: string;
  product_id: number;
  product_name: string;
  amount_usdc: number;
  status?: string;
  tx_digest?: string;
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
  
  console.log('[fetchProducts] Calling:', url);
  
  const res = await fetch(url);
  
  console.log('[fetchProducts] Response status:', res.status);
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error('[fetchProducts] Error response:', errorText.substring(0, 200));
    throw new Error(`Failed to fetch products (${res.status}): ${errorText.substring(0, 100)}`);
  }
  
  const data = await res.json();
  console.log('[fetchProducts] Got data:', data.length, 'products');

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
    // Fetch backend orders with timeout
    let backendOrders: any[] = [];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const backendOrdersRes = await fetch(`${API}/api/orders/buyer/${walletAddress}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      if (backendOrdersRes.ok) {
        backendOrders = await backendOrdersRes.json();
      } else {
        console.warn(`Backend orders fetch returned ${backendOrdersRes.status}: ${backendOrdersRes.statusText}`);
      }
    } catch (fetchErr: any) {
      console.warn('Failed to fetch backend orders:', fetchErr.message);
      // Continue with blockchain data only if backend fails
    }

    const backendOrdersById = new Map<number, any>(
      backendOrders.map((order: any) => [Number(order.id), order])
    );

    // 1. Get all relevant events from blockchain
    const query = (type: string) => 
      fetch('https://fullnode.testnet.sui.io:443', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'suix_queryEvents',
          params: [{ MoveEventType: `${SUI_CONFIG.PACKAGE_ID}::events::${type}` }, null, 50, true]
        })
      })
      .then(r => r.json())
      .then(d => d?.result?.data ?? [])
      .catch(err => {
        console.warn(`Failed to fetch ${type} events:`, err.message);
        return [];
      });

    const [created, completed, disputed, resolved, riskSet] = await Promise.all([
      query('OrderCreated'),
      query('OrderCompleted'),
      query('OrderDisputed'),
      query('DisputeResolved'),
      query('RiskScoreSet'),
    ]);

    // 2. Fetch all products to match names
    const allProducts = await fetchProducts().catch(err => {
      console.warn('Failed to fetch products:', err.message);
      return [];
    });

    // 3. Process orders
    const myOrders = created
      .filter((e: any) => e.parsedJson?.buyer === walletAddress)
      .map((e: any) => {
        const orderId = e.parsedJson?.order_id;
        const productId = e.parsedJson?.product_id;
        
        // Determine status
        let status = 'PENDING';
        if (completed.some((ev: any) => ev.parsedJson?.order_id === orderId)) status = 'COMPLETED';
        else if (disputed.some((ev: any) => ev.parsedJson?.order_id === orderId)) {
          const resEv = resolved.find((ev: any) => ev.parsedJson?.order_id === orderId);
          if (resEv) {
            status = resEv.parsedJson?.favor_buyer ? 'REFUNDED' : 'ESCROW_RELEASED';
          } else {
            status = 'DISPUTED';
          }
        }

        // Risk score
        const riskEv = riskSet.find((ev: any) => ev.parsedJson?.order_id === orderId);
        const riskScore = riskEv ? Number(riskEv.parsedJson?.score) : null;

        // Product name
        const product = allProducts.find((p: any) => String(p.id) === String(productId));
        const backendOrder = backendOrdersById.get(Number(orderId));

        return {
          id: Number(orderId),
          productId: Number(productId),
          productName: backendOrder?.product_name || product?.name || `Order #${orderId}`,
          amountUsdc: Number(e.parsedJson?.amount ?? 0) / 1_000_000,
          status: status || backendOrder?.status,  // ✅ BLOCKCHAIN STATUS takes priority
          riskScore,
          createdAt: new Date(Number(e.timestampMs)).toISOString().split('T')[0],
          txDigest: e.id?.txDigest ?? '',
          merchantWallet: e.parsedJson?.merchant ?? '',
          deliveryInfo: backendOrder?.delivery_info || product?.deliveryInfo || null,
        };
      });

    const sorted = myOrders.sort((a: any, b: any) => b.id - a.id);

    // Automatic sync: if blockchain shows COMPLETED but backend still PENDING, ask backend to sync
    try {
      sorted.forEach(async (o: any) => {
        const backend = backendOrdersById.get(Number(o.id));
        if (o.status === 'COMPLETED' && backend && backend.status !== 'COMPLETED') {
          fetch(`${API}/api/orders/sync-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: o.id, status: 'COMPLETED', wallet: walletAddress }),
          }).catch(err => console.warn('Auto-sync failed:', err));
        }
      });
    } catch (e) {
      // ignore
    }

    return sorted;
  } catch (err: any) {
    console.error("fetchBuyerOrders error:", err.message || err);
    // Return empty array as fallback - user can still see UI without errors
    return [];
  }
}

export async function fetchBuyerStats(walletAddress: string) {
  if (!walletAddress) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const res = await fetch(`${API}/api/buyer/stats/${walletAddress}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      console.warn(`Stats fetch returned ${res.status}: ${res.statusText}`);
      return null;
    }
    return res.json();
  } catch (err: any) {
    console.warn("fetchBuyerStats error:", err.message || err);
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
    const query = (type: string) => fetch('https://fullnode.testnet.sui.io:443', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'suix_queryEvents',
        params: [{ MoveEventType: `${SUI_CONFIG.PACKAGE_ID}::events::${type}` }, null, 50, true]
      })
    }).then(r => r.json()).then(d => d?.result?.data ?? []);

    const [created, completed, disputed, resolved, riskSet] = await Promise.all([
      query('OrderCreated'),
      query('OrderCompleted'),
      query('OrderDisputed'),
      query('DisputeResolved'),
      query('RiskScoreSet'),
    ]);

    const allProducts = await fetchProducts().catch(() => []);

    const merchantOrders = created
      .filter((e: any) => e.parsedJson?.merchant === merchantWallet)
      .map((e: any) => {
        const orderId = e.parsedJson?.order_id;
        const productId = e.parsedJson?.product_id;
        
        let status = 'PENDING';
        if (completed.some((ev: any) => ev.parsedJson?.order_id === orderId)) status = 'COMPLETED';
        else if (disputed.some((ev: any) => ev.parsedJson?.order_id === orderId)) {
          const resEv = resolved.find((ev: any) => ev.parsedJson?.order_id === orderId);
          if (resEv) {
            status = resEv.parsedJson?.favor_buyer ? 'REFUNDED' : 'ESCROW_RELEASED';
          } else {
            status = 'DISPUTED';
          }
        }

        const riskEv = riskSet.find((ev: any) => ev.parsedJson?.order_id === orderId);
        const riskScore = riskEv ? Number(riskEv.parsedJson?.score) : null;
        const product = allProducts.find((p: any) => String(p.id) === String(productId));

        return {
          id: Number(orderId),
          productId: Number(productId),
          productName: product?.name || `Order #${orderId}`,
          amountUsdc: Number(e.parsedJson?.amount ?? 0) / 1_000_000,
          status,
          riskScore,
          buyerWallet: e.parsedJson?.buyer ?? '',
          createdAt: new Date(Number(e.timestampMs)).toISOString().split('T')[0],
          txDigest: e.id?.txDigest ?? '',
        };
      });

    return merchantOrders.sort((a: any, b: any) => b.id - a.id);
  } catch (err) {
    console.error("fetchMerchantOrders error:", err);
    return [];
  }
}

export async function getBuyerReputation(wallet: string) {
  try {
    const res = await fetch('https://fullnode.testnet.sui.io:443', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sui_devInspectTransactionBlock',
        params: [
          wallet,
          {
            kind: 'programmableTransaction',
            inputs: [
              { kind: 'Input', index: 0, value: SUI_CONFIG.REP_MANAGER, type: 'object' },
              { kind: 'Input', index: 1, value: wallet, type: 'pure' }
            ],
            commands: [
              {
                kind: 'MoveCall',
                target: `${SUI_CONFIG.PACKAGE_ID}::reputation_manager::get_buyer_xp`,
                arguments: [{ kind: 'Input', index: 0 }, { kind: 'Input', index: 1 }]
              }
            ]
          }
        ]
      })
    });
    const data = await res.json();
    // Simplified parsing for demo
    return { xp: 0, tier: 'Bronze' }; 
  } catch {
    return { xp: 0, tier: 'Bronze' };
  }
}