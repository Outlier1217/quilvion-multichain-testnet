'use client';

import { motion } from 'framer-motion';
import { Info, AlertCircle, CheckCircle, Clock, Shield } from 'lucide-react';

interface OrderInfo {
  status: string;
  createdAt: string;
  amount: number;
  fee: number;
  riskScore?: number | null;
}

const STATUS_GUIDES: Record<string, { title: string; description: string; icon: any; color: string; bg: string }> = {
  PENDING: {
    title: 'Awaiting Action',
    description: 'Funds are locked in escrow. Admin will release upon delivery or buyer can dispute within 7 days.',
    icon: Clock,
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.06)',
  },
  COMPLETED: {
    title: 'Order Completed',
    description: 'Order was auto-completed. Merchant received payment minus platform fee. Check delivery info.',
    icon: CheckCircle,
    color: '#10b981',
    bg: 'rgba(16,185,129,0.06)',
  },
  DISPUTED: {
    title: 'Dispute Raised',
    description: 'Buyer raised a dispute. Admin is reviewing. Funds remain in escrow pending resolution.',
    icon: AlertCircle,
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.06)',
  },
  CANCELLED: {
    title: 'Order Cancelled',
    description: 'Order was cancelled and buyer received full refund.',
    icon: CheckCircle,
    color: '#6b7280',
    bg: 'rgba(107,114,128,0.06)',
  },
  ESCROW_RELEASED: {
    title: 'Released to Merchant',
    description: 'Escrow was released. Merchant received payment minus platform fee.',
    icon: CheckCircle,
    color: '#4DA2FF',
    bg: 'rgba(77,162,255,0.06)',
  },
  REFUNDED: {
    title: 'Refunded',
    description: 'Dispute was resolved in your favor. You received full refund.',
    icon: CheckCircle,
    color: '#ab9ff2',
    bg: 'rgba(171,159,242,0.06)',
  },
};

export function OrderInfoGuide({ orderInfo }: { orderInfo: OrderInfo }) {
  const guide = STATUS_GUIDES[orderInfo.status] || STATUS_GUIDES.PENDING;
  const Icon = guide.icon;

  const feeAmount = (orderInfo.fee / 1_000_000).toFixed(2);
  const merchantPayout = (orderInfo.amount - orderInfo.fee) / 1_000_000;

  return (
    <motion.div
      className="p-4 rounded-xl border border-white/5"
      style={{ background: guide.bg }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}>
      <div className="flex items-start gap-3">
        <Icon size={16} style={{ color: guide.color, marginTop: 2, flexShrink: 0 }} />
        <div className="flex-1">
          <div className="font-semibold text-sm" style={{ color: guide.color }}>
            {guide.title}
          </div>
          <p className="text-xs text-white/60 mt-1 leading-relaxed">
            {guide.description}
          </p>

          {/* Fee breakdown */}
          {orderInfo.status === 'COMPLETED' || orderInfo.status === 'ESCROW_RELEASED' ? (
            <div className="mt-3 space-y-1.5 text-xs text-white/50">
              <div className="flex items-center justify-between">
                <span>Order Amount:</span>
                <span className="text-white">${(orderInfo.amount / 1_000_000).toFixed(2)} USDC</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Platform Fee (2.5%):</span>
                <span className="text-orange-300">-${feeAmount} USDC</span>
              </div>
              <div className="flex items-center justify-between pt-1.5 border-t border-white/10">
                <span className="font-semibold">Merchant Receives:</span>
                <span className="text-emerald-300 font-semibold">${merchantPayout.toFixed(2)} USDC</span>
              </div>
            </div>
          ) : null}

          {/* Risk score */}
          {orderInfo.riskScore !== null && orderInfo.riskScore !== undefined ? (
            <div className="mt-3 flex items-center gap-2">
              <Shield size={12} className="text-blue-300" />
              <span className="text-xs text-blue-300">AI Risk Score: {orderInfo.riskScore}/100</span>
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
