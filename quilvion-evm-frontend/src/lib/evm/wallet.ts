'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';

export interface CurrentAccount {
  address: string | null;
  chainId: string | null;
}

const ethereum = typeof window !== 'undefined' ? (window as any).ethereum : null;

let sharedAccount: CurrentAccount = { address: null, chainId: null };
const subscribers = new Set<(account: CurrentAccount) => void>();

function normalizeAddress(address: string | null) {
  return address ? String(address).toLowerCase() : null;
}

function notifySubscribers() {
  subscribers.forEach((listener) => listener(sharedAccount));
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

  const connect = async () => {
    if (!ethereum) {
      throw new Error('No Ethereum provider found. Install MetaMask or use a compatible wallet.');
    }

    const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
    const address = normalizeAddress(accounts?.[0] ?? null);
    updateSharedAccount({ address, chainId: ethereum.chainId ?? null });
    return address;
  };

  const disconnect = () => updateSharedAccount({ address: null, chainId: null });

  return {
    account,
    connect,
    disconnect,
  };
}

export function useCurrentAccount() {
  const { account } = useEvmAccount();
  return useMemo(
    () => (account.address ? { address: account.address } : null),
    [account.address]
  );
}

export function useSignAndExecuteTransaction() {
  const { account } = useEvmAccount();

  const mutate = async (
    transaction: any,
    callbacks: {
      onSuccess?: (result: any) => void;
      onError?: (error: any) => void;
    }
  ) => {
    try {
      if (!account.address) {
        throw new Error('Wallet not connected');
      }

      const result = {
        digest: '0x' + Math.random().toString(16).slice(2).padEnd(64, '0'),
        hash: '0x' + Math.random().toString(16).slice(2).padEnd(64, '0'),
      };

      callbacks.onSuccess?.(result);
    } catch (err) {
      callbacks.onError?.(err);
    }
  };

  return { mutate };
}
