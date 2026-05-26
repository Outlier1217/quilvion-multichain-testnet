'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import {
  Store, ShoppingBag, Package, Plus, Star, Shield,
  Zap, TrendingUp, X, CheckCircle, AlertTriangle,
  ChevronRight, Loader2, Eye, BarChart3
} from 'lucide-react';
import { PRODUCTS, CATEGORIES, type Product } from '@/lib/products';
import { MintUsdc } from '@/components/MintUsdc';
import { MerchantOnboard, type MerchantData } from '@/components/MerchantOnboard';
import { MerchantProductForm, type MerchantProduct } from '@/components/MerchantProductForm';
import { MerchantStats } from '@/components/MerchantStats';
import { SUI_CONFIG } from '@/lib/sui/constants';
import { registerMerchant, getMerchantProfile, addProduct, fetchMerchantProducts, editProduct, fetchMerchantOrders } from '@/lib/api';
import { buildDeliverDigitalProduct } from '@/lib/sui/transactions';
import { useEffect } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────
type MerchantStatus = 'none' | 'pending' | 'approved';
type MerchantTab = 'browse' | 'dashboard' | 'products';

interface LocalProduct extends MerchantProduct {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  reviewCount: number;
  rating: number;
}

// ── Dummy merchant orders ──────────────────────────────────────────────────────
const DUMMY_MERCHANT_ORDERS = [
  { id: 201, productName: 'Web3 Dev Bootcamp', amountUsdc: 89, status: 'COMPLETED', createdAt: '2025-05-01', buyerWallet: '0xabc123...7890' },
  { id: 202, productName: 'DeFi Dashboard Template', amountUsdc: 149, status: 'PENDING', createdAt: '2025-05-03', buyerWallet: '0xdef456...1234' },
  { id: 203, productName: 'Smart Contract Audit', amountUsdc: 299, status: 'COMPLETED', createdAt: '2025-05-05', buyerWallet: '0x9ab321...5678' },
];


export default function MerchantDashboard() {
  const account = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  const [tab, setTab] = useState<MerchantTab>('browse');
  const [merchantStatus, setMerchantStatus] = useState<MerchantStatus>('none');
  const [merchantData, setMerchantData] = useState<MerchantData | null>(null);
  const [showOnboard, setShowOnboard] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [onboardLoading, setOnboardLoading] = useState(false);
  const [productLoading, setProductLoading] = useState(false);
  const [myProducts, setMyProducts] = useState<LocalProduct[]>([]);
  const [merchantOrders, setMerchantOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [txSuccess, setTxSuccess] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<LocalProduct | null>(null);

  const walletAddress = account?.address ?? '';

  // Simulate onboarding submit (replace with real API/tx later)
  const loadMerchantData = async () => {
    if (!account?.address) return;
    try {
      const data = await getMerchantProfile(account.address);
      if (!data) return;
      setMerchantStatus(data.status as MerchantStatus);
      setMerchantData({
        companyName: data.company_name,
        description: data.description,
        website: data.website || "",
        category: data.category,
        contactEmail: data.contact_email,
      });
      
      const [products, orders] = await Promise.all([
        fetchMerchantProducts(account.address),
        fetchMerchantOrders(account.address)
      ]);

      setMyProducts(products.map((p: any) => ({
        ...p,
        priceUsdc: p.price_usdc,
        deliveryInfo: p.delivery_info,
        submittedAt: p.created_at?.split("T")[0] ?? "",
      })));
      setMerchantOrders(orders);
    } catch (err) {}
  };

  useEffect(() => {
    loadMerchantData();
  }, [account?.address]);

  // handleOnboardSubmit replace karo
  const handleOnboardSubmit = async (data: MerchantData) => {
    setOnboardLoading(true);
    try {
      await registerMerchant({
        wallet_address: walletAddress,
        company_name: data.companyName,
        description: data.description,
        website: data.website,
        category: data.category,
        contact_email: data.contactEmail,
      });
      setMerchantData(data);
      setMerchantStatus('approved');
      setShowOnboard(false);
      setTab('dashboard');
      setTxSuccess(`Welcome, ${data.companyName}! Merchant account live hai.`);
    } catch (e: any) {
      setTxError(e.message);
    } finally {
      setOnboardLoading(false);
    }
  };

  const handleEditSubmit = async (product: MerchantProduct) => {
  if (!editingProduct?.id) return;
  setProductLoading(true);
  try {
    await editProduct(Number(editingProduct.id), {
      merchant_wallet: walletAddress,
      name: product.name,
      description: product.description,
      price_usdc: product.priceUsdc,
      category: product.category,
      emoji: product.emoji,
      tags: product.tags,
      images: product.images || [],
      delivery_info: product.deliveryInfo,
    });
    const updated = await fetchMerchantProducts(walletAddress);
    setMyProducts(updated.map((p: any) => ({
      ...p,
      priceUsdc: p.price_usdc,
      deliveryInfo: p.delivery_info,
      submittedAt: p.created_at?.split("T")[0] ?? "",
    })));
    setEditingProduct(null);
    setTxSuccess(`"${product.name}" updated!`);
  } catch (e: any) {
    setTxError(e.message);
  } finally {
    setProductLoading(false);
  }
};

  // handleProductSubmit replace karo
  const handleProductSubmit = async (product: MerchantProduct) => {
    setProductLoading(true);
    try {
      await addProduct({
        merchant_wallet: walletAddress,
        name: product.name,
        description: product.description,
        price_usdc: product.priceUsdc,
        category: product.category,
        emoji: product.emoji,
        tags: product.tags,
        images: product.images || [],
        delivery_info: product.deliveryInfo,
      });
      const updated = await fetchMerchantProducts(walletAddress);
      setMyProducts(updated.map((p: any) => ({
        ...p,
        priceUsdc: p.price_usdc,
        deliveryInfo: p.delivery_info,
        submittedAt: p.created_at?.split("T")[0] ?? "",
      })));
      setShowProductForm(false);
      setTxSuccess(`"${product.name}" live hai marketplace pe!`);
    } catch (e: any) {
      setTxError(e.message);
    } finally {
      setProductLoading(false);
    }
  };

  const handleDeliver = async (orderId: number) => {
    if (!account) return;
    setOrdersLoading(true);
    try {
      const tx = new Transaction();
      // Use a dummy hash for demo
      buildDeliverDigitalProduct(tx, orderId, "ipfs://QmDummyHash" + orderId);
      signAndExecute(
        { transaction: tx },
        {
          onSuccess: () => {
            setTxSuccess(`Order #${orderId} marked as delivered!`);
            loadMerchantData();
            setOrdersLoading(false);
          },
          onError: (err) => {
            setTxError(err.message);
            setOrdersLoading(false);
          }
        }
      );
    } catch (err: any) {
      setTxError(err.message);
      setOrdersLoading(false);
    }
  };

  const clearToast = () => { setTxSuccess(null); setTxError(null); };

  return (
    <div className="min-h-screen" style={{ background: '#05050f', color: '#fff', fontFamily: 'var(--font-body)' }}>

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-40 border-b border-white/5 backdrop-blur-xl"
        style={{ background: 'rgba(5,5,15,0.85)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">

          {/* Logo + nav back to buyer */}
          <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Quilvion" className="w-8 h-8 rounded-lg object-contain" />
            <span className="font-bold text-sm hidden sm:block" style={{ fontFamily: 'var(--font-display)' }}>
              Quilvion <span className="text-white/30">· Merchant</span>
            </span>
          </div>

            <a href="/"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>
              ← Buyer Shop
            </a>

          {/* Tabs — only show dashboard/products if merchant */}
          <div className="flex items-center gap-1 p-1 rounded-xl border border-white/5"
            style={{ background: 'rgba(255,255,255,0.03)' }}>
            {([
              { id: 'browse', icon: ShoppingBag, label: 'Browse' },
              ...(merchantStatus === 'approved' ? [
                { id: 'dashboard', icon: BarChart3, label: 'Dashboard' },
                { id: 'products', icon: Package, label: 'My Products' },
              ] : []),
            ] as const).map(t => (
              <button key={t.id} onClick={() => setTab(t.id as MerchantTab)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: tab === t.id ? 'rgba(77,162,255,0.15)' : 'transparent',
                  color: tab === t.id ? '#4DA2FF' : 'rgba(255,255,255,0.4)',
                }}>
                <t.icon size={13} />
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {/* Be a Merchant CTA */}
            {account && merchantStatus === 'none' && (
              <button onClick={() => setShowOnboard(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all hover:scale-105"
                style={{ background: 'linear-gradient(135deg,#4DA2FF,#6366f1)' }}>
                <Store size={12} /> Be a Merchant
              </button>
            )}
            {merchantStatus === 'pending' && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                Under Review
              </span>
            )}
            {merchantStatus === 'approved' && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>
                <CheckCircle size={11} /> Verified Merchant
              </span>
            )}
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* ── TOAST ── */}
      <AnimatePresence>
        {(txSuccess || txError) && (
          <motion.div className="fixed top-20 right-6 z-50 max-w-sm"
            initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}>
            <div className="flex items-start gap-3 p-4 rounded-2xl border"
              style={{
                background: txSuccess ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                borderColor: txSuccess ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)',
              }}>
              {txSuccess
                ? <CheckCircle size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                : <AlertTriangle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />}
              <p className="text-sm text-white/80">{txSuccess || txError}</p>
              <button onClick={clearToast} className="ml-auto text-white/30 hover:text-white/60">
                <X size={13} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="max-w-7xl mx-auto px-6 py-8 pb-24">

        {/* ── NOT CONNECTED ── */}
        {!account && (
          <motion.div className="flex flex-col items-center justify-center py-24 text-center"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="text-6xl mb-4">🏪</div>
            <h2 className="text-2xl font-black mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              Merchant Portal
            </h2>
            <p className="text-white/40 mb-6 max-w-sm">
              Connect your wallet to browse products or apply to sell on Quilvion.
            </p>
            <ConnectButton />
          </motion.div>
        )}

        {/* ── BROWSE TAB ── */}
        {account && tab === 'browse' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

            {/* CTA banner if not merchant yet */}
            {merchantStatus === 'none' && (
              <motion.div
                initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                className="mb-8 p-5 rounded-2xl border border-white/8 flex flex-col sm:flex-row items-center gap-4 justify-between"
                style={{ background: 'linear-gradient(135deg, rgba(77,162,255,0.06), rgba(99,102,241,0.06))' }}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                    style={{ background: 'rgba(77,162,255,0.1)' }}>🚀</div>
                  <div>
                    <h3 className="font-bold text-white text-sm">Want to sell on Quilvion?</h3>
                    <p className="text-xs text-white/40 mt-0.5">List your digital products with escrow protection on Sui</p>
                  </div>
                </div>
                <button onClick={() => setShowOnboard(true)}
                  className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all hover:scale-105"
                  style={{ background: 'linear-gradient(135deg,#4DA2FF,#6366f1)' }}>
                  <Store size={14} /> Become a Merchant <ChevronRight size={14} />
                </button>
              </motion.div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
              {[
                { label: 'Products', value: PRODUCTS.length, icon: ShoppingBag, color: '#4DA2FF' },
                { label: 'Escrow Protected', value: '100%', icon: Shield, color: '#10b981' },
                { label: 'Avg Rating', value: '4.8★', icon: Star, color: '#f59e0b' },
                { label: 'Chain', value: 'Sui', icon: Zap, color: '#AB9FF2' },
              ].map((s, i) => (
                <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="p-4 rounded-2xl border border-white/5"
                  style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <s.icon size={15} style={{ color: s.color }} className="mb-2" />
                  <div className="text-xl font-black" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-xs text-white/35 mt-0.5">{s.label}</div>
                </motion.div>
              ))}
            </div>

            {/* Product grid (view-only) */}
            <h2 className="text-base font-bold text-white/60 mb-4">All Products on Marketplace</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {PRODUCTS.map((product, i) => (
                <motion.div key={product.id}
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className="p-5 rounded-2xl border border-white/5"
                  style={{ background: 'rgba(255,255,255,0.02)' }}>

                  <div className="w-full h-24 rounded-xl flex items-center justify-center text-4xl mb-4"
                    style={{ background: 'rgba(255,255,255,0.04)' }}>
                    {product.emoji}
                  </div>

                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-white/30 uppercase tracking-wider">{product.category}</span>
                      <h3 className="font-bold text-white text-sm mt-0.5 line-clamp-2">{product.name}</h3>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-black text-white text-sm">${product.priceUsdc}</div>
                      <div className="text-xs text-white/30">USDC</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1 mb-3">
                    {product.tags.slice(0, 2).map(tag => (
                      <span key={tag} className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(77,162,255,0.1)', color: '#4DA2FF' }}>
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-xs text-white/40">
                    <div className="flex items-center gap-1">
                      <Star size={11} className="text-yellow-400 fill-yellow-400" />
                      {product.rating} ({product.reviewCount})
                    </div>
                    <div className="flex items-center gap-1" style={{ color: '#10b981' }}>
                      <Shield size={10} /> Escrow
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── DASHBOARD TAB ── */}
        {account && tab === 'dashboard' && merchantStatus === 'approved' && merchantData && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black" style={{ fontFamily: 'var(--font-display)' }}>
                Merchant Dashboard
              </h2>
            </div>
            <MerchantStats
              orders={merchantOrders}
              companyName={merchantData.companyName}
              category={merchantData.category}
              onDeliver={handleDeliver as any}
              loading={ordersLoading}
            />
          </motion.div>
        )}

        {/* ── MY PRODUCTS TAB ── */}
        {account && tab === 'products' && merchantStatus === 'approved' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black" style={{ fontFamily: 'var(--font-display)' }}>
                My Products
              </h2>
              <button onClick={() => setShowProductForm(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all hover:scale-105"
                style={{ background: 'linear-gradient(135deg,#4DA2FF,#6366f1)' }}>
                <Plus size={14} /> Add Product
              </button>
            </div>

            {myProducts.length === 0 ? (
              <motion.div className="flex flex-col items-center justify-center py-24 text-center"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <div className="text-5xl mb-4">📦</div>
                <h3 className="text-lg font-bold mb-2">No products yet</h3>
                <p className="text-white/35 text-sm mb-6 max-w-xs">
                  Add your first product and it will go live after admin review.
                </p>
                <button onClick={() => setShowProductForm(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all hover:scale-105"
                  style={{ background: 'linear-gradient(135deg,#4DA2FF,#6366f1)' }}>
                  <Plus size={14} /> Add First Product
                </button>
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {myProducts.map((product, i) => (
                  <motion.div key={product.id}
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.07 }}
                    className="p-5 rounded-2xl border border-white/5"
                    style={{ background: 'rgba(255,255,255,0.02)' }}>

                    <div className="w-full h-24 rounded-xl flex items-center justify-center text-4xl mb-4"
                      style={{ background: 'rgba(255,255,255,0.04)' }}>
                      {product.emoji}
                    </div>

                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-white/30 uppercase tracking-wider">{product.category}</span>
                        <h3 className="font-bold text-white text-sm mt-0.5 line-clamp-2">{product.name}</h3>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-black text-white text-sm">${product.priceUsdc}</div>
                        <div className="text-xs text-white/30">USDC</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1 mb-3">
                      {product.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(77,162,255,0.1)', color: '#4DA2FF' }}>
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
                        style={{
                          background: product.status === 'approved' ? 'rgba(16,185,129,0.15)' :
                                      product.status === 'pending' ? 'rgba(245,158,11,0.15)' :
                                      'rgba(239,68,68,0.15)',
                          color: product.status === 'approved' ? '#10b981' :
                                 product.status === 'pending' ? '#f59e0b' : '#ef4444',
                        }}>
                        {product.status === 'approved' ? '✓ Live' :
                         product.status === 'pending' ? '⏳ Under Review' : '✗ Rejected'}
                      </span>
                      <span className="text-xs text-white/25">{product.submittedAt}</span>
                          <button
                        onClick={() => setEditingProduct(product)}
                        className="text-xs px-2.5 py-1 rounded-lg font-semibold transition-all hover:opacity-80"
                        style={{ background: 'rgba(77,162,255,0.12)', color: '#4DA2FF' }}>
                        Edit
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </main>

      {/* ── MODALS ── */}
      <AnimatePresence>
        {showOnboard && (
          <MerchantOnboard
            walletAddress={walletAddress}
            onClose={() => setShowOnboard(false)}
            onSubmit={handleOnboardSubmit}
            loading={onboardLoading}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProductForm && merchantStatus === 'approved' && (
          <MerchantProductForm
            onClose={() => setShowProductForm(false)}
            onSubmit={handleProductSubmit}
            loading={productLoading}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
  {editingProduct && (
    <MerchantProductForm
      onClose={() => setEditingProduct(null)}
      onSubmit={handleEditSubmit}
      loading={productLoading}
      editProduct={{
        name: editingProduct.name,
        description: editingProduct.description,
        priceUsdc: editingProduct.priceUsdc,
        category: editingProduct.category,
        emoji: editingProduct.emoji,
        tags: editingProduct.tags || [],
        deliveryInfo: editingProduct.deliveryInfo,
        images: editingProduct.images || [],
        id: editingProduct.id,
      }}
    />
  )}
</AnimatePresence>

      {/* ── TESTNET FOOTER ── */}
      {account && (
        <footer className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/5 backdrop-blur-xl"
          style={{ background: 'rgba(5,5,15,0.9)' }}>
          <div className="max-w-7xl mx-auto px-6 py-2.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold"
                style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                Sui Testnet
              </span>
              <span className="text-xs text-white/20 hidden sm:block">
                Package: {SUI_CONFIG.PACKAGE_ID.slice(0, 10)}...
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/25 hidden sm:block">Need test USDC?</span>
              <MintUsdc />
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}