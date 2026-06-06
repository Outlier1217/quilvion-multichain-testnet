'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

export interface CurrentAccount {
  address: string | null;
  chainId: string | null;
}

const ethereum = typeof window !== 'undefined' ? (window as any).ethereum : null;

let sharedAccount: CurrentAccount = { address: null, chainId: null };
const subscribers = new Set<() => void>();

function normalizeAddress(address: string | null) {
  return address ? String(address).toLowerCase() : null;
}

function notifySubscribers() {
  subscribers.forEach((listener) => listener());
}

function updateSharedAccount(account: CurrentAccount) {
  sharedAccount = account;
  notifySubscribers();
}

function initializeEthereum() {
  if (!ethereum) return;

  const updateAccount = ([address]: string[]) => {
    updateSharedAccount({ address: normalizeAddress(address), chainId: ethereum.chainId ?? null });
  };

  const updateChain = (chainId: string) => {
    updateSharedAccount({ address: sharedAccount.address, chainId });
  };

  ethereum.request({ method: 'eth_accounts' })
    .then((accounts: string[]) => {
      if (Array.isArray(accounts) && accounts.length > 0) {
        updateAccount(accounts);
      }
    })
    .catch(() => {});

  ethereum.on?.('accountsChanged', updateAccount);
  ethereum.on?.('chainChanged', updateChain);
}

if (typeof window !== 'undefined') {
  initializeEthereum();
}

export function useEvmAccount() {
  const account = useSyncExternalStore(
    (listener) => {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    () => sharedAccount,
    () => sharedAccount
  );

  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const visibleAccount = hydrated ? account : { address: null, chainId: null };

  const connect = async () => {
    if (!ethereum) throw new Error('No Ethereum provider found. Install MetaMask.');
    const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
    const address = normalizeAddress(accounts?.[0] ?? null);
    updateSharedAccount({ address, chainId: ethereum.chainId ?? null });
    return address;
  };

  const disconnect = () => updateSharedAccount({ address: null, chainId: null });

  return { account: visibleAccount, connect, disconnect };
}

export function useCurrentAccount() {
  const { account } = useEvmAccount();
  return useMemo(
    () => (account.address ? { address: account.address } : null),
    [account.address]
  );
}

// ── Real EVM writeContract ────────────────────────────────────────────────────
export function useWriteEvmContract() {
  const writeContractAsync = async ({
    address,
    abi,
    functionName,
    args,
  }: {
    address: `0x${string}`;
    abi: readonly any[];
    functionName: string;
    args: readonly any[];
  }): Promise<`0x${string}`> => {       // ✅ single brace, no double {{
    if (!ethereum) throw new Error('No Ethereum provider found');

    const { encodeFunctionData } = await import('viem');
    const data = encodeFunctionData({ abi, functionName, args });

    const accounts = await ethereum.request({ method: 'eth_accounts' });
    if (!accounts?.length) throw new Error('Wallet not connected');

    const txHash = await ethereum.request({
      method: 'eth_sendTransaction',
      params: [{ from: accounts[0], to: address, data }],
    });

    return txHash as `0x${string}`;
  };

  return { writeContractAsync };
}

// ── Wait for transaction receipt ──────────────────────────────────────────────
export async function waitForTx(txHash: `0x${string}`): Promise<void> {
  if (!ethereum) return;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const receipt = await ethereum.request({
      method: 'eth_getTransactionReceipt',
      params: [txHash],
    });
    if (receipt) {
      if (receipt.status === '0x0') throw new Error('Transaction reverted on-chain');
      return;
    }
  }
  throw new Error('Transaction timeout — check explorer manually');
}

// ── Legacy stub ───────────────────────────────────────────────────────────────
export function useSignAndExecuteTransaction() {
  const mutate = async (
    _transaction: any,
    callbacks: { onSuccess?: (result: any) => void; onError?: (error: any) => void; }
  ) => {
    callbacks.onError?.(new Error('Use useWriteEvmContract for EVM chains'));
  };
  return { mutate };
}