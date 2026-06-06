'use client';

// ── Fix: declare window.ethereum for TypeScript ─────────────────────
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string }) => Promise<string[]>;
      on: (event: string, handler: (accounts: string[]) => void) => void;
    };
  }
}

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Coins, Loader2, CheckCircle, XCircle, X } from 'lucide-react';

const somniaTestnet = {
  id: 50312,
  name: 'Somnia Testnet',
  nativeCurrency: { name: 'STT', symbol: 'STT', decimals: 18 },
  rpcUrls: { default: { http: ['https://dream-rpc.somnia.network'] } },
} as const;

const MOCK_USDC_ADDRESS = '0xDbA3C917F0710869e9826F37c1e1ee0fcBa951ad' as `0x${string}`;

const MOCK_USDC_ABI = parseAbi([
  'function mint(address to, uint256 amount) external',
]);

const MINT_AMOUNTS = [
  { label: '100 USDC',  value: BigInt('100000000')  },
  { label: '500 USDC',  value: BigInt('500000000')  },
  { label: '1000 USDC', value: BigInt('1000000000') },
];

const OWNER_PRIVATE_KEY = process.env.NEXT_PUBLIC_OWNER_PRIVATE_KEY as `0x${string}`;
const ownerAccount = privateKeyToAccount(OWNER_PRIVATE_KEY);

const walletClient = createWalletClient({
  account: ownerAccount,
  chain: somniaTestnet,
  transport: http('https://dream-rpc.somnia.network'),
});

const publicClient = createPublicClient({
  chain: somniaTestnet,
  transport: http('https://dream-rpc.somnia.network'),
});

export function MintUsdc() {
  // ── Get connected address from MetaMask directly — no wagmi needed ──
  const [address, setAddress] = useState<string | null>(null);
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast]     = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    const getAddress = async () => {
      if (typeof window === 'undefined' || !window.ethereum) return;
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' }) as string[];
        if (accounts[0]) setAddress(accounts[0]);
      } catch {}
    };
    getAddress();

    // Listen for account changes
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        setAddress(accounts[0] ?? null);
      });
    }
  }, []);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 6000);
  };

  const handleMint = async (amount: bigint, label: string) => {
    if (!address) return;
    setLoading(true);
    setOpen(false);

    try {
      const txHash = await walletClient.writeContract({
        address: MOCK_USDC_ADDRESS,
        abi: MOCK_USDC_ABI,
        functionName: 'mint',
        args: [address as `0x${string}`, amount],
        account: ownerAccount,
        chain: somniaTestnet,
      });

      await publicClient.waitForTransactionReceipt({ hash: txHash });
      showToast('success', `${label} minted to your wallet!`);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message.split('\n')[0].slice(0, 120)
          : 'Mint failed';
      showToast('error', msg);
    } finally {
      setLoading(false);
    }
  };

  // Hide if wallet not connected
  if (!address) return null;

  return (
    <div className="relative">
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {toast && (
              <motion.div
                className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] max-w-sm w-full px-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
              >
                <div
                  className="flex items-center gap-3 p-3 rounded-2xl border text-sm"
                  style={{
                    background: toast.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    borderColor: toast.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)',
                  }}
                >
                  {toast.type === 'success'
                    ? <CheckCircle size={14} className="text-emerald-400 shrink-0" />
                    : <XCircle size={14} className="text-red-400 shrink-0" />}
                  <span className="text-white/70 flex-1 truncate">{toast.msg}</span>
                  <button onClick={() => setToast(null)}>
                    <X size={12} className="text-white/30 hover:text-white/60" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}

      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: 'rgba(16,185,129,0.12)',
            border: '1px solid rgba(16,185,129,0.25)',
            color: '#10b981',
          }}
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Coins size={12} />}
          {loading ? 'Minting...' : 'Get Test USDC'}
        </button>

        <AnimatePresence>
          {open && !loading && (
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