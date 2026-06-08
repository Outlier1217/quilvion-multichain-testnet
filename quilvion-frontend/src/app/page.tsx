'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  ShoppingBag, Shield, Zap, Globe, ChevronRight,
  Star, TrendingUp, Lock, ArrowRight, X
} from 'lucide-react';

// ── Wallet config ─────────────────────────────────────────────────────────────
const WALLETS = [
  {
    id: 'metamask',
    name: 'MetaMask',
    chain: 'Ethereum / EVM',
    chainId: 'evm',
    icon: '/icons/metamask.svg',
    emoji: '🦊',
    color: '#F6851B',
    glow: 'rgba(246,133,27,0.4)',
    desc: 'For Ethereum, Polygon & EVM chains',
    // redirect: '/evm',
    redirect: 'https://evm.quilvion.xyz',
  },
  {
    id: 'phantom',
    name: 'Phantom',
    chain: 'Solana',
    chainId: 'solana',
    icon: '/icons/phantom.svg',
    emoji: '👻',
    color: '#AB9FF2',
    glow: 'rgba(171,159,242,0.4)',
    desc: 'For Solana blockchain',
    // redirect: '/solana',
    redirect: 'http://localhost:3003',
  },
  {
    id: 'slush',
    name: 'Slush',
    chain: 'Sui',
    chainId: 'sui',
    icon: '/icons/slush.svg',
    emoji: '💧',
    color: '#4DA2FF',
    glow: 'rgba(77,162,255,0.4)',
    desc: 'For Sui blockchain',
    // redirect: '/sui',
    // redirect: 'http://localhost:3000',
    redirect: 'https://app.quilvion.xyz',
  },
  {
    id: 'petra',
    name: 'Petra',
    chain: 'Aptos',
    chainId: 'aptos',
    icon: '/icons/petra.svg',
    emoji: '🌀',
    color: '#00B4AB',
    glow: 'rgba(0,180,171,0.4)',
    desc: 'For Aptos blockchain',
    // redirect: '/aptos',
    redirect: 'http://localhost:3004',
  },
];

// ── Products ──────────────────────────────────────────────────────────────────
type ProductListing = {
  id: number;
  name: string;
  category: string;
  price_usdc: number;
  emoji: string;
  rating: number;
  review_count?: number;
  merchant_name?: string;
  merchant_orders?: number;
  merchant_success_rate?: number;
  tags?: string[];
  images?: string[];
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

const FALLBACK_PRODUCTS: ProductListing[] = [
  { id: 1, name: 'Digital Art Bundle', category: 'Digital', price_usdc: 150, rating: 4.9, review_count: 2100, emoji: '🎨' },
  { id: 2, name: 'Web3 Dev Course', category: 'Education', price_usdc: 12, rating: 4.8, review_count: 890, emoji: '📚' },
  { id: 3, name: 'DeFi Analytics Pro', category: 'Tools', price_usdc: 150, rating: 4.7, review_count: 1400, emoji: '📊' },
  { id: 4, name: 'NFT Collection Pass', category: 'NFT', price_usdc: 2, rating: 5.0, review_count: 3200, emoji: '🏆' },
  { id: 5, name: 'Smart Contract Audit', category: 'Services', price_usdc: 0.1, rating: 4.9, review_count: 340, emoji: '🔐' },
  { id: 6, name: 'Trading Signals Alpha', category: 'Finance', price_usdc: 50, rating: 4.6, review_count: 5700, emoji: '📈' },
];

const STATS = [
  { label: 'Total Volume', value: 'Launching Soon...', icon: TrendingUp },
  { label: 'Active Users', value: 'Launching Soon...', icon: Globe },
  { label: 'Chains Supported', value: '4', icon: Zap },
  { label: 'Secured by Escrow', value: '100%', icon: Lock },
];

// ── Components ────────────────────────────────────────────────────────────────
function FloatingOrb({ x, y, size, color, delay }: { x: string; y: string; size: number; color: string; delay: number }) {
  return (
    <motion.div
      className="absolute rounded-full blur-3xl pointer-events-none"
      style={{ left: x, top: y, width: size, height: size, background: color, opacity: 0.12 }}
      animate={{ y: [0, -30, 0], x: [0, 15, 0], scale: [1, 1.1, 1] }}
      transition={{ duration: 8 + delay, repeat: Infinity, ease: 'easeInOut', delay }}
    />
  );
}

// ── Blockchain Selector Modal ─────────────────────────────────────────────────
function BlockchainModal({ onClose, onSelect }: { onClose: () => void; onSelect: (wallet: typeof WALLETS[0]) => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      />

      {/* Modal */}
      <motion.div
        className="relative w-full max-w-lg rounded-3xl border border-white/10 overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0a0a1a 0%, #0d1224 100%)' }}
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div>
            <h2 className="text-xl font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>
              Select Blockchain
            </h2>
            <p className="text-sm text-white/50 mt-0.5">Choose your chain to connect wallet & shop</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <X size={14} className="text-white/60" />
          </button>
        </div>

        {/* Chain options */}
        <div className="p-4 space-y-2">
          {WALLETS.map((wallet, i) => (
            <motion.button
              key={wallet.id}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border border-white/5 hover:border-white/20 transition-all group text-left"
              style={{ background: 'rgba(255,255,255,0.03)' }}
              onClick={() => onSelect(wallet)}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.07 }}
              whileHover={{ backgroundColor: 'rgba(255,255,255,0.06)', x: 4 }}
            >
              {/* Emoji icon */}
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                style={{ background: `${wallet.color}20`, border: `1px solid ${wallet.color}40` }}
              >
                {wallet.emoji}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white text-sm">{wallet.name}</span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: `${wallet.color}20`, color: wallet.color }}
                  >
                    {wallet.chain}
                  </span>
                </div>
                <p className="text-xs text-white/40 mt-0.5">{wallet.desc}</p>
              </div>

              {/* Arrow */}
              <ChevronRight
                size={16}
                className="text-white/20 group-hover:text-white/60 transition-colors flex-shrink-0"
              />
            </motion.button>
          ))}
        </div>

        <div className="px-6 pb-5 pt-1">
          <p className="text-xs text-center text-white/25">
            By connecting, you agree to our{' '}
            <a href="/terms" className="underline hover:text-white/50 transition-colors">Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy" className="underline hover:text-white/50 transition-colors">Privacy Policy</a>.
            Your funds are protected by on-chain escrow.
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const router = useRouter();
  const [blockchainModalOpen, setBlockchainModalOpen] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [products, setProducts] = useState<ProductListing[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handle);
    return () => window.removeEventListener('mousemove', handle);
  }, []);

  useEffect(() => {
    async function loadProducts() {
      setProductsLoading(true);
      setProductsError(null);

      try {
        const requestUrl = API_BASE_URL ? `${API_BASE_URL}/api/buyer/products` : '/api/buyer/products';
        const res = await fetch(requestUrl);
        if (!res.ok) {
          throw new Error(`Could not load products (${res.status})`);
        }

        const data = await res.json();
        const normalized = Array.isArray(data) ? data.map((item: any) => ({
          id: Number(item.id),
          name: item.name,
          category: item.category || 'General',
          price_usdc: Number(item.price_usdc ?? (item.price || 0)),
          emoji: item.emoji || '🛒',
          rating: Number(item.rating ?? 4.8),
          review_count: Number(item.review_count ?? item.sales ?? 0),
          merchant_name: item.merchant_name || item.merchantName,
          merchant_orders: Number(item.merchant_orders ?? item.merchantOrders ?? 0),
          merchant_success_rate: Number(item.merchant_success_rate ?? item.merchantSuccessRate ?? 0),
          tags: item.tags || [],
          images: item.images || [],
        })) : [];
        setProducts(normalized);
      } catch (error: any) {
        console.error('Marketplace load failed:', error);
        setProductsError(error.message || 'Unable to load marketplace products.');
      } finally {
        setProductsLoading(false);
      }
    }

    loadProducts();
  }, []);

  const handleChainSelect = async (wallet: typeof WALLETS[0]) => {
    setConnecting(wallet.id);
    await new Promise(r => setTimeout(r, 1200));
    setConnecting(null);
    setBlockchainModalOpen(false);
    // router.push(wallet.redirect);
    window.location.href = wallet.redirect;
  };

  return (
    <main
      className="min-h-screen overflow-x-hidden"
      style={{ background: '#050510', color: '#fff', fontFamily: 'var(--font-body)' }}
    >
      {/* Cursor glow */}
      <div
        className="fixed pointer-events-none z-0 rounded-full blur-3xl"
        style={{
          width: 600,
          height: 600,
          left: mousePos.x - 300,
          top: mousePos.y - 300,
          background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)',
          transition: 'left 0.3s ease, top 0.3s ease',
        }}
      />

      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <FloatingOrb x="10%" y="15%" size={500} color="#6366f1" delay={0} />
        <FloatingOrb x="70%" y="5%" size={400} color="#4DA2FF" delay={2} />
        <FloatingOrb x="80%" y="60%" size={350} color="#AB9FF2" delay={4} />
        <FloatingOrb x="5%" y="70%" size={300} color="#00B4AB" delay={1} />
      </div>

      {/* Grid pattern */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      {/* ── NAVBAR ── */}
      <motion.nav
        className="relative z-20 flex items-center justify-between px-6 md:px-12 py-5"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="Quilvion Logo"
            width={36}
            height={36}
            className="rounded-xl object-contain"
          />
          <span className="font-bold text-lg tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Quilvion
          </span>
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm text-white/50">
          {['Products', 'How it works', 'Chains', 'Docs'].map(item => (
            <a
              key={item}
              href={item === 'Docs' ? '/docs' : '#'}
              className="hover:text-white transition-colors"
            >
              {item}
            </a>
          ))}
        </div>

        <button
          onClick={() => setBlockchainModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:scale-105 active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #6366f1, #4DA2FF)',
            boxShadow: '0 0 20px rgba(99,102,241,0.3)',
          }}
        >
          Select Blockchain
          <Zap size={13} />
        </button>
      </motion.nav>

      {/* ── HERO ── */}
      <section ref={heroRef} className="relative z-10 px-6 md:px-12 pt-16 pb-24 max-w-7xl mx-auto">
        <motion.div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-8"
          style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          AI Fraud Detection · Wallet = Identity · Escrow Secured
        </motion.div>

        <div className="max-w-4xl">
          <motion.h1
            className="text-5xl md:text-7xl font-black leading-[0.95] tracking-tight mb-6"
            style={{ fontFamily: 'var(--font-display)' }}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
          >
            <span className="text-white">Quilvion</span>
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(135deg, #6366f1 0%, #4DA2FF 50%, #AB9FF2 100%)' }}
            >
              AI-Powered Multichain Commerce.
            </span>
          </motion.h1>

          <motion.p
            className="text-lg md:text-xl text-white/50 max-w-2xl leading-relaxed mb-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            Wallet-based identity meets smart-contract escrow and fraud scoring. Shop digital products over Ethereum, Solana, Sui, and Aptos with live marketplace listings.
          </motion.p>

          <motion.div
            className="flex flex-wrap gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <button
              onClick={() => setBlockchainModalOpen(true)}
              className="flex items-center gap-2 px-6 py-3.5 rounded-2xl font-bold text-base transition-all hover:scale-105 active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #6366f1, #4DA2FF)',
                boxShadow: '0 0 40px rgba(99,102,241,0.35)',
              }}
            >
              Explore Marketplace
              <ArrowRight size={16} />
            </button>
            <button
              onClick={() => setBlockchainModalOpen(true)}
              className="flex items-center gap-2 px-6 py-3.5 rounded-2xl font-bold text-base border border-white/10 hover:border-white/20 transition-all hover:bg-white/5"
            >
              Become a Merchant
            </button>
          </motion.div>
        </div>

        {/* Stats */}
        <motion.div
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-20"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          {STATS.map((stat, i) => (
            <motion.div
              key={stat.label}
              className="p-4 rounded-2xl border border-white/5"
              style={{ background: 'rgba(255,255,255,0.03)' }}
              whileHover={{ borderColor: 'rgba(255,255,255,0.12)', y: -2 }}
              transition={{ delay: 0.8 + i * 0.1 }}
            >
              <stat.icon size={18} className="text-indigo-400 mb-2" />
              <div className="text-2xl font-black text-white" style={{ fontFamily: 'var(--font-display)' }}>
                {stat.value}
              </div>
              <div className="text-xs text-white/40 mt-0.5">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── CHAIN SELECTOR (visual) ── */}
      <section className="relative z-10 px-6 md:px-12 py-16 max-w-7xl mx-auto">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-4xl font-black mb-3" style={{ fontFamily: 'var(--font-display)' }}>
            Your Chain. Your Wallet.
          </h2>
          <p className="text-white/40 text-base max-w-lg mx-auto">
            Connect with your preferred wallet and explore the same platform across any chain.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {WALLETS.map((wallet, i) => (
            <motion.button
              key={wallet.id}
              className="relative p-6 rounded-3xl border text-left overflow-hidden group"
              style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.07)' }}
              onClick={() => setBlockchainModalOpen(true)}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ borderColor: wallet.color + '60', y: -4 }}
            >
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{ background: `radial-gradient(circle at 50% 0%, ${wallet.glow} 0%, transparent 60%)` }}
              />
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl mb-4"
                style={{ background: `${wallet.color}15`, border: `1px solid ${wallet.color}30` }}
              >
                {wallet.emoji}
              </div>
              <div className="font-bold text-white text-lg mb-1" style={{ fontFamily: 'var(--font-display)' }}>
                {wallet.name}
              </div>
              <div className="text-sm font-medium mb-2" style={{ color: wallet.color }}>
                {wallet.chain}
              </div>
              <div className="text-xs text-white/35">{wallet.desc}</div>
              <div
                className="absolute bottom-4 right-4 w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0"
                style={{ background: wallet.color }}
              >
                <ArrowRight size={12} className="text-white" />
              </div>
            </motion.button>
          ))}
        </div>
      </section>

      {/* ── PRODUCTS SHOWCASE ── */}
      <section className="relative z-10 px-6 md:px-12 py-16 max-w-7xl mx-auto">
        <motion.div
          className="flex items-end justify-between mb-10"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <div>
            <h2 className="text-3xl md:text-4xl font-black" style={{ fontFamily: 'var(--font-display)' }}>
              Trending Products
            </h2>
            <p className="text-white/40 mt-1">Select a blockchain to purchase any product</p>
          </div>
          <button
            className="hidden md:flex items-center gap-1.5 text-sm text-indigo-400 hover:text-white transition-colors"
            onClick={() => setBlockchainModalOpen(true)}
          >
            Browse live marketplace <ChevronRight size={14} />
          </button>
        </motion.div>

        {productsLoading ? (
          <div className="flex items-center justify-center py-16 text-white/50">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-white/40 border-solid border-white/10" />
            <span className="ml-3">Loading marketplace products...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(products.length ? products : FALLBACK_PRODUCTS).map((product, i) => (
              <motion.div
                key={product.id}
                className="group p-5 rounded-2xl border border-white/5 hover:border-white/12 transition-all cursor-pointer"
                style={{ background: 'rgba(255,255,255,0.02)' }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                whileHover={{ y: -4, backgroundColor: 'rgba(255,255,255,0.04)' }}
                onClick={() => setBlockchainModalOpen(true)}
              >
                <div className="relative w-full h-32 rounded-xl mb-4 overflow-hidden bg-white/5">
                  {product.images && product.images.length > 0 ? (
                    <Image
                      src={product.images[0]}
                      alt={product.name}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-5xl">
                      {product.emoji}
                    </div>
                  )}
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-white/30 font-medium uppercase tracking-wider">
                      {product.category}
                    </span>
                    <h3 className="font-bold text-white text-sm mt-0.5 truncate">{product.name}</h3>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-black text-white text-sm" style={{ fontFamily: 'var(--font-display)' }}>
                      ${product.price_usdc}
                    </div>
                    <div className="text-xs text-white/30">USDC</div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-1">
                    <Star size={11} className="text-yellow-400 fill-yellow-400" />
                    <span className="text-xs text-white/50">{product.rating.toFixed(1)}</span>
                    <span className="text-xs text-white/25 ml-1">({product.review_count ?? 0} reviews)</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Shield size={11} />
                    <span>Escrow protected</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
        {productsError && (
          <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">
            Unable to load marketplace products: {productsError}
          </div>
        )}
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="relative z-10 px-6 md:px-12 py-16 max-w-7xl mx-auto">
        <motion.h2
          className="text-3xl md:text-4xl font-black text-center mb-12"
          style={{ fontFamily: 'var(--font-display)' }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          How Quilvion Works
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { step: '01', title: 'Select Your Blockchain', desc: 'Choose from Ethereum, Solana, Sui, or Aptos. Connect your wallet — no signup, no passwords needed.', icon: '🔌' },
            { step: '02', title: 'Browse & Buy', desc: 'Discover digital products across all chains. Pay in USDC — stable, fast, and chain-native.', icon: '🛍️' },
            { step: '03', title: 'Escrow Protection', desc: 'Funds lock on-chain until delivery is confirmed. Dispute? Our AI-assisted admin resolves it fairly.', icon: '🔒' },
          ].map((item, i) => (
            <motion.div
              key={item.step}
              className="relative p-6 rounded-3xl border border-white/5"
              style={{ background: 'rgba(255,255,255,0.02)' }}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
            >
              <div className="text-5xl mb-4">{item.icon}</div>
              <div
                className="text-xs font-black mb-2 tracking-widest"
                style={{ color: '#6366f1', fontFamily: 'var(--font-display)' }}
              >
                STEP {item.step}
              </div>
              <h3 className="font-bold text-white text-lg mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                {item.title}
              </h3>
              <p className="text-sm text-white/40 leading-relaxed">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative z-10 px-6 md:px-12 py-20 max-w-7xl mx-auto">
        <motion.div
          className="relative rounded-3xl p-12 text-center overflow-hidden"
          style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(77,162,255,0.1) 100%)', border: '1px solid rgba(99,102,241,0.2)' }}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <div className="absolute inset-0 pointer-events-none">
            <FloatingOrb x="10%" y="20%" size={300} color="#6366f1" delay={0} />
            <FloatingOrb x="70%" y="50%" size={250} color="#4DA2FF" delay={2} />
          </div>
          <div className="relative z-10">
            <h2 className="text-4xl md:text-5xl font-black mb-4" style={{ fontFamily: 'var(--font-display)' }}>
              Ready to trade?
            </h2>
            <p className="text-white/50 mb-8 max-w-md mx-auto">
              Select your blockchain and start buying or selling — across any chain, protected by escrow.
            </p>
            <button
              onClick={() => setBlockchainModalOpen(true)}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl font-bold text-base transition-all hover:scale-105 active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #6366f1, #4DA2FF)',
                boxShadow: '0 0 50px rgba(99,102,241,0.4)',
              }}
            >
              <ShoppingBag size={18} />
              Select Blockchain & Shop
            </button>
          </div>
        </motion.div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative z-10 px-6 md:px-12 py-10 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          {/* Top row */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-6">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="Quilvion Logo"
                width={28}
                height={28}
                className="rounded-lg object-contain"
              />
              <span className="text-sm font-semibold text-white/60">Quilvion</span>
            </div>

            {/* Links */}
            <div className="flex items-center gap-6 text-xs text-white/30">
              <a href="/terms" className="hover:text-white/70 transition-colors">Terms</a>
              <a href="/privacy" className="hover:text-white/70 transition-colors">Privacy</a>
              <a href="/docs" className="hover:text-white/70 transition-colors">Docs</a>
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
              © 2026 Quilvion. All transactions secured by on-chain escrow. Powered by AI & Blockchain.
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

      {/* ── BLOCKCHAIN SELECTOR MODAL ── */}
      <AnimatePresence>
        {blockchainModalOpen && (
          <BlockchainModal
            onClose={() => setBlockchainModalOpen(false)}
            onSelect={handleChainSelect}
          />
        )}
      </AnimatePresence>

      {/* ── CONNECTING OVERLAY ── */}
      <AnimatePresence>
        {connecting && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="text-center"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
            >
              <div className="text-6xl mb-4">
                {WALLETS.find(w => w.id === connecting)?.emoji}
              </div>
              <div className="text-white font-bold text-xl mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                Connecting to {WALLETS.find(w => w.id === connecting)?.name}...
              </div>
              <div className="flex gap-1 justify-center mt-4">
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 rounded-full bg-indigo-400"
                    animate={{ y: [0, -8, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}