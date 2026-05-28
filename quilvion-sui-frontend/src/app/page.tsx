'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import {
  ShoppingBag, Search, Star, Shield, Zap,
  X, AlertTriangle, CheckCircle, Loader2,
  MessageSquare, Package
} from 'lucide-react';
import { PRODUCTS, CATEGORIES, type Product } from '@/lib/products';
import { getRiskScore, getFraudExplanation, buyerChat, fetchProducts, createOrderRecord, getOrderCreatedEventByDigest, fetchBuyerOrders, fetchBuyerStats } from '@/lib/api';
import { buildCreateOrder, buildRaiseDispute, buildReleaseEscrow } from '@/lib/sui/transactions';
import { SUI_CONFIG } from '@/lib/sui/constants';
import { BuyerChat } from '@/components/BuyerChat';
import { OrderCard } from '@/components/OrderCard';
import { BuyModal } from '@/components/BuyModal';
import { MintUsdc } from '@/components/MintUsdc';
import { BuyerProfileCard } from '@/components/BuyerProfileCard';
import { ProtocolConfigCard } from '@/components/ProtocolConfigCard';
import { OrderInfoGuide } from '@/components/OrderInfoGuide';


// ── Image Gallery Component ────────────────────────────────────────────────────
function ImageGallery({ images, name }: { images: string[]; name: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  return (
    <div className="space-y-2">
      <div className="w-full h-52 rounded-2xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.04)' }}>
        <img
          src={images[activeIndex]}
          alt={`${name} - view ${activeIndex + 1}`}
          className="w-full h-full object-cover transition-all duration-300"
        />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setActiveIndex(i)}
              className="flex-shrink-0 transition-all duration-200 hover:opacity-90"
              style={{
                width: 56, height: 56,
                borderRadius: 10,
                overflow: 'hidden',
                border: i === activeIndex ? '2px solid #4DA2FF' : '1px solid rgba(255,255,255,0.1)',
                transform: i === activeIndex ? 'scale(1.05)' : 'scale(1)',
              }}>
              <img src={img} alt={`View ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function BuyerDashboard() {
  const account = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  const [tab, setTab] = useState<'browse' | 'orders' | 'chat'>('browse');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [buyingProduct, setBuyingProduct] = useState<Product | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [releasingOrderId, setReleasingOrderId] = useState<number | null>(null);
  const [disputingOrderId, setDisputingOrderId] = useState<number | null>(null);
  const [txSuccess, setTxSuccess] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [buyerStats, setBuyerStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const walletAddress = account?.address ?? '';

  // Fetch buyer stats
  useEffect(() => {
    if (account?.address && tab === 'orders') {
      setStatsLoading(true);
      fetchBuyerStats(account.address)
        .then(setBuyerStats)
        .catch(err => {
          console.error("Failed to fetch buyer stats:", err);
          setBuyerStats(null);
        })
        .finally(() => setStatsLoading(false));
    }
  }, [account?.address, tab]);

  // Fetch products on mount and when category changes
  useEffect(() => {
    setProductsLoading(true);
    fetchProducts(category)
      .then(setProducts)
      .catch(err => {
        console.error("Failed to fetch products:", err);
        setProducts([]);
      })
      .finally(() => setProductsLoading(false));
  }, [category]);

    // Fetch real orders
  useEffect(() => {
    if (account?.address && tab === 'orders') {
      setOrdersLoading(true);
      fetchBuyerOrders(account.address)
        .then(setOrders)
        .catch(err => {
          console.error("Failed to fetch orders:", err);
          setOrders([]);
        })
        .finally(() => setOrdersLoading(false));
    }
  }, [account?.address, tab]);

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
                        p.tags.some((t: string) => t.toLowerCase().includes(search.toLowerCase()));
    const matchCat = category === 'All' || p.category === category;
    return matchSearch && matchCat;
  });

  const handleBuy = async (product: Product, usdcCoinId: string) => {
    if (!account) return;
    setTxLoading(true);
    setTxError(null);
    try {
      const tx = new Transaction();
      buildCreateOrder(tx, product.id, product.merchantWallet, product.priceUsdc, usdcCoinId);
      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async (result) => {
            try {
              const createdEvent = (result as any)?.events?.find((event: any) =>
                String(event?.type || '').includes('OrderCreated') && event?.parsedJson?.order_id !== undefined
              ) ?? await getOrderCreatedEventByDigest(result.digest);

              const orderId = Number(createdEvent?.parsedJson?.order_id);
              if (!orderId) {
                throw new Error('Could not read the new order id from the transaction');
              }

              await createOrderRecord({
                id: orderId,
                buyer_wallet: account.address,
                merchant_wallet: product.merchantWallet,
                product_id: product.id,
                product_name: product.name,
                amount_usdc: product.priceUsdc,
                status: 'PENDING',
                tx_digest: result.digest,
                risk_score: null,
                delivery_info: product.deliveryInfo ?? null,
              });

              if (account?.address) {
                fetchBuyerOrders(account.address).then(setOrders);
              }

              setTxSuccess(`Order placed and saved! Order #${orderId}`);
              setBuyingProduct(null);
            } catch (syncErr: any) {
              console.error('Failed to persist order record:', syncErr);
              setTxError(syncErr.message || 'Order created on-chain, but failed to save in database');
            } finally {
              setTxLoading(false);
            }
          },
          onError: (err) => {
            setTxError(err.message);
            setTxLoading(false);
          },
        }
      );
    } catch (err: any) {
      setTxError(err.message);
      setTxLoading(false);
    }
  };

  const handleDispute = async (orderId: number) => {
    if (!account) return;
    setDisputingOrderId(orderId);
    setTxLoading(true);
    setTxError(null);
    try {
      const tx = new Transaction();
      buildRaiseDispute(tx, orderId);
      signAndExecute(
        { transaction: tx },
        {
          onSuccess: () => { setTxSuccess(`Dispute raised for order #${orderId}`); setTxLoading(false); setDisputingOrderId(null); },
          onError: (err) => { setTxError(err.message); setTxLoading(false); setDisputingOrderId(null); },
        }
      );
    } catch (err: any) {
      setTxError(err.message);
      setTxLoading(false);
      setDisputingOrderId(null);
    }
  };

  const handleReleaseEscrow = async (orderId: number) => {
    if (!account) return;
    
    setTxLoading(true);
    setTxError(null);

    try {
      const tx = new Transaction();
      buildReleaseEscrow(tx, orderId);

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: (result) => {
            setTxSuccess(`✅ Escrow Released Successfully! Order #${orderId}`);
            setTxLoading(false);
            
            // Refresh orders
            if (account?.address) {
              fetchBuyerOrders(account.address).then(setOrders);
            }
          },
          onError: (err: any) => {
            console.error("Release Error:", err);
            
            let message = err.message || "Failed to release escrow";
            
            if (message.includes("abort code: 8")) {
              message = "❌ You can only release orders you purchased and that are still in PENDING status.";
            } else if (message.includes("abort code")) {
              message = `Contract Error (Code ${message.match(/\d+/)?.[0] || '?'}) - Check order status`;
            }
            
            setTxError(message);
            setTxLoading(false);
          },
        }
      );
    } catch (err: any) {
      setTxError(err.message || "Transaction failed");
      setTxLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: '#05050f', color: '#fff', fontFamily: 'var(--font-body)' }}>

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-40 border-b border-white/5 backdrop-blur-xl"
        style={{ background: 'rgba(5,5,15,0.85)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Quilvion" className="w-8 h-8 rounded-lg object-contain" />
            <span className="font-bold text-sm hidden sm:block" style={{ fontFamily: 'var(--font-display)' }}>
              Quilvion <span className="text-white/30">· Sui</span>
            </span>
            {account && (
              <a href="/buyer/profile"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80"
                style={{ background: 'rgba(107,114,255,0.08)', color: 'rgba(107,114,255,0.7)', border: '1px solid rgba(107,114,255,0.15)' }}>
                👤 Profile
              </a>
            )}
            <a href="/merchant"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80"
              style={{ background: 'rgba(77,162,255,0.08)', color: 'rgba(77,162,255,0.7)', border: '1px solid rgba(77,162,255,0.15)' }}>
              🏪 Merchant Portal
            </a>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl border border-white/5"
            style={{ background: 'rgba(255,255,255,0.03)' }}>
            {([
              { id: 'browse', icon: ShoppingBag, label: 'Shop' },
              { id: 'orders', icon: Package, label: 'Orders' },
              { id: 'chat',   icon: MessageSquare, label: 'AI Help' },
            ] as const).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
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

          <div className="flex items-center gap-2">
            {account && <MintUsdc />}
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
              {txSuccess ? <CheckCircle size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                         : <AlertTriangle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />}
              <p className="text-sm text-white/80">{txSuccess || txError}</p>
              <button onClick={() => { setTxSuccess(null); setTxError(null); }}
                className="ml-auto text-white/30 hover:text-white/60">
                <X size={13} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="max-w-7xl mx-auto px-6 py-8">

        {/* ── NOT CONNECTED ── */}
        {!account && (
          <motion.div className="flex flex-col items-center justify-center py-24 text-center"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="text-6xl mb-4">🔌</div>
            <h2 className="text-2xl font-black mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              Connect Your Wallet
            </h2>
            <p className="text-white/40 mb-6 max-w-sm">
              Connect your Slush wallet to browse products, make purchases, and track your orders on Sui.
            </p>
            <ConnectButton />
          </motion.div>
        )}

        {/* ── BROWSE TAB ── */}
        {account && tab === 'browse' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Mint USDC Widget */}
            <div className="mb-8">
              <MintUsdc />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
              {[
                { label: 'Products', value: products.length, icon: ShoppingBag, color: '#4DA2FF' },
                { label: 'Escrow Protected', value: '100%', icon: Shield, color: '#10b981' },
                { label: 'Avg Rating', value: '4.8★', icon: Star, color: '#f59e0b' },
                { label: 'Chain', value: 'Sui', icon: Zap, color: '#AB9FF2' },
              ].map((s, i) => (
                <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="p-4 rounded-2xl border border-white/5"
                  style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <s.icon size={15} style={{ color: s.color }} className="mb-2" />
                  <div className="text-xl font-black" style={{ fontFamily: 'var(--font-display)', color: s.color }}>
                    {s.value}
                  </div>
                  <div className="text-xs text-white/35 mt-0.5">{s.label}</div>
                </motion.div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search products, tags..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-white/8 text-sm outline-none transition-all"
                  style={{ background: 'rgba(255,255,255,0.04)', color: '#fff' }}
                />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => setCategory(cat)}
                    className="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                    style={{
                      background: category === cat ? 'rgba(77,162,255,0.15)' : 'rgba(255,255,255,0.04)',
                      color: category === cat ? '#4DA2FF' : 'rgba(255,255,255,0.4)',
                      border: `1px solid ${category === cat ? 'rgba(77,162,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    }}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {productsLoading ? (
              <div className="flex items-center justify-center py-16 text-white/50">
                <Loader2 size={20} className="animate-spin mr-2" />
                <span>Loading products...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <ShoppingBag size={48} className="mx-auto mb-4 opacity-30" />
                <p className="text-white/40 text-lg">No products found</p>
                <p className="text-white/20 text-sm mt-2">Try adjusting your search or filters</p>
              </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((product, i) => (
                <motion.div key={product.id}
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className="group relative p-5 rounded-2xl border border-white/5 hover:border-white/15 transition-all cursor-pointer"
                  style={{ background: 'rgba(255,255,255,0.02)' }}
                  onClick={() => setSelectedProduct(product)}
                  whileHover={{ y: -3 }}>

                  <div className="w-full h-44 rounded-2xl overflow-hidden relative mb-4 border border-white/5"
                    style={{ background: 'rgba(255,255,255,0.03)' }}>
                    {product.images && product.images.length > 0 ? (
                      <img 
                        src={product.images[0]} 
                        alt={product.name} 
                        className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500" 
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-6xl">
                        {product.emoji}
                      </div>
                    )}
                  </div>

                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-white/30 uppercase tracking-wider">{product.category}</span>
                      <h3 className="font-bold text-white text-sm mt-0.5 line-clamp-2">{product.name}</h3>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-black text-white text-sm" style={{ fontFamily: 'var(--font-display)' }}>
                        ${product.priceUsdc}
                      </div>
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

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Star size={11} className="text-yellow-400 fill-yellow-400" />
                      <span className="text-xs text-white/50">{product.rating}</span>
                      <span className="text-xs text-white/25">({product.reviewCount})</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: '#10b981' }}>
                      <Shield size={10} />
                      <span>Escrow</span>
                    </div>
                  </div>

                  <motion.button
                    onClick={e => { e.stopPropagation(); setBuyingProduct(product); }}
                    className="mt-4 w-full py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95"
                    style={{ 
                      background: 'linear-gradient(135deg,#4DA2FF,#6366f1)',
                      boxShadow: '0 4px 15px rgba(77, 162, 255, 0.3)'
                    }}
                    whileTap={{ scale: 0.97 }}>
                    Buy Now · ${product.priceUsdc} USDC
                  </motion.button>
                </motion.div>
              ))}
            </div>
            )}
          </motion.div>
        )}

        {/* ── ORDERS TAB ── */}
        {account && tab === 'orders' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
            {/* Buyer Profile Stats */}
            {statsLoading ? (
              <div className="text-center py-4 text-white/50">Loading your stats...</div>
            ) : buyerStats ? (
              <BuyerProfileCard stats={buyerStats} />
            ) : null}

            {/* Orders */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-black" style={{ fontFamily: 'var(--font-display)' }}>
                  My Orders
                </h2>
                {ordersLoading && <div className="text-sm text-white/50">Loading orders...</div>}
              </div>

              {orders.length === 0 ? (
                <div className="text-center py-20 text-white/30">
                  <Package size={48} className="mx-auto mb-4 opacity-40" />
                  <p className="text-lg">No orders yet</p>
                  <p className="text-sm mt-2">Your on-chain orders will appear here</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map(order => (
                    <div key={order.id} className="space-y-3">
                      <OrderCard
                        order={order}
                        onDispute={() => handleDispute(order.id)}
                        onRelease={handleReleaseEscrow}
                        loading={txLoading && disputingOrderId === order.id}
                      />
                      <OrderInfoGuide orderInfo={{
                        status: order.status,
                        createdAt: order.createdAt,
                        amount: (order.amountUsdc * 1_000_000),
                        fee: Math.round((order.amountUsdc * 1_000_000) * 250 / 10_000),
                        riskScore: order.riskScore,
                      }} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Protocol Configuration */}
            <ProtocolConfigCard />
          </motion.div>
        )}

        {/* ── CHAT TAB ── */}
        {account && tab === 'chat' && (
          <BuyerChat walletAddress={walletAddress} />
        )}
      </main>

      {/* ── PRODUCT DETAIL MODAL ── */}
      <AnimatePresence>
        {selectedProduct && (
          <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setSelectedProduct(null)} />
            <motion.div className="relative w-full max-w-lg rounded-3xl border border-white/10 overflow-hidden"
              style={{ background: '#0d1020' }}
              initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}>

              {/* Header */}
              <div className="p-6 border-b border-white/5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center text-3xl flex-shrink-0"
                      style={{ background: 'rgba(255,255,255,0.05)' }}>
                      {selectedProduct.images && selectedProduct.images.length > 0
                        ? <img src={selectedProduct.images[0]} alt={selectedProduct.name} className="w-full h-full object-cover" />
                        : selectedProduct.emoji
                      }
                    </div>
                    <div>
                      <span className="text-xs text-white/30 uppercase tracking-wider">{selectedProduct.category}</span>
                      <h3 className="font-bold text-white text-base mt-0.5">{selectedProduct.name}</h3>
                    </div>
                  </div>
                  <button onClick={() => setSelectedProduct(null)}
                    className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
                    <X size={14} className="text-white/60" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">

                {/* ── Clickable image gallery ── */}
                {selectedProduct.images && selectedProduct.images.length > 0 && (
                  <ImageGallery images={selectedProduct.images} name={selectedProduct.name} />
                )}

                <p className="text-sm text-white/60 leading-relaxed">{selectedProduct.description}</p>

                <div className="flex flex-wrap gap-2">
                  {selectedProduct.tags.map(tag => (
                    <span key={tag} className="text-xs px-2 py-1 rounded-full"
                      style={{ background: 'rgba(77,162,255,0.1)', color: '#4DA2FF' }}>
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="p-3 rounded-xl border border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-center justify-between text-xs text-white/40 mb-2">
                    <span>Merchant</span>
                    <span style={{ color: '#10b981' }}>✓ Verified</span>
                  </div>
                  <div className="font-semibold text-white text-sm">{selectedProduct.merchantName}</div>
                  <div className="flex gap-4 mt-1 text-xs text-white/35">
                    <span>{selectedProduct.merchantOrders} orders</span>
                    <span>{(selectedProduct.merchantSuccessRate * 100).toFixed(0)}% success</span>
                    <span>
                      <Star size={10} className="inline text-yellow-400 fill-yellow-400 mr-0.5" />
                      {selectedProduct.rating}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-black" style={{ fontFamily: 'var(--font-display)' }}>
                      ${selectedProduct.priceUsdc} USDC
                    </div>
                    <div className="text-xs text-white/35 mt-0.5 flex items-center gap-1">
                      <Shield size={10} className="text-emerald-400" />
                      {selectedProduct.priceUsdc >= SUI_CONFIG.ADMIN_THRESHOLD_USDC
                        ? 'Held in escrow until delivery'
                        : 'Auto-completes on purchase'}
                    </div>
                  </div>
                  <button
                    onClick={() => { setBuyingProduct(selectedProduct); setSelectedProduct(null); }}
                    className="px-6 py-3 rounded-xl font-bold text-sm transition-all hover:scale-105"
                    style={{ background: 'linear-gradient(135deg,#4DA2FF,#6366f1)' }}>
                    Buy Now
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {buyingProduct && (
          <BuyModal
            product={buyingProduct}
            walletAddress={walletAddress}
            onClose={() => setBuyingProduct(null)}
            onConfirm={handleBuy}
            loading={txLoading}
          />
        )}
      </AnimatePresence>

      {account && (
        <footer className="relative z-10 px-6 md:px-12 py-8 border-t border-white/5"
          style={{ background: 'rgba(5,5,15,0.95)' }}>
          <div className="max-w-7xl mx-auto">
            {/* Top row */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-6">
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

              {/* Social Links */}
              <div className="flex items-center gap-4 text-xs text-white/30">
                <a
                  href="https://www.linkedin.com/in/mustak1217/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white/70 transition-colors flex items-center gap-1"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                  LinkedIn
                </a>
                <a
                  href="https://github.com/Outlier1217/quilvion-multichain-testnet"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white/70 transition-colors flex items-center gap-1"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                  </svg>
                  GitHub
                </a>
                <a
                  href="https://www.youtube.com/@Outlier1217"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white/70 transition-colors flex items-center gap-1"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                  YouTube
                </a>
                <a
                  href="https://x.com/Mustak1217"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white/70 transition-colors flex items-center gap-1"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.6l-5.165-6.751-5.913 6.751h-3.31l7.73-8.835L.456 2.25h6.756l4.888 6.469L17.538 2.25h.706zm-1.161 17.52h1.833L7.084 4.126H5.117l12.926 15.644z"/>
                  </svg>
                  Twitter
                </a>
              </div>
            </div>

            {/* Bottom row */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-2 pt-6 border-t border-white/5">
              <p className="text-xs text-white/25">
                © 2026 Quilvion · Sui. All transactions secured by on-chain escrow. Powered by Blockchain.
              </p>
              <p className="text-xs text-white/20">
                Developed by{' '}
                <a
                  href="https://www.linkedin.com/in/mustak1217/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/35 hover:text-white/60 transition-colors"
                >
                  Mustak Aalam
                </a>
              </p>
            </div>
          </div>
        </footer>
      )}

      {account && <div className="h-14" />}
    </div>
  );
}