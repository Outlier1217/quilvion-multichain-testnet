'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { Coins, Loader2, CheckCircle, X, ChevronDown, ChevronUp } from 'lucide-react';
import { SUI_CONFIG } from '@/lib/sui/constants';

const MINT_AMOUNTS = [
  { label: '50 USDC',  value: 50_000_000 },
  { label: '100 USDC', value: 100_000_000 },
  { label: '500 USDC', value: 500_000_000 },
];

export function MintUsdc() {
  const account = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  const handleMint = (amountMicro: number, label: string) => {
    if (!account) return;
    setLoading(true);
    setSuccess(null);
    setError(null);

    const tx = new Transaction();
    // faucet_mint(faucet, amount) — no TreasuryCap needed, anyone can call
    tx.moveCall({
      target: `${SUI_CONFIG.PACKAGE_ID}::usdc::faucet_mint`,
      arguments: [
        tx.object(SUI_CONFIG.FAUCET),
        tx.pure.u64(amountMicro),
      ],
    });

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: (result) => {
          setSuccess(`✅ ${label} minted! Tx: ${result.digest.slice(0, 20)}...`);
          setLoading(false);
          setOpen(false);
        },
        onError: (err) => {
          setError(err.message.slice(0, 100));
          setLoading(false);
        },
      }
    );
  };

  if (!account) return null;

  return (
    <div className="relative">
      {/* Toast (rendered into document.body to avoid clipping/overflow issues) */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {(success || error) && (
            <motion.div
              className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-[9999] max-w-sm w-full px-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              <div className="flex items-center gap-3 p-3 rounded-2xl border text-sm"
                style={{
                  background: success ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                  borderColor: success ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)',
                }}>
                <CheckCircle size={14} className={success ? 'text-emerald-400' : 'text-red-400'} />
                <span className="text-white/70 flex-1 truncate">{success || error}</span>
                <button onClick={() => { setSuccess(null); setError(null); }}>
                  <X size={12} className="text-white/30 hover:text-white/60" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Button + dropdown */}
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:scale-105 disabled:opacity-50"
          style={{
            background: 'rgba(16,185,129,0.12)',
            border: '1px solid rgba(16,185,129,0.25)',
            color: '#10b981',
          }}
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Coins size={12} />}
          {loading ? 'Minting...' : 'Get Test USDC'}
          {!loading && (open ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              className="absolute top-full mt-2 right-0 rounded-2xl border border-white/10 overflow-hidden z-50"
              style={{ background: '#0d1020', minWidth: '170px' }}
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.96 }}
              transition={{ duration: 0.15 }}
            >
              <div className="px-3 py-2 border-b border-white/5">
                <p className="text-xs text-white/40">Testnet faucet — free</p>
              </div>
              {MINT_AMOUNTS.map((amt) => (
                <button
                  key={amt.label}
                  onClick={() => handleMint(amt.value, amt.label)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-white/70 hover:bg-white/5 hover:text-white transition-all"
                >
                  <span className="flex items-center gap-2">
                    <Coins size={11} className="text-emerald-400" />
                    {amt.label}
                  </span>
                  <span className="text-white/25">Mint →</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}