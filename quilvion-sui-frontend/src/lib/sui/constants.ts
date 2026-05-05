// src/lib/sui/constants.ts
// All on-chain object IDs — update when deploying to testnet/mainnet

export const SUI_CONFIG = {
  // ── Package ──────────────────────────────────────────────────────────────
  PACKAGE_ID: "0x921257af29bcf993ea6f37e186dc49aa9b72289fb2c5379e9fe984638773babf",

  // ── Shared Objects ───────────────────────────────────────────────────────
  COMMERCE_CORE:    "0x28e5238f872da4c171f01f12e987849629bc387004a3c4830faa05e47688dc83",
  ESCROW_MANAGER:   "0x645ede06d665d4386f426701c237a8497d2eb06d9e1482d28a3e73ed034972c5",
  CONFIG_MANAGER:   "0xedd14981cbfcb8819eada3e36098612e8e45200f2019d1ea7fc76fc2245ea873",
  ROLE_MANAGER:     "0x83d9da6a68c60505b8f4667ddb733fb3f21050efc2bfeb7b08869c7a53a627ed",
  REP_MANAGER:      "0xe74393ec4ee7ba78a3c5d5234e0242777e75b078cae91c9ef3d1855a16feda4b",
  BADGE_MANAGER:    "0x06a787d3b21db927be31d46f4daade4a615bdd482febf40d8f267195059b8903",
  TREASURY_CAP:     "0x753642235c283030e1bfbb159808ff20ea20c1a7a4f9c76ed1319de6484f2cdc",

  // ── System Objects ───────────────────────────────────────────────────────
  CLOCK: "0x0000000000000000000000000000000000000000000000000000000000000006",

  // ── Config ───────────────────────────────────────────────────────────────
  ADMIN_THRESHOLD_USDC: 100,   // orders above this go to escrow
  PLATFORM_FEE_BPS:     250,   // 2.5%
  REFUND_WINDOW_DAYS:   7,

  // ── USDC ─────────────────────────────────────────────────────────────────
  USDC_DECIMALS: 6,
  USDC_TYPE: "0x921257af29bcf993ea6f37e186dc49aa9b72289fb2c5379e9fe984638773babf::usdc::USDC",
} as const;

// Helper: USDC micro-units ↔ display
export const toUsdc = (display: number) => display * 1_000_000;
export const fromUsdc = (micro: number) => micro / 1_000_000;

// Backend API
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";