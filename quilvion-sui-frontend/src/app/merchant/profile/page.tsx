'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit';
import { ArrowLeft, Loader2, TrendingUp, ShoppingBag, Star, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { fetchMerchantOrders, fetchMerchantStats } from '@/lib/api';

export default function MerchantProfilePage() {
  const account = useCurrentAccount();
  const [merchantStats, setMerchantStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Fetch merchant stats
  useEffect(() => {
    if (account?.address) {
      setStatsLoading(true);
      fetchMerchantStats(account.address)
        .then(setMerchantStats)
        .catch(err => {
          console.error("Failed to fetch merchant stats:", err);
          setMerchantStats(null);
        })
        .finally(() => setStatsLoading(false));
    }
  }, [account?.address]);

  // Fetch merchant orders
  useEffect(() => {
    if (account?.address) {
      setOrdersLoading(true);
      fetchMerchantOrders(account.address)
        .then(setOrders)
        .catch(err => {
          console.error("Failed to fetch orders:", err);
          setOrders([]);
        })
        .finally(() => setOrdersLoading(false));
    }
  }, [account?.address]);

  return (
    <div style={{ background: '#05050f', minHeight: '100vh' }}>
      {/* ── HEADER ── */}
      <header className="border-b border-white/5" style={{ background: 'rgba(5,5,15,0.7)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/merchant" className="flex items-center gap-2 text-white/60 hover:text-white/80 transition-colors">
            <ArrowLeft size={18} />
            <span className="text-sm font-semibold">Back to Dashboard</span>
          </Link>
          <span className="font-bold text-sm" style={{ fontFamily: 'var(--font-display)' }}>
            Merchant Profile <span className="text-white/30">· Sui</span>
          </span>
          <ConnectButton />
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {!account ? (
          <motion.div className="flex flex-col items-center justify-center py-24 text-center"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="text-6xl mb-4">🏪</div>
            <h2 className="text-2xl font-black mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              Connect Your Wallet
            </h2>
            <p className="text-white/40 mb-6 max-w-sm">
              Connect your wallet to view your merchant profile, stats, and order history.
            </p>
            <ConnectButton />
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
            {/* ── MERCHANT STATS ── */}
            <div>
              <h1 className="text-3xl font-black mb-6" style={{ fontFamily: 'var(--font-display)' }}>
                Your Merchant Profile
              </h1>
              {statsLoading ? (
                <div className="flex items-center justify-center py-12 text-white/50">
                  <Loader2 size={20} className="animate-spin mr-2" />
                  <span>Loading your stats...</span>
                </div>
              ) : merchantStats ? (
                <div className="space-y-6">
                  {/* Company Info Card */}
                  <div className="p-6 rounded-2xl border border-white/8"
                    style={{ background: 'linear-gradient(135deg, rgba(77,162,255,0.06), rgba(99,102,241,0.06))' }}>
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
                        style={{ background: 'rgba(255,255,255,0.05)' }}>
                        🏪
                      </div>
                      <div className="flex-1">
                        <h2 className="text-xl font-black text-white">{merchantStats.companyName}</h2>
                        <p className="text-sm text-white/50 mt-1">{merchantStats.category} · Merchant on Sui Testnet</p>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-white/30">Merchant Score</div>
                        <div className="text-2xl font-black text-emerald-400">{merchantStats.merchantScore}</div>
                      </div>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0 }}
                      className="p-4 rounded-2xl border border-white/5"
                      style={{ background: 'rgba(255,255,255,0.02)' }}>
                      <TrendingUp size={14} className="text-emerald-400 mb-2" />
                      <div className="text-2xl font-black text-emerald-400 mb-1">
                        ${merchantStats.totalRevenue.toFixed(2)}
                      </div>
                      <div className="text-xs text-white/40">Total Revenue</div>
                      <div className="text-xs text-white/20 mt-1">USDC earned</div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="p-4 rounded-2xl border border-white/5"
                      style={{ background: 'rgba(255,255,255,0.02)' }}>
                      <ShoppingBag size={14} className="text-blue-400 mb-2" />
                      <div className="text-2xl font-black text-blue-400 mb-1">
                        {merchantStats.totalOrders}
                      </div>
                      <div className="text-xs text-white/40">Total Orders</div>
                      <div className="text-xs text-white/20 mt-1">{merchantStats.completedOrders} completed</div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="p-4 rounded-2xl border border-white/5"
                      style={{ background: 'rgba(255,255,255,0.02)' }}>
                      <Star size={14} className="text-yellow-400 mb-2" />
                      <div className="text-2xl font-black text-yellow-400 mb-1">
                        {merchantStats.successRate}%
                      </div>
                      <div className="text-xs text-white/40">Success Rate</div>
                      <div className="text-xs text-white/20 mt-1">completion rate</div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="p-4 rounded-2xl border border-white/5"
                      style={{ background: 'rgba(255,255,255,0.02)' }}>
                      <AlertTriangle size={14} className={merchantStats.disputedOrders > 0 ? 'text-red-400' : 'text-green-400'} style={{ marginBottom: '0.5rem' }} />
                      <div className={`text-2xl font-black mb-1 ${merchantStats.disputedOrders > 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {merchantStats.disputedOrders}
                      </div>
                      <div className="text-xs text-white/40">Disputes</div>
                      <div className="text-xs text-white/20 mt-1">{merchantStats.disputedOrders === 0 ? 'Clean record' : 'Needs attention'}</div>
                    </motion.div>
                  </div>

                  {/* Average Order Value */}
                  <div className="p-4 rounded-2xl border border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-white/60 mb-1">Average Order Value</div>
                        <div className="text-2xl font-black text-white">${merchantStats.averageOrderValue.toFixed(2)}</div>
                      </div>
                      <div className="text-4xl opacity-20">📊</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-white/40">
                  <p>No profile data available. Start selling to build your profile!</p>
                </div>
              )}
            </div>

            {/* ── WALLET INFO ── */}
            <div className="p-6 rounded-2xl border border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <h2 className="text-lg font-black mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                Wallet Information
              </h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <span className="text-white/60">Wallet Address</span>
                  <code className="text-xs text-white/80 font-mono">{account.address.slice(0, 10)}...{account.address.slice(-8)}</code>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <span className="text-white/60">Network</span>
                  <span className="text-white/80 font-semibold">Sui Testnet</span>
                </div>
              </div>
            </div>

            {/* ── RECENT ORDERS ── */}
            <div>
              <h2 className="text-lg font-black mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                Recent Orders
              </h2>
              {ordersLoading ? (
                <div className="flex items-center justify-center py-12 text-white/50">
                  <Loader2 size={20} className="animate-spin mr-2" />
                  <span>Loading orders...</span>
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center py-12 text-white/30">
                  <ShoppingBag size={48} className="mx-auto mb-4 opacity-40" />
                  <p className="text-lg">No orders yet</p>
                  <p className="text-sm mt-2">Your orders will appear here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.slice(0, 10).map(order => (
                    <motion.div key={order.id}
                      initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                      className="flex items-center justify-between p-4 rounded-2xl border border-white/5 hover:border-white/10 transition-all"
                      style={{ background: 'rgba(255,255,255,0.02)' }}>
                      <div className="flex-1">
                        <div className="font-semibold text-white">{order.productName}</div>
                        <div className="text-xs text-white/40 mt-1">Buyer: {order.buyerWallet?.slice(0, 10)}...{order.buyerWallet?.slice(-8)}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-white">${order.amountUsdc.toFixed(2)}</div>
                        <div className={`text-xs mt-1 px-2 py-1 rounded-full font-semibold w-fit ${
                          order.status === 'COMPLETED' ? 'bg-emerald-400/20 text-emerald-400' :
                          order.status === 'PENDING' ? 'bg-yellow-400/20 text-yellow-400' :
                          'bg-red-400/20 text-red-400'
                        }`}>
                          {order.status}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
