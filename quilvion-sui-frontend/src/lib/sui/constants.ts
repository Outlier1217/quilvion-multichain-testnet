// src/lib/sui/constants.ts
// Sui TESTNET — deployment with shared Faucet
// Tx: AfCrTH8vcYarpfVqDUqXfDUSHABqsZcUZG8KX7v4a62Q

export const SUI_CONFIG = {
  PACKAGE_ID:     "0x6a32557761cd8ca961ee8febc5647f857063bee569940513e7457e2e2a15b9d9",

  COMMERCE_CORE:  "0xc3b8bae2fbcb29fc4eb9924822f902f0422c81c31b454ee897bc0dd9434dc510",
  ESCROW_MANAGER: "0x2e4e4ba06d4c39d120275f683c5ffc6eccf16861e165bcd0d4a61c68bb0e357f",
  CONFIG_MANAGER: "0xbe120833cc1818a5701febb9066f52a9c85160fa0aa142c21b5733caf33476b6",
  ROLE_MANAGER:   "0x67c9d814fd58e2e1166be26b4268adf0a98acbe22853bff2ffe2624982cb7de4",
  REP_MANAGER:    "0xa7d3fbbbc530c7d718d4e0c336dab47315b4eccd2b384e0d33a2465ea3a72b8e",
  BADGE_MANAGER:  "0x5d7543a0cf6a0572fb447d7fe810dfa14ca7904209606895dbc052f3457ba211",

  // Shared Faucet — anyone can call faucet_mint(), no TreasuryCap needed
  FAUCET: "0xef5fca55b353507fa76d79a3fb07afd0d83b91bbfad58be72e1f86be4832e849",

  CLOCK: "0x0000000000000000000000000000000000000000000000000000000000000006",

  ADMIN_THRESHOLD_USDC: 100,
  PLATFORM_FEE_BPS:     250,
  REFUND_WINDOW_DAYS:   7,

  USDC_DECIMALS: 6,
  USDC_TYPE: "0x6a32557761cd8ca961ee8febc5647f857063bee569940513e7457e2e2a15b9d9::usdc::USDC",
} as const;

export const toUsdc   = (display: number) => display * 1_000_000;
export const fromUsdc = (micro:   number) => micro   / 1_000_000;

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";