// src/lib/evm/constants.ts
// EVM-compatible configuration placeholders for Somnia and other EVM chains.

export const EVM_CONFIG = {
  NETWORK_NAME: 'Somnia Testnet',
  CHAIN_ID: 50312,
  RPC_URL: 'https://dream-rpc.somnia.network',
  EXPLORER_BASE: 'https://shannon-explorer.somnia.network',
  CONTRACTS: {
    MOCK_USDC: '0xDbA3C917F0710869e9826F37c1e1ee0fcBa951ad',
    CONFIG_MANAGER: '0xbbb3907C31E127664f3E7dA49fF5Fe4c748f9A6c',
    ESCROW_LOGIC: '0xCE968012e486861B606Fe4790a2cf917695133c9',
    REPUTATION_MANAGER: '0x79B47945387a366b8a34B5B198AE21aEfd6b57A6',
    COMMERCE_CORE: '0xA1fa19D58335b1341c5B8217E26C766fB605B1bA',
    SOMNIA_AGENT_CONTROLLER: '0xdBB640163565C62512c69fEe8fd03E723BB30b40',
  },
  PLATFORM_FEE_BPS: 250,
  ADMIN_THRESHOLD_USDC: 500,
  REFUND_WINDOW_DAYS: 7,
  PACKAGE_ID: '0xA1fa19D58335b1341c5B8217E26C766fB605B1bA',
} as const;

export const toUsdc = (display: number) => display * 1_000_000;
export const fromUsdc = (micro: number) => micro / 1_000_000;

const envApiBase = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '');

function getGithubDevFallback(host: string) {
  if (host.endsWith('-3000.app.github.dev')) {
    return `https://${host.replace(/-3000\.app\.github\.dev$/, '-8000.app.github.dev')}`;
  }
  return null;
}

function getLocalFallback(host: string) {
  if (host.includes(':3000')) {
    return `${window.location.protocol}//${host.replace(/:3000$/, ':8000')}`;
  }
  if (host.match(/:\d+$/)) {
    return `${window.location.protocol}//${host.replace(/:\d+$/, ':8000')}`;
  }
  return `${window.location.protocol}//${host}`;
}

export const API_BASE = envApiBase || (typeof window !== 'undefined' ? getGithubDevFallback(window.location.host) ?? getLocalFallback(window.location.host) : 'http://localhost:8000');
