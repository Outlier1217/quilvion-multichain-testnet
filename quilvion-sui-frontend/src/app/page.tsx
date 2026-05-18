'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import {
  ShoppingBag, Search, Star, Shield, Zap,
  X, AlertTriangle, CheckCircle,
  MessageSquare, Package
} from 'lucide-react';
import { PRODUCTS, CATEGORIES, type Product } from '@/lib/products';
import { getRiskScore, getFraudExplanation, buyerChat, fetchProducts } from '@/lib/api';
import { buildCreateOrder, buildRaiseDispute, buildReleaseEscrow } from '@/lib/sui/transactions';
import { SUI_CONFIG } from '@/lib/sui/constants';
import { BuyerChat } from '@/components/BuyerChat';
import { OrderCard } from '@/components/OrderCard';
import { BuyModal } from '@/components/BuyModal';
import { MintUsdc } from '@/components/MintUsdc';
import { fetchBuyerOrders } from '@/lib/api';


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
  const [txSuccess, setTxSuccess] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>(PRODUCTS);
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const walletAddress = account?.address ?? '';

  useEffect(() => {
    fetchProducts(category).then(setProducts).catch(() => {
      setProducts(PRODUCTS);
    });
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
          onSuccess: (result) => {
            setTxSuccess(`Order placed! Digest: ${result.digest.slice(0, 16)}...`);
            setBuyingProduct(null);
            setTxLoading(false);
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
    setTxLoading(true);
    try {
      const tx = new Transaction();
      buildRaiseDispute(tx, orderId);
      signAndExecute(
        { transaction: tx },
        {
          onSuccess: () => { setTxSuccess(`Dispute raised for order #${orderId}`); setTxLoading(false); },
          onError: (err) => { setTxError(err.message); setTxLoading(false); },
        }
      );
    } catch (err: any) {
      setTxError(err.message);
      setTxLoading(false);
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

          <ConnectButton />
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
          </motion.div>
        )}

        {/* ── ORDERS TAB ── */}
        {account && tab === 'orders' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
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
              <div className="space-y-3">
                {orders.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onDispute={() => handleDispute(order.id)}
                    onRelease={handleReleaseEscrow}
                    loading={txLoading}
                    // releasingOrderId={releasingOrderId}
                  />
                ))}
              </div>
            )}
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

      {account && <div className="h-14" />}
    </div>
  );
}