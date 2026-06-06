'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Package, Store, CheckCircle, XCircle,
  Clock, BarChart3, Trash2, RefreshCw, Lock,
  AlertTriangle, Scale, Settings, Edit2, X
} from 'lucide-react';
import { ConnectButton } from '@/components/ConnectButton';
import { useCurrentAccount, useWriteEvmContract, waitForTx } from '@/lib/evm/wallet';
import { readConfigFromChain, configsMatch, type OnChainConfig } from '@/lib/evm/readConfig';
import { API_BASE } from '@/lib/evm/constants';

const API = API_BASE;
const ADMIN_WALLET = '0x7072f9c4D9daE0D62B1C24f74BFFDd818Dc65F94';
const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET || 'quilvion-admin-2025';

function useAdminApi() {
  const headers = { 'Content-Type': 'application/json', 'x-admin-secret': ADMIN_SECRET };
  const request = async (path: string, init?: RequestInit) => {
    const res = await fetch(`${API}/api/admin${path}`, { ...init, headers });
    if (!res.ok) { const text = await res.text(); throw new Error(`Admin API error ${res.status}: ${text}`); }
    return res.json();
  };
  const get = (path: string) => request(path);
  const patch = (path: string, body: object) => request(path, { method: 'PATCH', body: JSON.stringify(body) });
  const del = (path: string) => request(path, { method: 'DELETE' });
  return { get, patch, del };
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    approved: { color: '#10b981', bg: 'rgba(16,185,129,0.12)', label: '✓ Approved' },
    pending:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  label: '⏳ Pending' },
    rejected: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   label: '✗ Rejected' },
  }[status] ?? { color: '#fff', bg: 'rgba(255,255,255,0.05)', label: status };
  return (
    <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
      style={{ background: config.bg, color: config.color }}>{config.label}</span>
  );
}

export default function AdminPanel() {
  const [authed, setAuthed]             = useState(false);
  const [tab, setTab]                   = useState<'stats'|'merchants'|'products'|'disputes'|'config'>('stats');
  const [stats, setStats]               = useState<any>(null);
  const [merchants, setMerchants]       = useState<any[]>([]);
  const [products, setProducts]         = useState<any[]>([]);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [loading, setLoading]           = useState(false);
  const [txLoading, setTxLoading]       = useState(false);
  const [editingConfig, setEditingConfig] = useState<string | null>(null);
  const [configValues, setConfigValues] = useState({
    platformFee: 250, dailySpendLimit: 1000,
    approvalThreshold: 500, refundWindow: 7, verificationExpiry: 1,
  });
  const [onChainConfig, setOnChainConfig]   = useState<OnChainConfig | null>(null);
  const [isSynced, setIsSynced]             = useState(true);
  const [loadingOnChain, setLoadingOnChain] = useState(false);
  const [toast, setToast]                   = useState<{ msg: string; ok: boolean } | null>(null);

  const account                  = useCurrentAccount();
  const { writeContractAsync }   = useWriteEvmContract();   // ✅ only one declaration
  const api                      = useAdminApi();

  useEffect(() => {
    const isAdminWallet = account?.address?.toLowerCase() === ADMIN_WALLET.toLowerCase();
    setAuthed(Boolean(isAdminWallet));
  }, [account?.address]);

  const handleDisconnect = async () => {
    // Reset auth state - ConnectButton will handle the actual wallet disconnection UI
    setAuthed(false);
    setStats(null);
    setMerchants([]);
    setProducts([]);
    setPendingOrders([]);
  };

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [s, m, p, cfg] = await Promise.all([
        api.get('/stats'),
        api.get('/merchants'),
        api.get('/products'),
        api.get('/configuration'),
      ]);
      setStats(s);
      setMerchants(m);
      setProducts(p);
      
      // Load configuration from database
      if (cfg) {
        setConfigValues({
          platformFee: cfg.platform_fee_bps,
          dailySpendLimit: cfg.daily_spend_limit_micro / 1_000_000, // Convert from micro-USDC
          approvalThreshold: cfg.admin_approval_threshold_micro / 1_000_000, // Convert from micro-USDC
          refundWindow: cfg.dispute_refund_window_seconds / 86_400, // Convert from seconds to days
          verificationExpiry: cfg.merchant_verification_expiry_seconds / 31_536_000, // Convert from seconds to years
        });
      }
      
      // Load on-chain config
      setLoadingOnChain(true);
      try {
        const chainConfig = await readConfigFromChain();
        setOnChainConfig(chainConfig);
        
        // Check if synced
        if (chainConfig && cfg) {
          const synced = configsMatch(
            chainConfig,
            cfg.platform_fee_bps,
            cfg.admin_approval_threshold_micro,
            cfg.daily_spend_limit_micro,
            cfg.dispute_refund_window_seconds,
            cfg.merchant_verification_expiry_seconds
          );
          setIsSynced(synced);
        }
      } catch (err) {
        console.error('Failed to load on-chain config:', err);
      } finally {
        setLoadingOnChain(false);
      }
      
      const orders = await api.get('/orders/pending');
      setPendingOrders(Array.isArray(orders) ? orders : []);
    } catch {
      showToast('Failed to load data', false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authed) loadAll();
  }, [authed]);

  const updateMerchant = async (id: number, status: string) => {
    await api.patch(`/merchants/${id}/status`, { status });
    showToast(`Merchant ${status}!`);
    loadAll();
  };

  const updateProduct = async (id: number, status: string) => {
    await api.patch(`/products/${id}/status`, { status });
    showToast(`Product ${status}!`);
    loadAll();
  };

  const deleteProduct = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    await api.del(`/products/${id}`);
    showToast('Product deleted!');
    loadAll();
  };

const handleResolveDispute = async (orderId: number) => {
    if (!account) return;
    setTxLoading(true);
    try {
      const COMMERCE_CORE = '0xA1fa19D58335b1341c5B8217E26C766fB605B1bA' as `0x${string}`;
      const ABI = [{ name: 'raiseDispute', type: 'function', inputs: [{ name: 'orderId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' }] as const;
      const txHash = await writeContractAsync({ address: COMMERCE_CORE, abi: ABI, functionName: 'raiseDispute', args: [BigInt(orderId)] });
      showToast('Tx sent! Waiting...');
      await waitForTx(txHash);
      showToast(`Dispute #${orderId} raised!`);
      loadAll();
    } catch (err: any) {
      showToast(err.shortMessage || err.message, false);
    } finally {
      setTxLoading(false);
    }
  };

  const handleReleaseEscrow = async (orderId: number) => {
    if (!account) return;
    setTxLoading(true);
    try {
      const ESCROW_LOGIC = '0xCE968012e486861B606Fe4790a2cf917695133c9' as `0x${string}`;
      const ABI = [{ name: 'releaseEscrow', type: 'function', inputs: [{ name: 'orderId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' }] as const;
      const txHash = await writeContractAsync({ address: ESCROW_LOGIC, abi: ABI, functionName: 'releaseEscrow', args: [BigInt(orderId)] });
      showToast('Tx sent! Waiting...');
      await waitForTx(txHash);
      showToast(`Escrow #${orderId} released!`);
      loadAll();
    } catch (err: any) {
      showToast(err.shortMessage || err.message, false);
    } finally {
      setTxLoading(false);
    }
  };

const updateConfigOnChain = async (configType: string) => {
  if (!account) {
    showToast('Wallet not connected', false);
    return;
  }

  const CONFIG_MANAGER = '0xbbb3907C31E127664f3E7dA49fF5Fe4c748f9A6c' as `0x${string}`;
  
  const ABI = [
    { name: 'setPlatformFee',            type: 'function', inputs: [{ name: 'bps',     type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
    { name: 'setDailySpendLimit',        type: 'function', inputs: [{ name: 'amount',  type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
    { name: 'setAdminApprovalThreshold', type: 'function', inputs: [{ name: 'amount',  type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
    { name: 'setRefundWindow',           type: 'function', inputs: [{ name: 'seconds_',type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  ] as const;

  setTxLoading(true);
  try {
    let functionName: string;
    let args: [bigint];

    switch (configType) {
      case 'platformFee':
        functionName = 'setPlatformFee';
        args = [BigInt(configValues.platformFee)];
        break;
      case 'dailySpendLimit':
        functionName = 'setDailySpendLimit';
        args = [BigInt(Math.round(configValues.dailySpendLimit * 1_000_000))];
        break;
      case 'approvalThreshold':
        functionName = 'setAdminApprovalThreshold';
        args = [BigInt(Math.round(configValues.approvalThreshold * 1_000_000))];
        break;
      case 'refundWindow':
        functionName = 'setRefundWindow';
        args = [BigInt(configValues.refundWindow * 86_400)];
        break;
      case 'verificationExpiry':
        // Not in contract — only DB update
        await api.patch('/configuration', {
          merchant_verification_expiry_seconds: configValues.verificationExpiry * 31_536_000,
        });
        showToast('Verification expiry updated (DB only)!');
        setEditingConfig(null);
        setTxLoading(false);
        loadAll();
        return;
      default:
        throw new Error('Unknown config type');
    }

    // ✅ Send real EVM transaction
    const txHash = await writeContractAsync({
      address: CONFIG_MANAGER,
      abi: ABI,
      functionName: functionName as any,
      args: args,
    });

    showToast(`Tx sent! Waiting for confirmation...`);

    // Wait for receipt
    const { createPublicClient, http } = await import('viem');
    const client = createPublicClient({
      transport: http('https://dream-rpc.somnia.network'),
    });
    await client.waitForTransactionReceipt({ hash: txHash });

    showToast(`✅ On-chain updated!`);

    // Now sync to DB
    const updatePayload: any = {};
    switch (configType) {
      case 'platformFee':
        updatePayload.platform_fee_bps = configValues.platformFee;
        break;
      case 'dailySpendLimit':
        updatePayload.daily_spend_limit_micro = Math.round(configValues.dailySpendLimit * 1_000_000);
        break;
      case 'approvalThreshold':
        updatePayload.admin_approval_threshold_micro = Math.round(configValues.approvalThreshold * 1_000_000);
        break;
      case 'refundWindow':
        updatePayload.dispute_refund_window_seconds = configValues.refundWindow * 86_400;
        break;
    }
    await api.patch('/configuration', updatePayload);

    setEditingConfig(null);
    loadAll();
  } catch (err: any) {
    console.error(err);
    showToast(`Failed: ${err.shortMessage || err.message}`, false);
  } finally {
    setTxLoading(false);
  }
};
  // ── Gate screen for non-admin wallets ────────────────────────────────────────
  if (!authed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-4"
        style={{ background: '#05050f' }}>
        
        {/* Main Gate Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md p-8 rounded-3xl border border-white/8"
          style={{ background: 'rgba(255,255,255,0.02)' }}>
          
          <div className="flex items-center gap-3 mb-6">
            <img src="/logo.png" alt="Quilvion" className="w-9 h-9 rounded-xl object-contain" />
            <div>
              <h1 className="font-black text-white text-base">Admin Panel</h1>
              <p className="text-xs text-white/35">Quilvion · Restricted Access</p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Connection Status */}
            {!account ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-white flex items-center gap-2">
                  <Lock size={14} /> Wallet Connection Required
                </p>
                <p className="text-xs text-white/50">
                  Connect the authorized admin wallet to access the dashboard.
                </p>
              </div>
            ) : account.address.toLowerCase() === ADMIN_WALLET.toLowerCase() ? (
              <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
                <p className="text-xs font-semibold text-emerald-300 flex items-center gap-2 mb-1">
                  <CheckCircle size={14} /> Admin Wallet Connected
                </p>
                <p className="text-xs text-emerald-300/60 font-mono break-all">
                  {account.address}
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-2xl border border-red-500/30 bg-red-500/10 space-y-2">
                <p className="text-xs font-semibold text-red-300 flex items-center gap-2">
                  <XCircle size={14} /> Access Denied
                </p>
                <p className="text-xs text-red-300/70 font-mono break-all">
                  Connected: {account.address}
                </p>
                <p className="text-xs text-red-300/60">
                  This wallet is not authorized. Please disconnect and connect the admin wallet instead.
                </p>
              </div>
            )}

            {/* Admin Wallet Info */}
            <div className="bg-blue-500/10 rounded-2xl p-4 border border-blue-500/20">
              <p className="text-xs font-semibold text-blue-300 mb-2">✓ Required Admin Wallet</p>
              <p className="text-xs text-blue-300/70 font-mono break-all">
                {ADMIN_WALLET}
              </p>
            </div>

            {/* Connect/Disconnect Buttons */}
            <div className="space-y-3">
              {!account ? (
                <div className="flex justify-center">
                  <div className="scale-125">
                    <ConnectButton />
                  </div>
                </div>
              ) : account.address.toLowerCase() !== ADMIN_WALLET.toLowerCase() ? (
                <div className="space-y-2">
                  <p className="text-xs text-center text-white/50 mb-2">
                    Wrong wallet connected. Switch to the admin wallet above.
                  </p>
                  <div className="flex justify-center mb-3">
                    <div className="scale-125">
                      <ConnectButton />
                    </div>
                  </div>
                  <button
                    onClick={handleDisconnect}
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all hover:scale-105 active:scale-95"
                    style={{
                      background: 'rgba(239,68,68,0.15)',
                      color: '#ef4444',
                      border: '1px solid rgba(239,68,68,0.3)'
                    }}>
                    🔌 Disconnect & Retry
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-center text-emerald-300 font-semibold mb-2">
                    ✓ You can now access the admin dashboard
                  </p>
                  <button
                    onClick={() => setAuthed(true)}
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all hover:scale-105 active:scale-95"
                    style={{
                      background: 'rgba(16,185,129,0.15)',
                      color: '#10b981',
                      border: '1px solid rgba(16,185,129,0.3)'
                    }}>
                    ✓ Enter Admin Dashboard
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all hover:scale-105 active:scale-95"
                    style={{
                      background: 'rgba(239,68,68,0.15)',
                      color: '#ef4444',
                      border: '1px solid rgba(239,68,68,0.3)'
                    }}>
                    🔌 Disconnect Wallet
                  </button>
                </div>
              )}
            </div>

            {/* Testnet Note */}
            <div className="p-3 rounded-2xl bg-yellow-500/10 border border-yellow-500/20">
              <p className="text-xs text-yellow-300 flex items-center gap-2">
                <AlertTriangle size={12} /> Make sure you're on Somnia Testnet
              </p>
            </div>
          </div>
        </motion.div>

        {/* Footer Note */}
        <div className="max-w-md text-center">
          <p className="text-xs text-white/40">
            🔐 Only the authorized admin wallet can access this panel
          </p>
        </div>
      </div>
    );
  }

  // ── Admin dashboard ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: '#05050f', color: '#fff' }}>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-2xl border text-sm font-semibold"
            initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
            style={{
              background: toast.ok ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
              borderColor: toast.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)',
              color: toast.ok ? '#10b981' : '#ef4444',
            }}>
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 backdrop-blur-xl"
        style={{ background: 'rgba(5,5,15,0.9)' }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Quilvion" className="w-8 h-8 rounded-lg object-contain" />
            <span className="font-black text-sm">
              Quilvion <span className="text-white/30 font-normal">· Admin</span>
            </span>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl border border-white/5"
            style={{ background: 'rgba(255,255,255,0.03)' }}>
            {[
              { id: 'stats',     icon: BarChart3, label: 'Overview' },
              { id: 'merchants', icon: Store,     label: `Merchants${stats ? ` (${stats.merchants.pending})` : ''}` },
              { id: 'products',  icon: Package,   label: `Products${stats ? ` (${stats.products.pending})` : ''}` },
              { id: 'disputes',  icon: AlertTriangle, label: 'Disputes' },
              { id: 'config',    icon: Settings,  label: 'Config' },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id as any)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: tab === t.id ? 'rgba(77,162,255,0.15)' : 'transparent',
                  color: tab === t.id ? '#4DA2FF' : 'rgba(255,255,255,0.4)',
                }}>
                <t.icon size={13} />
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={loadAll} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <div className="flex items-center gap-1 p-1 rounded-lg border border-white/10"
              style={{ background: 'rgba(255,255,255,0.02)' }}>
              <span className="text-xs text-white/40 px-2">
                {account?.address?.slice(0, 6)}...{account?.address?.slice(-4)}
              </span>
              <button 
                onClick={handleDisconnect}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105 active:scale-95"
                style={{ 
                  background: 'rgba(239,68,68,0.15)', 
                  color: '#ef4444',
                  border: '1px solid rgba(239,68,68,0.2)'
                }}
                title="Disconnect wallet and logout">
                <Lock size={11} /> Disconnect
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">

        {/* ── STATS TAB ── */}
        {tab === 'stats' && stats && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <h2 className="text-xl font-black">Platform Overview</h2>
            
            {/* Protocol Summary */}
            <div className="p-6 rounded-2xl border border-blue-500/20 bg-blue-500/5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div>
                  <p className="text-blue-300/60 mb-1">Network</p>
                  <p className="text-white/80 font-semibold">Somnia Testnet</p>
                </div>
                <div>
                  <p className="text-blue-300/60 mb-1">Token</p>
                  <p className="text-white/80 font-semibold">USDC (6 decimals)</p>
                </div>
                <div>
                  <p className="text-blue-300/60 mb-1">Package ID</p>
                  <p className="text-white/80 font-mono text-[10px] break-all">0xb6ee5d9...384a2c4</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Merchants', value: stats.merchants.total, color: '#4DA2FF', icon: Store },
                { label: 'Pending Merchants', value: stats.merchants.pending, color: '#f59e0b', icon: Clock },
                { label: 'Total Products', value: stats.products.total, color: '#AB9FF2', icon: Package },
                { label: 'Pending Products', value: stats.products.pending, color: '#f59e0b', icon: Clock },
                { label: 'Approved Merchants', value: stats.merchants.approved, color: '#10b981', icon: CheckCircle },
                { label: 'Approved Products', value: stats.products.approved, color: '#10b981', icon: CheckCircle },
                { label: 'Rejected Products', value: stats.products.rejected, color: '#ef4444', icon: XCircle },
              ].map((s, i) => (
                <motion.div key={s.label}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="p-4 rounded-2xl border border-white/5"
                  style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <s.icon size={14} style={{ color: s.color }} className="mb-2" />
                  <div className="text-2xl font-black" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-xs text-white/35 mt-0.5">{s.label}</div>
                </motion.div>
              ))}
            </div>

            {/* Quick pending alerts */}
            {(stats.merchants.pending > 0 || stats.products.pending > 0) && (
              <div className="p-4 rounded-2xl border border-yellow-400/20"
                style={{ background: 'rgba(245,158,11,0.06)' }}>
                <p className="text-sm text-yellow-300/80 font-semibold mb-2">⚠ Pending Reviews</p>
                <div className="flex gap-4 text-xs text-yellow-300/60">
                  {stats.merchants.pending > 0 && (
                    <button onClick={() => setTab('merchants')} className="hover:text-yellow-300 transition-colors">
                      {stats.merchants.pending} merchant{stats.merchants.pending > 1 ? 's' : ''} waiting →
                    </button>
                  )}
                  {stats.products.pending > 0 && (
                    <button onClick={() => setTab('products')} className="hover:text-yellow-300 transition-colors">
                      {stats.products.pending} product{stats.products.pending > 1 ? 's' : ''} waiting →
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Protocol Features */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl border border-white/5 bg-white/2">
                <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                  <Shield size={14} /> Core Features
                </h3>
                <ul className="text-xs text-white/60 space-y-1">
                  <li>✓ USDC Escrow Locking</li>
                  <li>✓ Role-Based Access Control</li>
                  <li>✓ Configurable Platform Fees</li>
                  <li>✓ Dispute Resolution System</li>
                  <li>✓ AI Fraud Scoring (BOT)</li>
                  <li>✓ Reputation & Badges</li>
                </ul>
              </div>
              <div className="p-4 rounded-2xl border border-white/5 bg-white/2">
                <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                  <Scale size={14} /> Fee Model
                </h3>
                <ul className="text-xs text-white/60 space-y-1">
                  <li>Platform Fee: <span className="text-white/80 font-semibold">2.5%</span> (250 bps)</li>
                  <li>Threshold: <span className="text-white/80 font-semibold">500 USDC</span> (admin release)</li>
                  <li>Daily Spend Cap: <span className="text-white/80 font-semibold">1,000 USDC</span></li>
                  <li>Dispute Window: <span className="text-white/80 font-semibold">7 days</span></li>
                </ul>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── MERCHANTS TAB ── */}
        {tab === 'merchants' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <h2 className="text-xl font-black">Merchants
              <span className="ml-2 text-sm font-normal text-white/30">({merchants.length} total)</span>
            </h2>

            {merchants.length === 0 ? (
              <div className="text-center py-16 text-white/25">
                <Store size={36} className="mx-auto mb-3 opacity-30" />
                <p>No merchants yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {merchants.map((m, i) => (
                  <motion.div key={m.id}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="p-5 rounded-2xl border border-white/5 hover:border-white/10 transition-all"
                    style={{ background: 'rgba(255,255,255,0.02)' }}>

                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-white">{m.company_name}</h3>
                          <StatusBadge status={m.status} />
                        </div>
                        <p className="text-xs text-white/40 mb-1">{m.category} · {m.contact_email}</p>
                        <p className="text-xs text-white/30 font-mono truncate">{m.wallet_address}</p>
                        <p className="text-xs text-white/40 mt-2 line-clamp-2">{m.description}</p>
                        <p className="text-xs text-white/20 mt-1">{m.created_at?.split('T')[0]}</p>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        {m.status !== 'approved' && (
                          <button onClick={() => updateMerchant(m.id, 'approved')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all hover:scale-105"
                            style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
                            <CheckCircle size={12} /> Approve
                          </button>
                        )}
                        {m.status !== 'rejected' && (
                          <button onClick={() => updateMerchant(m.id, 'rejected')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all hover:scale-105"
                            style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                            <XCircle size={12} /> Reject
                          </button>
                        )}
                        {m.status !== 'pending' && (
                          <button onClick={() => updateMerchant(m.id, 'pending')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all hover:scale-105"
                            style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
                            <Clock size={12} /> Pending
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── PRODUCTS TAB ── */}
        {tab === 'products' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <h2 className="text-xl font-black">Products
              <span className="ml-2 text-sm font-normal text-white/30">({products.length} total)</span>
            </h2>

            {products.length === 0 ? (
              <div className="text-center py-16 text-white/25">
                <Package size={36} className="mx-auto mb-3 opacity-30" />
                <p>No products yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {products.map((p, i) => (
                  <motion.div key={p.id}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="p-5 rounded-2xl border border-white/5 hover:border-white/10 transition-all"
                    style={{ background: 'rgba(255,255,255,0.02)' }}>

                    <div className="flex items-start gap-4">
                      {/* Image / Emoji */}
                      <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center text-2xl"
                        style={{ background: 'rgba(255,255,255,0.05)' }}>
                        {p.images && p.images.length > 0 && p.images[0]
                          ? <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />
                          : p.emoji
                        }
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-white">{p.name}</h3>
                          <StatusBadge status={p.status} />
                        </div>
                        <p className="text-xs text-white/40 mb-1">
                          {p.category} · <span className="font-bold text-white">${p.price_usdc} USDC</span>
                        </p>
                        <p className="text-xs text-white/35">
                          by <span className="text-white/60">{p.merchant_name}</span>
                        </p>
                        <p className="text-xs text-white/30 mt-1.5 line-clamp-2">{p.description}</p>

                        {/* Tags */}
                        {p.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {p.tags.slice(0, 3).map((tag: string) => (
                              <span key={tag} className="text-xs px-2 py-0.5 rounded-full"
                                style={{ background: 'rgba(77,162,255,0.08)', color: '#4DA2FF' }}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        <p className="text-xs text-white/20 mt-2">{p.created_at?.split('T')[0]}</p>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        {p.status !== 'approved' && (
                          <button onClick={() => updateProduct(p.id, 'approved')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all hover:scale-105"
                            style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
                            <CheckCircle size={12} /> Approve
                          </button>
                        )}
                        {p.status !== 'rejected' && (
                          <button onClick={() => updateProduct(p.id, 'rejected')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all hover:scale-105"
                            style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                            <XCircle size={12} /> Reject
                          </button>
                        )}
                        {p.status !== 'pending' && (
                          <button onClick={() => updateProduct(p.id, 'pending')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all hover:scale-105"
                            style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
                            <Clock size={12} /> Pending
                          </button>
                        )}
                        <button onClick={() => deleteProduct(p.id, p.name)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all hover:scale-105"
                          style={{ background: 'rgba(239,68,68,0.06)', color: 'rgba(239,68,68,0.6)' }}>
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── DISPUTES TAB ── */}
        {tab === 'disputes' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <h2 className="text-xl font-black">Pending Escrow Orders</h2>
            <div className="p-4 rounded-2xl border border-white/5 bg-white/2 text-sm text-white/40">
              These are real DB-backed escrow orders waiting for admin action.
            </div>
            {pendingOrders.length === 0 ? (
              <div className="p-5 rounded-2xl border border-white/5 bg-white/2 text-sm text-white/35">
                No pending escrow orders right now.
              </div>
            ) : (
              <div className="space-y-3">
                {pendingOrders.map(order => (
                  <div key={order.id} className="p-5 rounded-2xl border border-white/5 bg-white/2">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <h3 className="font-bold text-white">Order #{order.id}</h3>
                        <p className="text-xs text-white/40">{order.product_name}</p>
                        <p className="text-xs text-white/35 mt-1 font-mono break-all">Buyer: {order.buyer_wallet}</p>
                        <p className="text-xs text-white/35 mt-0.5 font-mono break-all">Merchant: {order.merchant_wallet}</p>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-white">${order.amount_usdc}</div>
                        <div className="text-xs text-white/30">USDC</div>
                        {order.risk_score !== null && order.risk_score !== undefined && (
                          <div className="text-[10px] mt-1 text-white/30">Risk: {order.risk_score}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button onClick={() => handleReleaseEscrow(order.id)} disabled={txLoading}
                        className="flex-1 py-2 rounded-xl bg-emerald-500/15 text-emerald-300 text-xs font-bold border border-emerald-500/20 hover:bg-emerald-500/25 transition-all">
                        Release Escrow
                      </button>
                      <button onClick={() => handleResolveDispute(order.id)} disabled={txLoading}
                        className="flex-1 py-2 rounded-xl bg-blue-500/15 text-blue-300 text-xs font-bold border border-blue-500/20 hover:bg-blue-500/25 transition-all">
                        Raise Dispute
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── CONFIG TAB ── */}
        {tab === 'config' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <h2 className="text-xl font-black">Protocol Configuration</h2>
            <div className="p-4 rounded-2xl border border-blue-500/20 bg-blue-500/5">
              <p className="text-xs text-blue-300 flex items-center gap-2">
                <AlertTriangle size={12} /> Click Edit to update parameters directly on-chain
              </p>
            </div>
            
            {/* Sync Status */}
            <div className={`p-4 rounded-2xl border flex items-center justify-between ${
              isSynced 
                ? 'border-emerald-500/20 bg-emerald-500/5' 
                : 'border-rose-500/20 bg-rose-500/5'
            }`}>
              <div className="flex items-center gap-2">
                {isSynced ? (
                  <>
                    <CheckCircle size={16} className="text-emerald-400" />
                    <span className="text-xs text-emerald-300">✓ Database & On-Chain Synced</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={16} className="text-rose-400" />
                    <span className="text-xs text-rose-300">⚠ Database & On-Chain Out of Sync</span>
                  </>
                )}
              </div>
              <button
                onClick={() => loadAll()}
                disabled={loading || loadingOnChain}
                className="p-1 rounded-lg hover:bg-white/5 transition-all disabled:opacity-50"
              >
                <RefreshCw size={14} className={`${loadingOnChain ? 'animate-spin' : ''} text-white/40`} />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Platform Fee */}
              <div className="p-6 rounded-2xl border border-white/5 bg-white/2">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Settings size={18} className="text-amber-400" />
                    <h3 className="font-bold text-white">Platform Fee</h3>
                  </div>
                  <button
                    onClick={() => setEditingConfig('platformFee')}
                    className="p-2 rounded-lg hover:bg-white/5 transition-all"
                    title="Edit"
                  >
                    <Edit2 size={14} className="text-white/40 hover:text-amber-400" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-white/40 mb-2">Database Value</p>
                    <p className="text-2xl font-black text-amber-300">{(configValues.platformFee / 100).toFixed(2)}%</p>
                    <p className="text-xs text-white/30">{configValues.platformFee} basis points</p>
                  </div>
                  {onChainConfig && (
                    <div className="pt-3 border-t border-white/10">
                      <p className="text-xs text-white/40 mb-2">On-Chain Value</p>
                      <p className="text-2xl font-black text-amber-200">{(onChainConfig.platformFeeBps / 100).toFixed(2)}%</p>
                      <p className="text-xs text-white/30">{onChainConfig.platformFeeBps} basis points</p>
                      {onChainConfig.platformFeeBps === configValues.platformFee && (
                        <span className="text-[10px] text-emerald-400 mt-1 inline-block">✓ Synced</span>
                      )}
                    </div>
                  )}
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <p className="text-xs text-amber-300">
                      Deducted on settlement. Example: 150 USDC order → 3.75 USDC fee, 146.25 USDC merchant payout
                    </p>
                  </div>
                </div>
              </div>

              {/* Admin Approval Threshold */}
              <div className="p-6 rounded-2xl border border-white/5 bg-white/2">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Shield size={18} className="text-purple-400" />
                    <h3 className="font-bold text-white">Admin Approval Threshold</h3>
                  </div>
                  <button
                    onClick={() => setEditingConfig('approvalThreshold')}
                    className="p-2 rounded-lg hover:bg-white/5 transition-all"
                    title="Edit"
                  >
                    <Edit2 size={14} className="text-white/40 hover:text-purple-400" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-white/40 mb-2">Database Value</p>
                    <p className="text-2xl font-black text-purple-300">{configValues.approvalThreshold.toLocaleString()} USDC</p>
                    <p className="text-xs text-white/30">{(configValues.approvalThreshold * 1_000_000).toLocaleString()} micro-units</p>
                  </div>
                  {onChainConfig && (
                    <div className="pt-3 border-t border-white/10">
                      <p className="text-xs text-white/40 mb-2">On-Chain Value</p>
                      <p className="text-2xl font-black text-purple-200">{(onChainConfig.adminApprovalThresholdMicro / 1_000_000).toLocaleString()} USDC</p>
                      <p className="text-xs text-white/30">{onChainConfig.adminApprovalThresholdMicro.toLocaleString()} micro-units</p>
                      {onChainConfig.adminApprovalThresholdMicro === configValues.approvalThreshold * 1_000_000 && (
                        <span className="text-[10px] text-emerald-400 mt-1 inline-block">✓ Synced</span>
                      )}
                    </div>
                  )}
                  <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <p className="text-xs text-purple-300">
                      Orders above this amount require admin release before settlement
                    </p>
                  </div>
                </div>
              </div>

              {/* Daily Spend Limit */}
              <div className="p-6 rounded-2xl border border-white/5 bg-white/2">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Clock size={18} className="text-cyan-400" />
                    <h3 className="font-bold text-white">Daily Spend Limit</h3>
                  </div>
                  <button
                    onClick={() => setEditingConfig('dailySpendLimit')}
                    className="p-2 rounded-lg hover:bg-white/5 transition-all"
                    title="Edit"
                  >
                    <Edit2 size={14} className="text-white/40 hover:text-cyan-400" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-white/40 mb-2">Database Value</p>
                    <p className="text-2xl font-black text-cyan-300">{configValues.dailySpendLimit.toLocaleString()} USDC</p>
                    <p className="text-xs text-white/30">Per wallet, per 24 hours</p>
                  </div>
                  {onChainConfig && (
                    <div className="pt-3 border-t border-white/10">
                      <p className="text-xs text-white/40 mb-2">On-Chain Value</p>
                      <p className="text-2xl font-black text-cyan-200">{(onChainConfig.dailySpendLimitMicro / 1_000_000).toLocaleString()} USDC</p>
                      <p className="text-xs text-white/30">Per wallet, per 24 hours</p>
                      {onChainConfig.dailySpendLimitMicro === configValues.dailySpendLimit * 1_000_000 && (
                        <span className="text-[10px] text-emerald-400 mt-1 inline-block">✓ Synced</span>
                      )}
                    </div>
                  )}
                  <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                    <p className="text-xs text-cyan-300">
                      Max USDC a wallet may spend across all orders in 24 hours
                    </p>
                  </div>
                </div>
              </div>

              {/* Refund Window */}
              <div className="p-6 rounded-2xl border border-white/5 bg-white/2">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <AlertTriangle size={18} className="text-orange-400" />
                    <h3 className="font-bold text-white">Dispute Refund Window</h3>
                  </div>
                  <button
                    onClick={() => setEditingConfig('refundWindow')}
                    className="p-2 rounded-lg hover:bg-white/5 transition-all"
                    title="Edit"
                  >
                    <Edit2 size={14} className="text-white/40 hover:text-orange-400" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-white/40 mb-2">Database Value</p>
                    <p className="text-2xl font-black text-orange-300">{configValues.refundWindow} Days</p>
                    <p className="text-xs text-white/30">{(configValues.refundWindow * 86_400).toLocaleString()} seconds</p>
                  </div>
                  {onChainConfig && (
                    <div className="pt-3 border-t border-white/10">
                      <p className="text-xs text-white/40 mb-2">On-Chain Value</p>
                      <p className="text-2xl font-black text-orange-200">{(onChainConfig.disputeRefundWindowSeconds / 86_400).toLocaleString()} Days</p>
                      <p className="text-xs text-white/30">{onChainConfig.disputeRefundWindowSeconds.toLocaleString()} seconds</p>
                      {onChainConfig.disputeRefundWindowSeconds === configValues.refundWindow * 86_400 && (
                        <span className="text-[10px] text-emerald-400 mt-1 inline-block">✓ Synced</span>
                      )}
                    </div>
                  )}
                  <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                    <p className="text-xs text-orange-300">
                      Time after order creation during which buyer may raise a dispute
                    </p>
                  </div>
                </div>
              </div>

              {/* Merchant Verification Expiry */}
              <div className="p-6 rounded-2xl border border-white/5 bg-white/2">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle size={18} className="text-emerald-400" />
                    <h3 className="font-bold text-white">Verification Expiry</h3>
                  </div>
                  <button
                    onClick={() => setEditingConfig('verificationExpiry')}
                    className="p-2 rounded-lg hover:bg-white/5 transition-all"
                    title="Edit"
                  >
                    <Edit2 size={14} className="text-white/40 hover:text-emerald-400" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-white/40 mb-2">Database Value</p>
                    <p className="text-2xl font-black text-emerald-300">{configValues.verificationExpiry} Year{configValues.verificationExpiry !== 1 ? 's' : ''}</p>
                    <p className="text-xs text-white/30">{(configValues.verificationExpiry * 31_536_000).toLocaleString()} seconds</p>
                  </div>
                  {onChainConfig && (
                    <div className="pt-3 border-t border-white/10">
                      <p className="text-xs text-white/40 mb-2">On-Chain Value</p>
                      <p className="text-2xl font-black text-emerald-200">{(onChainConfig.merchantVerificationExpirySeconds / 31_536_000).toLocaleString()} Year{(onChainConfig.merchantVerificationExpirySeconds / 31_536_000) !== 1 ? 's' : ''}</p>
                      <p className="text-xs text-white/30">{onChainConfig.merchantVerificationExpirySeconds.toLocaleString()} seconds</p>
                      {onChainConfig.merchantVerificationExpirySeconds === configValues.verificationExpiry * 31_536_000 && (
                        <span className="text-[10px] text-emerald-400 mt-1 inline-block">✓ Synced</span>
                      )}
                    </div>
                  )}
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-xs text-emerald-300">
                      Duration for which a merchant verification badge remains valid
                    </p>
                  </div>
                </div>
              </div>

              {/* Treasury Status */}
              <div className="p-6 rounded-2xl border border-white/5 bg-white/2">
                <div className="flex items-center gap-3 mb-4">
                  <Package size={18} className="text-rose-400" />
                  <h3 className="font-bold text-white">Treasury Balance</h3>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-white/40 mb-1">Accumulated Fees</p>
                    <p className="text-2xl font-black text-rose-300">—</p>
                    <p className="text-xs text-white/30 mt-0.5">Live sync coming soon</p>
                  </div>
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                    <p className="text-xs text-rose-300">
                      Platform fees accumulate here and can be withdrawn by admins
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Configuration Update Guide */}
            <div className="p-6 rounded-2xl border border-white/5 bg-white/2">
              <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                <Settings size={16} /> How to Update Configuration
              </h3>
              <div className="space-y-2 text-xs text-white/60">
                <p>
                  Click the Edit button (✏️) on any parameter card to update it directly on-chain via a signed transaction.
                </p>
                <p className="mt-3 pt-3 border-t border-white/10">
                  All updates require <span className="text-blue-300">ADMIN_ROLE</span>. ConfigManager: <span className="text-white/40 font-mono text-[10px]">0xbbb3907C31E127664f3E7dA49fF5Fe4c748f9A6c</span>

                </p>
              </div>
            </div>

            {/* Role Requirements */}
            <div className="p-6 rounded-2xl border border-white/5 bg-white/2">
              <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                <Shield size={16} /> Role-Based Permissions
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <p className="text-blue-300 font-semibold mb-1">DEFAULT_ADMIN_ROLE</p>
                  <p className="text-blue-300/60">Grant/revoke any role • Deployer privileges</p>
                </div>
                <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <p className="text-purple-300 font-semibold mb-1">ADMIN_ROLE</p>
                  <p className="text-purple-300/60">Update config • Release escrow • Resolve disputes • Withdraw treasury</p>
                </div>
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <p className="text-amber-300 font-semibold mb-1">BOT_ROLE</p>
                  <p className="text-amber-300/60">Write AI fraud risk scores on orders</p>
                </div>
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-emerald-300 font-semibold mb-1">MERCHANT_ROLE</p>
                  <p className="text-emerald-300/60">Deliver digital products • Mark orders with verified badge</p>
                </div>
              </div>
            </div>

            {/* Edit Modals */}
            <AnimatePresence>
              {/* Platform Fee Modal */}
              {editingConfig === 'platformFee' && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                  onClick={() => setEditingConfig(null)}
                >
                  <motion.div
                    initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white/2 border border-white/5 rounded-3xl p-6 max-w-md w-full"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-white flex items-center gap-2">
                        <Settings size={18} className="text-amber-400" />
                        Update Platform Fee
                      </h3>
                      <button
                        onClick={() => setEditingConfig(null)}
                        className="p-1 hover:bg-white/5 rounded-lg transition-all"
                      >
                        <X size={18} className="text-white/40" />
                      </button>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs text-white/40 block mb-2">Basis Points (0-10,000)</label>
                        <input
                          type="number"
                          value={configValues.platformFee}
                          onChange={(e) => setConfigValues({ ...configValues, platformFee: Math.min(10000, Math.max(0, parseInt(e.target.value) || 0)) })}
                          className="w-full px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-white"
                          min="0"
                          max="10000"
                        />
                        <p className="text-xs text-white/30 mt-1">
                          {(configValues.platformFee / 100).toFixed(2)}%
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfigValues({ ...configValues, platformFee: 100 })}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-blue-500/10 text-blue-300 hover:bg-blue-500/20"
                        >
                          1%
                        </button>
                        <button
                          onClick={() => setConfigValues({ ...configValues, platformFee: 250 })}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-blue-500/10 text-blue-300 hover:bg-blue-500/20"
                        >
                          2.5%
                        </button>
                        <button
                          onClick={() => setConfigValues({ ...configValues, platformFee: 300 })}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-blue-500/10 text-blue-300 hover:bg-blue-500/20"
                        >
                          3%
                        </button>
                        <button
                          onClick={() => setConfigValues({ ...configValues, platformFee: 500 })}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-blue-500/10 text-blue-300 hover:bg-blue-500/20"
                        >
                          5%
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingConfig(null)}
                          className="flex-1 py-2 rounded-xl bg-white/5 text-white/40 font-bold hover:bg-white/10"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => updateConfigOnChain('platformFee')}
                          disabled={txLoading}
                          className="flex-1 py-2 rounded-xl bg-amber-500/15 text-amber-300 font-bold hover:bg-amber-500/25 disabled:opacity-50"
                        >
                          {txLoading ? 'Updating...' : 'Update On-Chain'}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}

              {/* Daily Spend Limit Modal */}
              {editingConfig === 'dailySpendLimit' && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                  onClick={() => setEditingConfig(null)}
                >
                  <motion.div
                    initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white/2 border border-white/5 rounded-3xl p-6 max-w-md w-full"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-white flex items-center gap-2">
                        <Clock size={18} className="text-cyan-400" />
                        Update Daily Spend Limit
                      </h3>
                      <button
                        onClick={() => setEditingConfig(null)}
                        className="p-1 hover:bg-white/5 rounded-lg transition-all"
                      >
                        <X size={18} className="text-white/40" />
                      </button>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs text-white/40 block mb-2">Daily Limit (USDC)</label>
                        <input
                          type="number"
                          value={configValues.dailySpendLimit}
                          onChange={(e) => setConfigValues({ ...configValues, dailySpendLimit: Math.max(1, parseInt(e.target.value) || 0) })}
                          className="w-full px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-white"
                          min="1"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfigValues({ ...configValues, dailySpendLimit: 500 })}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
                        >
                          500
                        </button>
                        <button
                          onClick={() => setConfigValues({ ...configValues, dailySpendLimit: 1000 })}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
                        >
                          1000
                        </button>
                        <button
                          onClick={() => setConfigValues({ ...configValues, dailySpendLimit: 2000 })}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
                        >
                          2000
                        </button>
                        <button
                          onClick={() => setConfigValues({ ...configValues, dailySpendLimit: 5000 })}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
                        >
                          5000
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingConfig(null)}
                          className="flex-1 py-2 rounded-xl bg-white/5 text-white/40 font-bold hover:bg-white/10"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => updateConfigOnChain('dailySpendLimit')}
                          disabled={txLoading}
                          className="flex-1 py-2 rounded-xl bg-cyan-500/15 text-cyan-300 font-bold hover:bg-cyan-500/25 disabled:opacity-50"
                        >
                          {txLoading ? 'Updating...' : 'Update On-Chain'}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}

              {/* Approval Threshold Modal */}
              {editingConfig === 'approvalThreshold' && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                  onClick={() => setEditingConfig(null)}
                >
                  <motion.div
                    initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white/2 border border-white/5 rounded-3xl p-6 max-w-md w-full"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-white flex items-center gap-2">
                        <Shield size={18} className="text-purple-400" />
                        Update Approval Threshold
                      </h3>
                      <button
                        onClick={() => setEditingConfig(null)}
                        className="p-1 hover:bg-white/5 rounded-lg transition-all"
                      >
                        <X size={18} className="text-white/40" />
                      </button>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs text-white/40 block mb-2">Approval Threshold (USDC)</label>
                        <input
                          type="number"
                          value={configValues.approvalThreshold}
                          onChange={(e) => setConfigValues({ ...configValues, approvalThreshold: Math.max(1, parseInt(e.target.value) || 0) })}
                          className="w-full px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-white"
                          min="1"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfigValues({ ...configValues, approvalThreshold: 100 })}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-purple-500/10 text-purple-300 hover:bg-purple-500/20"
                        >
                          100
                        </button>
                        <button
                          onClick={() => setConfigValues({ ...configValues, approvalThreshold: 500 })}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-purple-500/10 text-purple-300 hover:bg-purple-500/20"
                        >
                          500
                        </button>
                        <button
                          onClick={() => setConfigValues({ ...configValues, approvalThreshold: 1000 })}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-purple-500/10 text-purple-300 hover:bg-purple-500/20"
                        >
                          1000
                        </button>
                        <button
                          onClick={() => setConfigValues({ ...configValues, approvalThreshold: 5000 })}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-purple-500/10 text-purple-300 hover:bg-purple-500/20"
                        >
                          5000
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingConfig(null)}
                          className="flex-1 py-2 rounded-xl bg-white/5 text-white/40 font-bold hover:bg-white/10"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => updateConfigOnChain('approvalThreshold')}
                          disabled={txLoading}
                          className="flex-1 py-2 rounded-xl bg-purple-500/15 text-purple-300 font-bold hover:bg-purple-500/25 disabled:opacity-50"
                        >
                          {txLoading ? 'Updating...' : 'Update On-Chain'}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}

              {/* Refund Window Modal */}
              {editingConfig === 'refundWindow' && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                  onClick={() => setEditingConfig(null)}
                >
                  <motion.div
                    initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white/2 border border-white/5 rounded-3xl p-6 max-w-md w-full"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-white flex items-center gap-2">
                        <AlertTriangle size={18} className="text-orange-400" />
                        Update Dispute Window
                      </h3>
                      <button
                        onClick={() => setEditingConfig(null)}
                        className="p-1 hover:bg-white/5 rounded-lg transition-all"
                      >
                        <X size={18} className="text-white/40" />
                      </button>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs text-white/40 block mb-2">Dispute Window (Days)</label>
                        <input
                          type="number"
                          value={configValues.refundWindow}
                          onChange={(e) => setConfigValues({ ...configValues, refundWindow: Math.max(1, parseInt(e.target.value) || 0) })}
                          className="w-full px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-white"
                          min="1"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfigValues({ ...configValues, refundWindow: 1 })}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-orange-500/10 text-orange-300 hover:bg-orange-500/20"
                        >
                          1 day
                        </button>
                        <button
                          onClick={() => setConfigValues({ ...configValues, refundWindow: 3 })}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-orange-500/10 text-orange-300 hover:bg-orange-500/20"
                        >
                          3 days
                        </button>
                        <button
                          onClick={() => setConfigValues({ ...configValues, refundWindow: 7 })}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-orange-500/10 text-orange-300 hover:bg-orange-500/20"
                        >
                          7 days
                        </button>
                        <button
                          onClick={() => setConfigValues({ ...configValues, refundWindow: 14 })}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-orange-500/10 text-orange-300 hover:bg-orange-500/20"
                        >
                          14 days
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingConfig(null)}
                          className="flex-1 py-2 rounded-xl bg-white/5 text-white/40 font-bold hover:bg-white/10"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => updateConfigOnChain('refundWindow')}
                          disabled={txLoading}
                          className="flex-1 py-2 rounded-xl bg-orange-500/15 text-orange-300 font-bold hover:bg-orange-500/25 disabled:opacity-50"
                        >
                          {txLoading ? 'Updating...' : 'Update On-Chain'}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}

              {/* Verification Expiry Modal */}
              {editingConfig === 'verificationExpiry' && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                  onClick={() => setEditingConfig(null)}
                >
                  <motion.div
                    initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white/2 border border-white/5 rounded-3xl p-6 max-w-md w-full"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-white flex items-center gap-2">
                        <CheckCircle size={18} className="text-emerald-400" />
                        Update Verification Expiry
                      </h3>
                      <button
                        onClick={() => setEditingConfig(null)}
                        className="p-1 hover:bg-white/5 rounded-lg transition-all"
                      >
                        <X size={18} className="text-white/40" />
                      </button>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs text-white/40 block mb-2">Verification Expiry (Years)</label>
                        <input
                          type="number"
                          value={configValues.verificationExpiry}
                          onChange={(e) => setConfigValues({ ...configValues, verificationExpiry: Math.max(1, parseInt(e.target.value) || 0) })}
                          className="w-full px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-white"
                          min="1"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfigValues({ ...configValues, verificationExpiry: 1 })}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                        >
                          1 year
                        </button>
                        <button
                          onClick={() => setConfigValues({ ...configValues, verificationExpiry: 2 })}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                        >
                          2 years
                        </button>
                        <button
                          onClick={() => setConfigValues({ ...configValues, verificationExpiry: 3 })}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                        >
                          3 years
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingConfig(null)}
                          className="flex-1 py-2 rounded-xl bg-white/5 text-white/40 font-bold hover:bg-white/10"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => updateConfigOnChain('verificationExpiry')}
                          disabled={txLoading}
                          className="flex-1 py-2 rounded-xl bg-emerald-500/15 text-emerald-300 font-bold hover:bg-emerald-500/25 disabled:opacity-50"
                        >
                          {txLoading ? 'Updating...' : 'Update On-Chain'}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </main>
    </div>
  );
}