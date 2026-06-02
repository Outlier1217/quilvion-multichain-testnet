'use client';

import { motion } from 'framer-motion';
import { Settings, Clock, Percent, DollarSign, AlertCircle } from 'lucide-react';

interface ProtocolConfig {
  platformFeeBps: number;
  adminApprovalThreshold: number;
  dailySpendLimit: number;
  refundWindowSeconds: number;
  verificationExpirySeconds: number;
}

const DEFAULT_CONFIG: ProtocolConfig = {
  platformFeeBps: 250,
  adminApprovalThreshold: 500,
  dailySpendLimit: 1000,
  refundWindowSeconds: 604800,
  verificationExpirySeconds: 31536000,
};

function formatSeconds(seconds: number): string {
  if (seconds >= 86400) {
    const days = Math.floor(seconds / 86400);
    return `${days} day${days > 1 ? 's' : ''}`;
  }
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  }
  const mins = Math.floor(seconds / 60);
  return `${mins} min${mins > 1 ? 's' : ''}`;
}

export function ProtocolConfigCard({ config = DEFAULT_CONFIG }: { config?: ProtocolConfig }) {
  const feeBps = config.platformFeeBps || DEFAULT_CONFIG.platformFeeBps;
  const feePercent = (feeBps / 100).toFixed(2);
  const threshold = (config.adminApprovalThreshold || DEFAULT_CONFIG.adminApprovalThreshold) / 1_000_000;
  const dailyLimit = (config.dailySpendLimit || DEFAULT_CONFIG.dailySpendLimit) / 1_000_000;
  const refundWindow = formatSeconds(config.refundWindowSeconds || DEFAULT_CONFIG.refundWindowSeconds);
  const verificationExpiry = formatSeconds(config.verificationExpirySeconds || DEFAULT_CONFIG.verificationExpirySeconds);

  const items = [
    {
      icon: Percent,
      label: 'Platform Fee',
      value: `${feePercent}%`,
      description: `${feeBps} basis points on settlement`,
      color: '#f59e0b',
    },
    {
      icon: DollarSign,
      label: 'Admin Approval Threshold',
      value: `$${threshold.toFixed(0)} USDC`,
      description: 'Orders above this require admin release',
      color: '#4DA2FF',
    },
    {
      icon: AlertCircle,
      label: 'Daily Spend Limit',
      value: `$${dailyLimit.toFixed(0)} USDC`,
      description: 'Per-wallet daily spend cap',
      color: '#ef4444',
    },
    {
      icon: Clock,
      label: 'Dispute Refund Window',
      value: refundWindow,
      description: 'Time to raise a dispute after order creation',
      color: '#8b5cf6',
    },
  ];

  return (
    <motion.div
      className="mt-8 p-6 rounded-2xl border border-white/10"
      style={{ background: 'rgba(255,255,255,0.02)' }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-center gap-2 mb-6">
        <Settings size={18} className="text-blue-400" />
        <h3 className="text-lg font-bold text-white">Protocol Configuration</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((item, i) => (
          <motion.div
            key={i}
            className="p-4 rounded-xl border border-white/5 hover:border-white/10 transition-colors"
            style={{ background: 'rgba(255,255,255,0.01)' }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}>
            <div className="flex items-start justify-between mb-2">
              <item.icon size={14} style={{ color: item.color }} />
            </div>
            <div className="text-xs text-white/40 font-semibold uppercase tracking-wider mb-1">
              {item.label}
            </div>
            <div className="text-sm font-bold text-white mb-1" style={{ color: item.color }}>
              {item.value}
            </div>
            <div className="text-xs text-white/30 leading-snug">
              {item.description}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-4 p-3 rounded-lg border border-emerald-500/20"
        style={{ background: 'rgba(16,185,129,0.06)' }}>
        <p className="text-xs text-emerald-300 leading-relaxed">
          ✅ <strong>Smart Protocol:</strong> Digital products under $500 USDC auto-complete instantly. 
          Larger orders require admin review. All funds are escrowed for buyer protection.
        </p>
      </div>
    </motion.div>
  );
}
