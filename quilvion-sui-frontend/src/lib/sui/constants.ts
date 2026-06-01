// src/lib/sui/constants.ts
// Sui TESTNET — Latest Deployment (May 2026)

export const SUI_CONFIG = {
  PACKAGE_ID: "0xb6ee5d919c1ea7a727b9d86af1bc9259b4f68584b9feb03432f545f5a384a2c4",

  COMMERCE_CORE:  "0x49523b3ba05a288e3d9fd330315281d631cfaf95198e094f616eef1c2d135a4f",
  ESCROW_MANAGER: "0x2665285d76a33cf5d910076e9bfce2d06b08b09ba4b5ad50a385d9b96e3933a3",
  CONFIG_MANAGER: "0xbc97b93da570249a5d0e8d1df257b8eea7325dfcd12f6245effc4b541f9f77eb",
  ROLE_MANAGER:   "0x54b04b6cd74f63dccdcdd2b8ca4092f7a7685d485bf7f9fcd31745323c7d6eea",
  REP_MANAGER:    "0x191468eeed9f171b0d17e585d5766e5432f9e11043eedade80c31f317c6d8316",
  BADGE_MANAGER:  "0xfe79d99af734cf510ab066054d7a6599f7323d64b39feea5a76bd496bdc86735",

  // Mock USDC Faucet (Testnet only)
  FAUCET: "0x18774100b4ae6be923746b80780d1a9ca74467a34f852ccdcbaa5c35d55ed325",

  CLOCK: "0x0000000000000000000000000000000000000000000000000000000000000006",

  ADMIN_THRESHOLD_USDC: 500,      // 500 USDC
  PLATFORM_FEE_BPS:     250,      // 2.5%
  REFUND_WINDOW_DAYS:   7,

  USDC_DECIMALS: 6,
  USDC_TYPE: "0xb6ee5d919c1ea7a727b9d86af1bc9259b4f68584b9feb03432f545f5a384a2c4::usdc::USDC",
} as const;

export const toUsdc   = (display: number) => display * 1_000_000;
export const fromUsdc = (micro:   number) => micro   / 1_000_000;

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