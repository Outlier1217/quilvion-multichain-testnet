'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ChevronRight, ExternalLink } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'chains', label: 'Supported Chains' },
  { id: 'escrow', label: 'Escrow & Transactions' },
  { id: 'ai', label: 'AI Infrastructure' },
  { id: 'fraud', label: 'Fraud Detection' },
  { id: 'reputation', label: 'Reputation System' },
  { id: 'disputes', label: 'Dispute Resolution' },
  { id: 'smart-contracts', label: 'Smart Contracts' },
  { id: 'stack', label: 'Tech Stack' },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('overview');

  return (
    <main
      className="min-h-screen"
      style={{ background: '#050510', color: '#fff', fontFamily: 'var(--font-body)' }}
    >
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Navbar */}
      <nav className="relative z-20 flex items-center justify-between px-6 md:px-12 py-5 border-b border-white/5 sticky top-0"
        style={{ background: 'rgba(5,5,16,0.9)', backdropFilter: 'blur(12px)' }}>
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <Image src="/logo.png" alt="Quilvion" width={32} height={32} className="rounded-lg object-contain" />
          <span className="font-bold text-base" style={{ fontFamily: 'var(--font-display)' }}>Quilvion</span>
          <span className="text-white/20 text-sm">/</span>
          <span className="text-white/50 text-sm">Docs</span>
        </Link>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/Outlier1217/quilvion-multichain-testnet"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white transition-colors"
          >
            <ExternalLink size={13} />
            GitHub
          </a>
          <Link href="/" className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors">
            <ArrowLeft size={14} />
            Home
          </Link>
        </div>
      </nav>

      <div className="flex max-w-7xl mx-auto">
        {/* Sidebar */}
        <aside className="hidden lg:block w-64 shrink-0 px-6 py-10 sticky top-20 self-start h-screen overflow-y-auto">
          <p className="text-xs font-semibold text-white/25 uppercase tracking-widest mb-4">Documentation</p>
          <nav className="space-y-1">
            {NAV_ITEMS.map(item => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={() => setActiveSection(item.id)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all"
                style={{
                  color: activeSection === item.id ? '#a5b4fc' : 'rgba(255,255,255,0.4)',
                  background: activeSection === item.id ? 'rgba(99,102,241,0.12)' : 'transparent',
                }}
              >
                {activeSection === item.id && <ChevronRight size={12} />}
                {item.label}
              </a>
            ))}
          </nav>

          <div className="mt-8 p-4 rounded-2xl border border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <p className="text-xs text-white/30 mb-2">Built for</p>
            <p className="text-sm font-semibold text-white/70">Sui Hackathon</p>
            <p className="text-xs text-white/30 mt-1">Testnet deployment</p>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 px-6 md:px-12 py-10 max-w-3xl">

          {/* Overview */}
          <section id="overview" className="mb-16">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-6"
                style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}>
                Introduction
              </div>
              <h1 className="text-4xl md:text-5xl font-black mb-6" style={{ fontFamily: 'var(--font-display)' }}>
                Quilvion Docs
              </h1>
              <p className="text-white/60 text-lg leading-relaxed mb-6">
                Quilvion is an AI-powered Web3 commerce platform built on the Sui blockchain. It combines on-chain escrow, AI fraud detection, LLM-powered marketplace intelligence, and decentralized reputation systems into a single protocol.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { label: 'On-chain Escrow', color: '#6366f1' },
                  { label: 'AI Fraud Detection', color: '#4DA2FF' },
                  { label: 'LLM Intelligence', color: '#AB9FF2' },
                  { label: 'Reputation System', color: '#00B4AB' },
                  { label: 'USDC Settlement', color: '#F6851B' },
                  { label: '4 Blockchains', color: '#AB9FF2' },
                ].map(f => (
                  <div key={f.label} className="px-3 py-2 rounded-xl text-xs font-medium text-center"
                    style={{ background: `${f.color}15`, border: `1px solid ${f.color}30`, color: f.color }}>
                    {f.label}
                  </div>
                ))}
              </div>
            </motion.div>
          </section>

          {/* Core Philosophy */}
          <section className="mb-16 p-6 rounded-2xl border border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <h2 className="text-2xl font-black mb-4" style={{ fontFamily: 'var(--font-display)' }}>Core Philosophy — Wallet as Identity</h2>
            <p className="text-white/50 leading-relaxed mb-4">
              Quilvion eliminates account creation friction through one principle: <span className="text-white font-semibold">Wallet = Identity</span>.
            </p>
            <p className="text-white/50 leading-relaxed mb-4">Your wallet becomes:</p>
            <ul className="space-y-2">
              {['The identity layer', 'The payment layer', 'The reputation layer', 'The trust layer'].map(item => (
                <li key={item} className="flex items-center gap-2 text-sm text-white/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          {/* Architecture */}
          <section id="architecture" className="mb-16">
            <h2 className="text-2xl font-black mb-6" style={{ fontFamily: 'var(--font-display)' }}>System Architecture</h2>
            <div className="p-5 rounded-2xl border border-white/5 font-mono text-sm text-white/60"
              style={{ background: 'rgba(255,255,255,0.02)' }}>
              <pre className="whitespace-pre leading-relaxed">{`Buyer / Merchant / Admin
        ↓
   Next.js 15 Frontend
        ↓
   FastAPI Backend (Python)
   ├── XGBoost ML Fraud Engine
   ├── Groq LLaMA 3.3 70B
   └── PostgreSQL (Neon)
        ↓
   Sui Blockchain (Move Smart Contracts)
        ↓
   Escrow + Settlement + Reputation`}</pre>
            </div>
          </section>

          {/* Chains */}
          <section id="chains" className="mb-16">
            <h2 className="text-2xl font-black mb-6" style={{ fontFamily: 'var(--font-display)' }}>Supported Chains</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { name: 'Sui', wallet: 'Slush Wallet', color: '#4DA2FF', emoji: '💧', status: 'Live', note: 'Primary chain — full feature support' },
                { name: 'Ethereum / EVM', wallet: 'MetaMask', color: '#F6851B', emoji: '🦊', status: 'In Progress', note: 'EVM-compatible chains' },
                { name: 'Solana', wallet: 'Phantom', color: '#AB9FF2', emoji: '👻', status: 'In Progress', note: 'High-speed transactions' },
                { name: 'Aptos', wallet: 'Petra', color: '#00B4AB', emoji: '🌀', status: 'In Progress', note: 'Move-based L1' },
              ].map(chain => (
                <div key={chain.name} className="p-4 rounded-2xl border border-white/5"
                  style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{chain.emoji}</span>
                    <div>
                      <p className="font-bold text-white text-sm">{chain.name}</p>
                      <p className="text-xs text-white/40">{chain.wallet}</p>
                    </div>
                    <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: `${chain.color}20`, color: chain.color }}>
                      {chain.status}
                    </span>
                  </div>
                  <p className="text-xs text-white/35">{chain.note}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Escrow */}
          <section id="escrow" className="mb-16">
            <h2 className="text-2xl font-black mb-6" style={{ fontFamily: 'var(--font-display)' }}>Escrow & Transactions</h2>
            <p className="text-white/50 leading-relaxed mb-6">Every transaction is protected through Move smart contracts on the Sui blockchain. USDC is used as the settlement token (6 decimals).</p>
            <div className="p-5 rounded-2xl border border-white/5 mb-6" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <p className="text-xs font-semibold text-indigo-400 mb-3 uppercase tracking-widest">Purchase Flow</p>
              <div className="space-y-2">
                {[
                  '1. Buyer initiates purchase using USDC',
                  '2. Funds are locked into escrow smart contract',
                  '3. AI fraud analysis runs before settlement',
                  '4. Merchant delivers product',
                  '5. Funds release automatically or through admin approval',
                  '6. Buyers can raise disputes during refund window',
                ].map(step => (
                  <p key={step} className="text-sm text-white/50">{step}</p>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 text-white/40 font-medium">Risk Score</th>
                    <th className="text-left py-2 text-white/40 font-medium">Level</th>
                    <th className="text-left py-2 text-white/40 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="space-y-1">
                  {[
                    { score: '0–49', level: 'LOW', action: 'Auto-complete', color: '#22c55e' },
                    { score: '50–74', level: 'MEDIUM', action: 'Escrow hold', color: '#f59e0b' },
                    { score: '75–100', level: 'HIGH / CRITICAL', action: 'Transaction blocked', color: '#ef4444' },
                  ].map(row => (
                    <tr key={row.score} className="border-b border-white/5">
                      <td className="py-3 text-white/60 font-mono">{row.score}</td>
                      <td className="py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: `${row.color}20`, color: row.color }}>
                          {row.level}
                        </span>
                      </td>
                      <td className="py-3 text-white/50">{row.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* AI */}
          <section id="ai" className="mb-16">
            <h2 className="text-2xl font-black mb-6" style={{ fontFamily: 'var(--font-display)' }}>AI Infrastructure</h2>
            <p className="text-white/50 leading-relaxed mb-6">Quilvion integrates two independent AI systems optimized for different purposes:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="p-5 rounded-2xl border border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <p className="text-xs text-indigo-400 font-semibold uppercase tracking-widest mb-2">Fraud Detection</p>
                <p className="text-lg font-bold text-white mb-1" style={{ fontFamily: 'var(--font-display)' }}>XGBoost</p>
                <p className="text-sm text-white/40">Real-time transaction risk scoring (~50ms). Runs before wallet confirmation.</p>
              </div>
              <div className="p-5 rounded-2xl border border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <p className="text-xs text-purple-400 font-semibold uppercase tracking-widest mb-2">Language Intelligence</p>
                <p className="text-lg font-bold text-white mb-1" style={{ fontFamily: 'var(--font-display)' }}>Groq LLaMA 3.3 70B</p>
                <p className="text-sm text-white/40">Marketplace AI features: assistant, descriptions, dispute summaries, merchant profiles.</p>
              </div>
            </div>
            <div className="space-y-3">
              {[
                { title: 'Fraud Explanation Agent', desc: 'Transforms ML risk scores into human-readable explanations.' },
                { title: 'AI Buyer Assistant', desc: 'Conversational shopping assistant with live marketplace context and product recommendations.' },
                { title: 'AI Product Description Generator', desc: 'Merchants can generate professional descriptions from natural-language prompts.' },
                { title: 'AI Dispute Summarizer', desc: 'Aggregates transaction data and generates admin recommendations: Refund, Release, or Investigate.' },
                { title: 'Merchant Risk Profiler', desc: 'Creates readable merchant trust summaries from raw platform data.' },
                { title: 'XP Tier Notifications', desc: 'Generates personalized buyer progression messages using real transaction data.' },
              ].map(feature => (
                <div key={feature.title} className="flex gap-4 p-4 rounded-xl border border-white/5"
                  style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0 mt-1.5" />
                  <div>
                    <p className="text-sm font-semibold text-white">{feature.title}</p>
                    <p className="text-xs text-white/40 mt-0.5">{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Reputation */}
          <section id="reputation" className="mb-16">
            <h2 className="text-2xl font-black mb-6" style={{ fontFamily: 'var(--font-display)' }}>Reputation System</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm font-semibold text-white/60 mb-3">Buyer XP Tiers</p>
                <div className="space-y-2">
                  {[
                    { xp: '0–99 XP', tier: 'Bronze', color: '#cd7f32' },
                    { xp: '100–499 XP', tier: 'Silver', color: '#9ca3af' },
                    { xp: '500+ XP', tier: 'Gold', color: '#f59e0b' },
                  ].map(t => (
                    <div key={t.tier} className="flex items-center justify-between px-4 py-2 rounded-xl border border-white/5"
                      style={{ background: 'rgba(255,255,255,0.02)' }}>
                      <span className="text-sm text-white/50">{t.xp}</span>
                      <span className="text-sm font-semibold" style={{ color: t.color }}>{t.tier}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-white/60 mb-3">Merchant Score Events</p>
                <div className="space-y-2">
                  {[
                    { event: 'Successful order', impact: '+5 score', color: '#22c55e' },
                    { event: 'Dispute loss', impact: '−20 score', color: '#ef4444' },
                  ].map(e => (
                    <div key={e.event} className="flex items-center justify-between px-4 py-2 rounded-xl border border-white/5"
                      style={{ background: 'rgba(255,255,255,0.02)' }}>
                      <span className="text-sm text-white/50">{e.event}</span>
                      <span className="text-sm font-semibold" style={{ color: e.color }}>{e.impact}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Smart Contracts */}
          <section id="smart-contracts" className="mb-16">
            <h2 className="text-2xl font-black mb-6" style={{ fontFamily: 'var(--font-display)' }}>Smart Contracts</h2>
            <div className="flex gap-3 mb-6 flex-wrap">
              {[
                { label: 'Network', value: 'Sui Testnet' },
                { label: 'Language', value: 'Move 2024' },
                { label: 'Token', value: 'USDC (6 decimals)' },
              ].map(item => (
                <div key={item.label} className="px-4 py-2 rounded-xl border border-white/5"
                  style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <p className="text-xs text-white/30">{item.label}</p>
                  <p className="text-sm font-semibold text-white">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              {[
                { module: 'commerce_core', desc: 'Primary protocol layer — order creation, escrow release, disputes, settlement, risk storage.' },
                { module: 'escrow_logic', desc: 'Fund locking, treasury balances, refund execution, fee deduction, daily spending limits.' },
                { module: 'access_control', desc: 'Role-based permissions: DEFAULT_ADMIN, ADMIN, BOT, MERCHANT.' },
                { module: 'reputation_manager', desc: 'Buyer XP, tiers, merchant trust scores, order history, badge minting.' },
                { module: 'config_manager', desc: 'Dynamic runtime configuration — fees, refund windows, escrow thresholds. No redeployment needed.' },
              ].map(m => (
                <div key={m.module} className="p-4 rounded-xl border border-white/5"
                  style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <p className="font-mono text-sm text-indigo-400 mb-1">{m.module}</p>
                  <p className="text-xs text-white/40">{m.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Tech Stack */}
          <section id="stack" className="mb-16">
            <h2 className="text-2xl font-black mb-6" style={{ fontFamily: 'var(--font-display)' }}>Tech Stack</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  label: 'Frontend', color: '#6366f1',
                  items: ['Next.js 15', 'TypeScript', 'Tailwind CSS', 'Framer Motion', '@mysten/dapp-kit', 'Cloudinary CDN'],
                },
                {
                  label: 'Backend', color: '#4DA2FF',
                  items: ['FastAPI (Python)', 'PostgreSQL (Neon)', 'SQLAlchemy', 'XGBoost', 'Groq LLaMA 3.3 70B', 'Cloudinary SDK'],
                },
                {
                  label: 'Blockchain', color: '#00B4AB',
                  items: ['Sui Move 2024', 'USDC Escrow', 'On-chain disputes', 'Role-based access', 'Reputation on-chain'],
                },
              ].map(col => (
                <div key={col.label} className="p-5 rounded-2xl border border-white/5"
                  style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: col.color }}>
                    {col.label}
                  </p>
                  <ul className="space-y-1.5">
                    {col.items.map(item => (
                      <li key={item} className="text-sm text-white/50 flex items-center gap-2">
                        <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: col.color }} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* Footer */}
          <div className="mt-12 p-6 rounded-2xl border border-white/5 text-center"
            style={{ background: 'rgba(255,255,255,0.02)' }}>
            <p className="text-sm text-white/40 mb-3">Questions or contributions?</p>
            <div className="flex items-center justify-center gap-4">
              <a href="https://github.com/Outlier1217/quilvion-multichain-testnet" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
                <ExternalLink size={13} />
                GitHub Repository
              </a>
              <span className="text-white/20">·</span>
              <a href="https://www.linkedin.com/in/mustak1217/" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors">
                <ExternalLink size={13} />
                Mustak Aalam
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}