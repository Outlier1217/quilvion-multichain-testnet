'use client';

import { useMemo, useState } from 'react';
import { useEvmAccount } from '@/lib/evm/wallet';

export function ConnectButton() {
  const { account, connect } = useEvmAccount();
  const [loading, setLoading] = useState(false);

  const truncated = useMemo(() => {
    if (!account.address) return null;
    return `${account.address.slice(0, 6)}...${account.address.slice(-4)}`;
  }, [account.address]);

  const handleClick = async () => {
    if (!window.ethereum) {
      window.open('https://metamask.io/download/', '_blank');
      return;
    }

    setLoading(true);
    try {
      await connect();
    } catch (err) {
      console.error('Wallet connect failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold transition hover:border-white/20"
      style={{ background: 'rgba(255,255,255,0.05)' }}
    >
      {account.address ? `Connected: ${truncated}` : loading ? 'Connecting…' : 'Connect Wallet'}
    </button>
  );
}
