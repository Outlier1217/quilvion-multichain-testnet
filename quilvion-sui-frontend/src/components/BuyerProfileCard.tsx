'use client';

import { motion } from 'framer-motion';
import { Zap, Trophy, TrendingUp, Gift } from 'lucide-react';

interface BuyerStats {
  xp: number;
  tier: string;
  dailySpent: number;
  dailyLimit: number;
  totalOrders: number;
  completedOrders: number;
}

const TIER_CONFIG: Record<string, { color: string; icon: string; threshold: number }> = {
  Bronze: { color: '#CD7F32', icon: '🥉', threshold: 0 },
  Silver: { color: '#C0C0C0', icon: '🥈', threshold: 100 },
  Gold: { color: '#FFD700', icon: '🥇', threshold: 500 },
};

export function BuyerProfileCard({ stats }: { stats: BuyerStats | null }) {
  if (!stats) return null;

  const tier = TIER_CONFIG[stats.tier] || TIER_CONFIG.Bronze;
  const nextThreshold = Object.values(TIER_CONFIG).find(t => t.threshold > stats.xp)?.threshold || 9999;
  const xpProgress = Math.min(100, (stats.xp / nextThreshold) * 100);

  return (
    <motion.div
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}>
      
      {/* XP Card */}
      <div className="p-4 rounded-2xl border border-white/10 hover:border-white/20 transition-colors"
        style={{ background: 'rgba(255,255,255,0.02)' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-white/40 uppercase tracking-wider font-semibold">Experience</span>
          <Zap size={14} className="text-yellow-400" />
        </div>
        <div className="text-2xl font-black text-white mb-2">{stats.xp}</div>
        <div className="text-xs text-white/40 mb-2">XP Points</div>
        <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
          <motion.div
            className="h-full"
            style={{ background: 'linear-gradient(90deg, #fbbf24, #f97316)' }}
            initial={{ width: 0 }}
            animate={{ width: `${xpProgress}%` }}
            transition={{ duration: 0.6 }}
          />
        </div>
        <div className="text-[10px] text-white/30 mt-1">{Math.floor(xpProgress)}% to next tier</div>
      </div>

      {/* Tier Card */}
      <div className="p-4 rounded-2xl border border-white/10 hover:border-white/20 transition-colors"
        style={{ background: 'rgba(255,255,255,0.02)' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-white/40 uppercase tracking-wider font-semibold">Tier</span>
          <Trophy size={14} style={{ color: tier.color }} />
        </div>
        <div className="text-4xl mb-1">{tier.icon}</div>
        <div className="text-xl font-black text-white" style={{ color: tier.color }}>
          {stats.tier}
        </div>
        <div className="text-xs text-white/40 mt-1">
          {stats.xp < nextThreshold ? `${nextThreshold - stats.xp} XP to next tier` : 'Max tier'}
        </div>
      </div>

      {/* Daily Spend Card */}
      <div className="p-4 rounded-2xl border border-white/10 hover:border-white/20 transition-colors"
        style={{ background: 'rgba(255,255,255,0.02)' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-white/40 uppercase tracking-wider font-semibold">Daily Limit</span>
          <TrendingUp size={14} className="text-blue-400" />
        </div>
        <div className="text-lg font-black text-white mb-2">
          ${stats.dailySpent.toFixed(2)} / ${stats.dailyLimit.toFixed(2)}
        </div>
        <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
          <motion.div
            className="h-full"
            style={{
              background: stats.dailySpent > stats.dailyLimit * 0.8
                ? 'linear-gradient(90deg, #f97316, #ef4444)'
                : 'linear-gradient(90deg, #10b981, #06b6d4)',
            }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, (stats.dailySpent / stats.dailyLimit) * 100)}%` }}
            transition={{ duration: 0.6 }}
          />
        </div>
        <div className="text-[10px] text-white/30 mt-1">
          {Math.max(0, stats.dailyLimit - stats.dailySpent).toFixed(2)} USDC remaining
        </div>
      </div>

      {/* Stats Card */}
      <div className="p-4 rounded-2xl border border-white/10 hover:border-white/20 transition-colors"
        style={{ background: 'rgba(255,255,255,0.02)' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-white/40 uppercase tracking-wider font-semibold">Activity</span>
          <Gift size={14} className="text-pink-400" />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40">Total Orders</span>
            <span className="text-sm font-bold text-white">{stats.totalOrders}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40">Completed</span>
            <span className="text-sm font-bold text-emerald-400">{stats.completedOrders}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40">Success Rate</span>
            <span className="text-sm font-bold text-blue-400">
              {stats.totalOrders > 0 ? Math.round((stats.completedOrders / stats.totalOrders) * 100) : 0}%
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
