'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { 
  ShoppingBag, Shield, Zap, Globe, ChevronRight, 
  Star, TrendingUp, Lock, ArrowRight, X
} from 'lucide-react';

// ── Wallet config ────────────────────────────────────────────────────────────
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
    redirect: '/evm',
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
    redirect: '/solana',
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
    redirect: '/sui',
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
    redirect: '/aptos',
  },
];

// ── Products ─────────────────────────────────────────────────────────────────
const PRODUCTS = [
  { name: 'Digital Art Bundle', price: '0.05 ETH', category: 'Digital', rating: 4.9, sales: '2.1k', emoji: '🎨' },
  { name: 'Web3 Dev Course', price: '12 SOL', category: 'Education', rating: 4.8, sales: '890', emoji: '📚' },
  { name: 'DeFi Analytics Pro', price: '150 USDC', category: 'Tools', rating: 4.7, sales: '1.4k', emoji: '📊' },
  { name: 'NFT Collection Pass', price: '2 SUI', category: 'NFT', rating: 5.0, sales: '3.2k', emoji: '🏆' },
  { name: 'Smart Contract Audit', price: '0.1 APT', category: 'Service', rating: 4.9, sales: '340', emoji: '🔐' },
  { name: 'Trading Signals Alpha', price: '50 USDC', category: 'Finance', rating: 4.6, sales: '5.7k', emoji: '📈' },
];

const STATS = [
  { label: 'Total Volume', value: '$4.2M', icon: TrendingUp },
  { label: 'Active Users', value: '18,400', icon: Globe },
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

function WalletModal({ onClose, onSelect }: { onClose: () => void; onSelect: (wallet: typeof WALLETS[0]) => void }) {
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
              Connect Wallet
            </h2>
            <p className="text-sm text-white/50 mt-0.5">Choose your blockchain & wallet</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <X size={14} className="text-white/60" />
          </button>
        </div>

        {/* Wallet options */}
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
            By connecting, you agree to our Terms of Service. Your funds are protected by on-chain escrow.
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const router = useRouter();
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const heroRef = useRef<HTMLDivElement>(null);

  // Subtle cursor-following glow
  useEffect(() => {
    const handle = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handle);
    return () => window.removeEventListener('mousemove', handle);
  }, []);

  const handleWalletSelect = async (wallet: typeof WALLETS[0]) => {
    setConnecting(wallet.id);
    // Simulate wallet connection delay
    await new Promise(r => setTimeout(r, 1200));
    setConnecting(null);
    setWalletModalOpen(false);
    router.push(wallet.redirect);
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

      {/* Grid pattern overlay */}
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
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm"
            style={{ background: 'linear-gradient(135deg, #6366f1, #4DA2FF)', fontFamily: 'var(--font-display)' }}
          >
            Q
          </div>
          <span className="font-bold text-lg tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Quilvion
          </span>
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm text-white/50">
          {['Products', 'How it works', 'Chains', 'Docs'].map(item => (
            <a key={item} href="#" className="hover:text-white transition-colors">{item}</a>
          ))}
        </div>

        <button
          onClick={() => setWalletModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:scale-105 active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #6366f1, #4DA2FF)',
            boxShadow: '0 0 20px rgba(99,102,241,0.3)',
          }}
        >
          Connect Wallet
          <Zap size={13} />
        </button>
      </motion.nav>

      {/* ── HERO ── */}
      <section ref={heroRef} className="relative z-10 px-6 md:px-12 pt-16 pb-24 max-w-7xl mx-auto">
        {/* Badge */}
        <motion.div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-8"
          style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Live on 4 Blockchains · Escrow Protected
        </motion.div>

        <div className="max-w-4xl">
          <motion.h1
            className="text-5xl md:text-7xl font-black leading-[0.95] tracking-tight mb-6"
            style={{ fontFamily: 'var(--font-display)' }}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
          >
            <span className="text-white">Commerce</span>
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(135deg, #6366f1 0%, #4DA2FF 50%, #AB9FF2 100%)' }}
            >
              Without Borders.
            </span>
          </motion.h1>

          <motion.p
            className="text-lg md:text-xl text-white/50 max-w-2xl leading-relaxed mb-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            Buy and sell digital products across Ethereum, Solana, Sui, and Aptos — 
            protected by on-chain escrow, powered by USDC stablecoin.
          </motion.p>

          <motion.div
            className="flex flex-wrap gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <button
              onClick={() => setWalletModalOpen(true)}
              className="flex items-center gap-2 px-6 py-3.5 rounded-2xl font-bold text-base transition-all hover:scale-105 active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #6366f1, #4DA2FF)',
                boxShadow: '0 0 40px rgba(99,102,241,0.35)',
              }}
            >
              Start Shopping
              <ArrowRight size={16} />
            </button>
            <button
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
              onClick={() => setWalletModalOpen(true)}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ borderColor: wallet.color + '60', y: -4 }}
            >
              {/* Glow on hover */}
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
            <p className="text-white/40 mt-1">Connect a wallet to purchase any product</p>
          </div>
          <button
            className="hidden md:flex items-center gap-1.5 text-sm text-indigo-400 hover:text-white transition-colors"
            onClick={() => setWalletModalOpen(true)}
          >
            View all <ChevronRight size={14} />
          </button>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PRODUCTS.map((product, i) => (
            <motion.div
              key={product.name}
              className="group p-5 rounded-2xl border border-white/5 hover:border-white/12 transition-all cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.02)' }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              whileHover={{ y: -4, backgroundColor: 'rgba(255,255,255,0.04)' }}
              onClick={() => setWalletModalOpen(true)}
            >
              {/* Product image placeholder */}
              <div
                className="w-full h-32 rounded-xl mb-4 flex items-center justify-center text-5xl"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              >
                {product.emoji}
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
                    {product.price}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-1">
                  <Star size={11} className="text-yellow-400 fill-yellow-400" />
                  <span className="text-xs text-white/50">{product.rating}</span>
                  <span className="text-xs text-white/25 ml-1">({product.sales} sold)</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Shield size={11} />
                  <span>Escrow protected</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
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
            { step: '01', title: 'Connect Your Wallet', desc: 'Choose MetaMask, Phantom, Slush, or Petra. Your wallet = your identity, no signups needed.', icon: '🔌' },
            { step: '02', title: 'Browse & Buy', desc: 'Discover digital products across all chains. Pay in USDC — stable, fast, and chain-native.', icon: '🛍️' },
            { step: '03', title: 'Escrow Protection', desc: 'Funds lock on-chain until delivery is confirmed. Dispute? Our admin resolves it fairly.', icon: '🔒' },
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
              Connect your wallet and start buying or selling — across any chain, protected by escrow.
            </p>
            <button
              onClick={() => setWalletModalOpen(true)}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl font-bold text-base transition-all hover:scale-105 active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #6366f1, #4DA2FF)',
                boxShadow: '0 0 50px rgba(99,102,241,0.4)',
              }}
            >
              <ShoppingBag size={18} />
              Connect Wallet & Shop
            </button>
          </div>
        </motion.div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative z-10 px-6 md:px-12 py-8 border-t border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs"
              style={{ background: 'linear-gradient(135deg, #6366f1, #4DA2FF)', fontFamily: 'var(--font-display)' }}
            >
              Q
            </div>
            <span className="text-sm font-semibold text-white/60">Quilvion</span>
          </div>
          <p className="text-xs text-white/25">
            © 2025 Quilvion. All transactions secured by on-chain escrow. Built for the Sui Hackathon.
          </p>
          <div className="flex items-center gap-4 text-xs text-white/30">
            {['Terms', 'Privacy', 'Docs', 'GitHub'].map(l => (
              <a key={l} href="#" className="hover:text-white/60 transition-colors">{l}</a>
            ))}
          </div>
        </div>
      </footer>

      {/* ── WALLET MODAL ── */}
      <AnimatePresence>
        {walletModalOpen && (
          <WalletModal
            onClose={() => setWalletModalOpen(false)}
            onSelect={handleWalletSelect}
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