// src/lib/sui/constants.ts
// All on-chain object IDs — Sui TESTNET deployment
// Transaction: 7baUq6X3g3w1vgB4mEDY13TghjUf2euJEMGZAfeeD7Dc
// Explorer: https://suiscan.xyz/testnet/tx/7baUq6X3g3w1vgB4mEDY13TghjUf2euJEMGZAfeeD7Dc

export const SUI_CONFIG = {
  // ── Package ──────────────────────────────────────────────────────────────
  PACKAGE_ID: "0x08d8ad38d8f4c3f5c2418f2d3d6074b6c01ad5e4be24d0087e55669b22db63c8",

  // ── Shared Objects ───────────────────────────────────────────────────────
  COMMERCE_CORE:  "0x9e0912ec621c42ba0dd5845829ae2780cd08acb185a60ef100a7f7b9857866ac",
  ESCROW_MANAGER: "0x8d84f92239f429f7ab4b1fc15c86c8831f024fc572e7226385c67a23d51b54d7",
  CONFIG_MANAGER: "0xb75738cce91d139ed6f2f5410b285948524e0abc029343fe606e4e03e8c34155",
  ROLE_MANAGER:   "0x8d3937e563e21314cff23286fa3849bce952c3a4744b0669222765ff4643f30a",
  REP_MANAGER:    "0x1b4e4788e188f670d2ac7a0c524d2ea8f5a0cec72b44bb4ab678732ea66ce22b",
  BADGE_MANAGER:  "0x1c69c03d026dcb155b29550c6c916494d7786b3d1b5ce723ed2a6a1b74e89eae",
  TREASURY_CAP:   "0x15e7d6512072b3e04a99308a6189d2a2abcc53a5318f73c2514a59f9d970e629",

  // ── System Objects ───────────────────────────────────────────────────────
  CLOCK: "0x0000000000000000000000000000000000000000000000000000000000000006",

  // ── Platform Config ──────────────────────────────────────────────────────
  ADMIN_THRESHOLD_USDC: 100,  // orders above this go to escrow
  PLATFORM_FEE_BPS:     250,  // 2.5%
  REFUND_WINDOW_DAYS:   7,

  // ── USDC ─────────────────────────────────────────────────────────────────
  USDC_DECIMALS: 6,
  USDC_TYPE: "0x08d8ad38d8f4c3f5c2418f2d3d6074b6c01ad5e4be24d0087e55669b22db63c8::usdc::USDC",
} as const;

// Helper: USDC micro-units ↔ display
export const toUsdc   = (display: number) => display * 1_000_000;
export const fromUsdc = (micro:   number) => micro   / 1_000_000;

// Backend API
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";