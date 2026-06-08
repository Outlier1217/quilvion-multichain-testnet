'use client';
import { motion } from 'framer-motion';
import { Shield, AlertTriangle, CheckCircle, Clock, Loader2, ExternalLink, Check, Package, Copy } from 'lucide-react';
import { useState } from 'react';
import { EVM_CONFIG } from '@/lib/evm/constants';

interface Order {
  id: number;
  productName: string;
  amountUsdc: number;
  status: string;
  createdAt: string;
  txDigest?: string;
  txHash?: string;
  merchantWallet?: string;
  riskScore?: number | null;
  deliveryInfo?: string | null;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: any; label: string }> = {
  COMPLETED:       { color: '#10b981', bg: 'rgba(16,185,129,0.1)',  icon: CheckCircle,   label: 'Completed' },
  PENDING:         { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  icon: Clock,         label: 'In Escrow' },
  DISPUTED:        { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   icon: AlertTriangle, label: 'Disputed' },
  CANCELLED:       { color: '#6b7280', bg: 'rgba(107,114,128,0.1)', icon: Clock,         label: 'Cancelled' },
  ESCROW_RELEASED: { color: '#4DA2FF', bg: 'rgba(77,162,255,0.1)',  icon: CheckCircle,   label: 'Released' },
  REFUNDED:        { color: '#AB9FF2', bg: 'rgba(171,159,242,0.1)', icon: CheckCircle,   label: 'Refunded' },
};

function isUrl(str: string) {
  try { return Boolean(new URL(str)); } catch { return false; }
}

export function OrderCard({ 
  order, 
  onDispute, 
  onRelease, 
  loading 
}: {
  order: Order;
  onDispute: () => void;
  onRelease?: (orderId: number) => void;
  loading: boolean;
}) {
  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.PENDING;
  const txUrl = order.txHash || order.txDigest;
  const explorerUrl = txUrl ? `${EVM_CONFIG.EXPLORER_BASE}/tx/${txUrl}` : null;
  const [copied, setCopied] = useState(false);
  const [accessCopied, setAccessCopied] = useState(false);

  const handleCopy = () => {
    if (!order.deliveryInfo) return;
    navigator.clipboard.writeText(order.deliveryInfo);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAccessOrder = () => {
    if (!order.deliveryInfo) return;

    if (isUrl(order.deliveryInfo) || order.deliveryInfo.startsWith('/')) {
      window.open(order.deliveryInfo, '_blank', 'noopener,noreferrer');
      return;
    }

    navigator.clipboard.writeText(order.deliveryInfo);
    setAccessCopied(true);
    setTimeout(() => setAccessCopied(false), 2000);
  };

  return (
    <motion.div
      className="p-4 rounded-2xl border border-white/5 hover:border-white/10 transition-all"
      style={{ background: 'rgba(255,255,255,0.02)' }}
      whileHover={{ y: -1 }}>

      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">

          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-white/30">Order #{order.id}</span>
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ background: cfg.bg, color: cfg.color }}>
              <cfg.icon size={10} />
              {cfg.label}
            </span>
          </div>

          <h4 className="font-semibold text-white text-sm truncate">{order.productName}</h4>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-white/35">{order.createdAt}</p>
            {order.riskScore !== null && order.riskScore !== undefined && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40 border border-white/5">
                Risk: {order.riskScore}
              </span>
            )}
          </div>

          {explorerUrl && (
            <button
              onClick={() => window.open(explorerUrl, '_blank')}
              className="inline-flex items-center gap-1 text-xs text-white/20 hover:text-blue-400 transition-colors mt-1">
              <ExternalLink size={10} />
              View on Explorer
            </button>
          )}
        </div>

        <div className="text-right flex-shrink-0">
          <div className="font-black text-white text-sm">${order.amountUsdc}</div>
          <div className="text-xs text-white/30">USDC</div>
        </div>
      </div>

      {/* ── DELIVERY INFO — only when order completed and deliveryInfo exists ── */}
      {(order.status === 'COMPLETED' || order.status === 'ESCROW_RELEASED' || order.status === 'REFUNDED') && order.deliveryInfo && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 p-3 rounded-xl border border-emerald-500/20"
          style={{ background: 'rgba(16,185,129,0.06)' }}>

          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Package size={11} className="text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-400">
                Delivery / Access Info
              </span>
            </div>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60 transition-colors">
              {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          {isUrl(order.deliveryInfo) ? (
            <a
              href={order.deliveryInfo}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors underline break-all">
              <ExternalLink size={10} className="flex-shrink-0 mt-0.5" />
              {order.deliveryInfo}
            </a>
          ) : (
            <p className="text-xs text-white/60 break-all leading-relaxed">
              {order.deliveryInfo}
            </p>
          )}
        </motion.div>
      )}

      {/* ── Completed without delivery info ── */}
      {(order.status === 'COMPLETED' || order.status === 'ESCROW_RELEASED' || order.status === 'REFUNDED') && !order.deliveryInfo && (
        <div className="mt-3 p-3 rounded-xl border border-white/5"
          style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div className="flex items-center gap-1.5 text-[10px] text-white/30">
            <CheckCircle size={11} className="text-emerald-400" />
            Order completed. Contact merchant for delivery details.
          </div>
        </div>
      )}

      {/* ── DISPUTED info ── */}
      {order.status === 'DISPUTED' && (
        <div className="mt-3 p-3 rounded-xl border border-red-500/15"
          style={{ background: 'rgba(239,68,68,0.05)' }}>
          <div className="flex items-center gap-1.5 text-[10px] text-red-400/70">
            <AlertTriangle size={11} />
            Dispute raised. Admin will resolve within 48 hours.
          </div>
        </div>
      )}

      {/* ── COMPLETED actions ── */}
      {(order.status === 'COMPLETED' || order.status === 'ESCROW_RELEASED' || order.status === 'REFUNDED') && (
        <div className="mt-4 pt-4 border-t border-white/5 flex flex-col sm:flex-row gap-2">
          {order.deliveryInfo ? (
            <button
              onClick={handleAccessOrder}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg,#4DA2FF,#6366f1)', color: '#fff' }}>
              <ExternalLink size={14} />
              {accessCopied ? 'Access Info Copied' : 'Access Order'}
            </button>
          ) : (
            <button
              disabled
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all opacity-50 cursor-not-allowed"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>
              <ExternalLink size={14} />
              Awaiting Merchant Info
            </button>
          )}

          <button
            onClick={onDispute}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all hover:bg-red-500/20 disabled:opacity-50"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
            Raise Dispute
          </button>
        </div>
      )}

      {/* ── Actions for PENDING Orders ── */}
      {order.status === 'PENDING' && (
        <div className="mt-4 pt-4 border-t border-white/5 flex flex-col sm:flex-row gap-2">
          <button
            onClick={onDispute}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all hover:bg-red-500/20 disabled:opacity-50"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
            Raise Dispute
          </button>
        </div>
      )}

      {/* ── Escrow info text ── */}
      {order.status === 'PENDING' && (
        <div className="mt-3 text-[10px] text-white/40 flex items-center gap-1.5">
          <Shield size={11} className="text-yellow-400" />
          Funds are in escrow. Release is admin-only on this contract.
        </div>
      )}
    </motion.div>
  );
}