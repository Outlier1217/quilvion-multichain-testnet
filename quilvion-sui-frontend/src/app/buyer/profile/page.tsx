'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { BuyerProfileCard } from '@/components/BuyerProfileCard';
import { fetchBuyerOrders, fetchBuyerStats } from '@/lib/api';

export default function BuyerProfilePage() {
  const account = useCurrentAccount();
  const [buyerStats, setBuyerStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Fetch buyer stats
  useEffect(() => {
    if (account?.address) {
      setStatsLoading(true);
      fetchBuyerStats(account.address)
        .then(setBuyerStats)
        .catch(err => {
          console.error("Failed to fetch buyer stats:", err);
          setBuyerStats(null);
        })
        .finally(() => setStatsLoading(false));
    }
  }, [account?.address]);

  // Fetch buyer orders
  useEffect(() => {
    if (account?.address) {
      setOrdersLoading(true);
      fetchBuyerOrders(account.address)
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
          <Link href="/" className="flex items-center gap-2 text-white/60 hover:text-white/80 transition-colors">
            <ArrowLeft size={18} />
            <span className="text-sm font-semibold">Back to Shop</span>
          </Link>
          <span className="font-bold text-sm" style={{ fontFamily: 'var(--font-display)' }}>
            Buyer Profile <span className="text-white/30">· Sui</span>
          </span>
          <ConnectButton />
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {!account ? (
          <motion.div className="flex flex-col items-center justify-center py-24 text-center"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="text-6xl mb-4">🔌</div>
            <h2 className="text-2xl font-black mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              Connect Your Wallet
            </h2>
            <p className="text-white/40 mb-6 max-w-sm">
              Connect your Slush wallet to view your buyer profile, stats, and order history.
            </p>
            <ConnectButton />
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
            {/* ── PROFILE STATS ── */}
            <div>
              <h1 className="text-3xl font-black mb-6" style={{ fontFamily: 'var(--font-display)' }}>
                Your Profile
              </h1>
              {statsLoading ? (
                <div className="flex items-center justify-center py-12 text-white/50">
                  <Loader2 size={20} className="animate-spin mr-2" />
                  <span>Loading your stats...</span>
                </div>
              ) : buyerStats ? (
                <BuyerProfileCard stats={buyerStats} />
              ) : (
                <div className="text-center py-12 text-white/40">
                  <p>No profile data available. Start shopping to build your profile!</p>
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
                  <span className="text-white/80 font-semibold">Sui Mainnet</span>
                </div>
              </div>
            </div>

            {/* ── ORDERS SUMMARY ── */}
            <div>
              <h2 className="text-lg font-black mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                Order Summary
              </h2>
              {ordersLoading ? (
                <div className="flex items-center justify-center py-12 text-white/50">
                  <Loader2 size={20} className="animate-spin mr-2" />
                  <span>Loading your orders...</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-4 rounded-2xl border border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <div className="text-3xl font-black text-blue-400 mb-2">{orders.length}</div>
                    <div className="text-xs text-white/40">Total Orders</div>
                  </div>
                  <div className="p-4 rounded-2xl border border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <div className="text-3xl font-black text-emerald-400 mb-2">
                      {orders.filter(o => o.status === 'COMPLETED').length}
                    </div>
                    <div className="text-xs text-white/40">Completed</div>
                  </div>
                  <div className="p-4 rounded-2xl border border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <div className="text-3xl font-black text-yellow-400 mb-2">
                      {orders.filter(o => o.status === 'PENDING').length}
                    </div>
                    <div className="text-xs text-white/40">Pending</div>
                  </div>
                  <div className="p-4 rounded-2xl border border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <div className="text-3xl font-black text-orange-400 mb-2">
                      ${orders.reduce((sum, o) => sum + (o.amountUsdc || 0), 0).toFixed(2)}
                    </div>
                    <div className="text-xs text-white/40">Total Spent</div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
