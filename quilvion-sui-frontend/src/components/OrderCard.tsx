'use client';
import { motion } from 'framer-motion';
import { Shield, AlertTriangle, CheckCircle, Clock, Loader2 } from 'lucide-react';

interface Order {
  id: number;
  productName: string;
  amountUsdc: number;
  status: string;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: any; label: string }> = {
  COMPLETED:       { color: '#10b981', bg: 'rgba(16,185,129,0.1)',  icon: CheckCircle, label: 'Completed' },
  PENDING:         { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  icon: Clock,        label: 'In Escrow' },
  DISPUTED:        { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   icon: AlertTriangle, label: 'Disputed' },
  CANCELLED:       { color: '#6b7280', bg: 'rgba(107,114,128,0.1)', icon: Clock,        label: 'Cancelled' },
  ESCROW_RELEASED: { color: '#4DA2FF', bg: 'rgba(77,162,255,0.1)',  icon: CheckCircle, label: 'Released' },
  REFUNDED:        { color: '#AB9FF2', bg: 'rgba(171,159,242,0.1)', icon: CheckCircle, label: 'Refunded' },
};

export function OrderCard({ order, onDispute, loading }: {
  order: Order;
  onDispute: () => void;
  loading: boolean;
}) {
  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.PENDING;

  return (
    <motion.div
      className="p-4 rounded-2xl border border-white/5 hover:border-white/10 transition-all"
      style={{ background: 'rgba(255,255,255,0.02)' }}
      whileHover={{ y: -1 }}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-white/30">Order #{order.id}</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ background: cfg.bg, color: cfg.color }}>
              <cfg.icon size={10} />
              {cfg.label}
            </span>
          </div>
          <h4 className="font-semibold text-white text-sm truncate">{order.productName}</h4>
          <p className="text-xs text-white/35 mt-0.5">{order.createdAt}</p>
        </div>

        <div className="text-right flex-shrink-0">
          <div className="font-black text-white text-sm">${order.amountUsdc}</div>
          <div className="text-xs text-white/30">USDC</div>
        </div>
      </div>

      {order.status === 'PENDING' && (
        <div className="mt-3 flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-white/35">
            <Shield size={11} className="text-yellow-400" />
            Funds locked in escrow — waiting for delivery
          </div>
          <button
            onClick={onDispute}
            disabled={loading}
            className="ml-auto flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:bg-red-500/20 disabled:opacity-40"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
            {loading ? <Loader2 size={11} className="animate-spin" /> : 'Raise Dispute'}
          </button>
        </div>
      )}
    </motion.div>
  );
}