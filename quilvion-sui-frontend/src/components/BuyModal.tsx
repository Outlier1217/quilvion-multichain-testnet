'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, AlertTriangle, Loader2, X, ChevronRight } from 'lucide-react';
import { type Product } from '@/lib/products';
import { getRiskScore, getFraudExplanation } from '@/lib/api';
import { RiskBadge } from './RiskBadge';

interface BuyModalProps {
  product: Product;
  walletAddress: string;
  onClose: () => void;
  onConfirm: (product: Product, usdcCoinId: string) => void;
  loading: boolean;
}

export function BuyModal({ product, walletAddress, onClose, onConfirm, loading }: BuyModalProps) {
  const [usdcCoinId, setUsdcCoinId] = useState('');
  const [riskData, setRiskData] = useState<any>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [riskLoading, setRiskLoading] = useState(true);
  const [explLoading, setExplLoading] = useState(false);
  const [step, setStep] = useState<'risk' | 'confirm'>('risk');

  // Fetch ML risk score on open
  useEffect(() => {
    const fetchRisk = async () => {
      setRiskLoading(true);
      try {
        const data = await getRiskScore({
          orderId: `preview_${product.id}_${Date.now()}`,
          buyerWallet: walletAddress,
          merchantWallet: product.merchantWallet,
          amountUsdc: product.priceUsdc,
          buyerWalletAgeDays: 45,
          buyerTotalOrders: 3,
        });
        setRiskData(data);

        // Fetch LLM explanation async (after score shows)
        setExplLoading(true);
        const expl = await getFraudExplanation({
          orderId: data.order_id,
          riskScore: data.risk_score,
          riskLevel: data.risk_level,
          signals: data.signals,
          amountUsdc: product.priceUsdc,
          buyerWallet: walletAddress,
          merchantWallet: product.merchantWallet,
          buyerWalletAgeDays: 45,
          buyerTotalOrders: 3,
        });
        setExplanation(expl.explanation);
      } catch {
        setRiskData({ risk_score: 0, risk_level: 'LOW', signals: [], auto_action: 'AUTO_COMPLETE' });
      } finally {
        setRiskLoading(false);
        setExplLoading(false);
      }
    };
    fetchRisk();
  }, [product, walletAddress]);

  const riskColor = (level: string) => {
    if (level === 'LOW') return '#10b981';
    if (level === 'MEDIUM') return '#f59e0b';
    if (level === 'HIGH') return '#ef4444';
    return '#dc2626';
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      <motion.div className="relative w-full max-w-md rounded-3xl border border-white/10 overflow-hidden"
        style={{ background: '#0a0a1a' }}
        initial={{ y: 80, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 80, opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}>

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{product.emoji}</span>
            <div>
              <h3 className="font-bold text-white text-sm">{product.name}</h3>
              <p className="text-xs text-white/40">${product.priceUsdc} USDC</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
            <X size={13} className="text-white/60" />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* ── AI Risk Assessment ── */}
          <div className="p-4 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">AI Risk Assessment</span>
              {riskLoading ? (
                <Loader2 size={14} className="text-white/30 animate-spin" />
              ) : riskData && (
                <RiskBadge score={riskData.risk_score} level={riskData.risk_level} />
              )}
            </div>

            {riskLoading ? (
              <div className="space-y-2">
                {[80, 60, 70].map((w, i) => (
                  <div key={i} className="h-2.5 rounded-full animate-pulse" style={{ width: `${w}%`, background: 'rgba(255,255,255,0.06)' }} />
                ))}
              </div>
            ) : riskData && (
              <>
                {/* Score bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-white/40">Risk Score</span>
                    <span className="font-bold" style={{ color: riskColor(riskData.risk_level) }}>
                      {riskData.risk_score}/100
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <motion.div className="h-full rounded-full"
                      style={{ background: riskColor(riskData.risk_level) }}
                      initial={{ width: 0 }}
                      animate={{ width: `${riskData.risk_score}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }} />
                  </div>
                </div>

                {/* Signals */}
                {riskData.signals?.length > 0 && (
                  <div className="space-y-1 mb-3">
                    {riskData.signals.slice(0, 2).map((s: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-white/40">
                        <span className="mt-0.5 text-yellow-400 flex-shrink-0">·</span>
                        {s}
                      </div>
                    ))}
                  </div>
                )}

                {/* LLM explanation */}
                {explLoading ? (
                  <div className="flex items-center gap-2 text-xs text-white/30">
                    <Loader2 size={11} className="animate-spin" />
                    AI generating explanation...
                  </div>
                ) : explanation && (
                  <p className="text-xs text-white/50 leading-relaxed border-t border-white/5 pt-3 mt-2">
                    {explanation}
                  </p>
                )}

                {/* Auto action */}
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <Shield size={11} className="text-emerald-400" />
                  <span className="text-emerald-400 font-medium">{riskData.auto_action}</span>
                  <span className="text-white/25">·</span>
                  <span className="text-white/35">
                    {riskData.auto_action === 'AUTO_COMPLETE' ? 'Instant delivery' : 'Held in escrow'}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* ── USDC Coin Object ID (required for tx) ── */}
          <div>
            <label className="text-xs text-white/40 mb-1.5 block">
              Your USDC Coin Object ID
              <span className="ml-1 text-white/25">(from sui client objects)</span>
            </label>
            <input
              value={usdcCoinId}
              onChange={e => setUsdcCoinId(e.target.value)}
              placeholder="0x..."
              className="w-full px-3 py-2.5 rounded-xl border border-white/8 text-sm outline-none font-mono"
              style={{ background: 'rgba(255,255,255,0.04)', color: '#fff' }}
            />
          </div>

          {/* ── Confirm button ── */}
          <button
            onClick={() => onConfirm(product, usdcCoinId)}
            disabled={loading || riskLoading || !usdcCoinId || riskData?.risk_score >= 75}
            className="w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg,#4DA2FF,#6366f1)' }}>
            {loading ? (
              <><Loader2 size={15} className="animate-spin" /> Processing...</>
            ) : riskData?.risk_score >= 75 ? (
              <><AlertTriangle size={15} /> Transaction Blocked — High Risk</>
            ) : (
              <>Confirm Purchase · ${product.priceUsdc} USDC <ChevronRight size={15} /></>
            )}
          </button>

          <p className="text-xs text-center text-white/20">
            {product.priceUsdc >= 100
              ? 'Funds held in escrow until merchant delivers'
              : 'Auto-completes on blockchain confirmation'}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}