// src/lib/sui/transactions.ts
// All Move call builders — used by UI components

import { Transaction } from "@mysten/sui/transactions";
import { SUI_CONFIG, toUsdc } from "./constants";

const PKG = SUI_CONFIG.PACKAGE_ID;

// ── create_order ─────────────────────────────────────────────────────────────
export function buildCreateOrder(
  tx: Transaction,
  productId: number,
  merchantWallet: string,
  amountUsdc: number,        // display value e.g. 50.0
  usdcCoinObjectId: string,  // Coin<USDC> object owned by buyer
) {
  tx.moveCall({
    target: `${PKG}::commerce_core::create_order`,
    arguments: [
      tx.object(SUI_CONFIG.COMMERCE_CORE),
      tx.object(SUI_CONFIG.ESCROW_MANAGER),
      tx.object(SUI_CONFIG.CONFIG_MANAGER),
      tx.object(SUI_CONFIG.REP_MANAGER),
      tx.object(SUI_CONFIG.ROLE_MANAGER),
      tx.pure.u64(productId),
      tx.pure.address(merchantWallet),
      tx.pure.u8(0),  // PRODUCT_TYPE_DIGITAL
      tx.object(usdcCoinObjectId),
      tx.object(SUI_CONFIG.CLOCK),
    ],
  });
}

// ── raise_dispute ─────────────────────────────────────────────────────────────
export function buildRaiseDispute(tx: Transaction, orderId: number) {
  tx.moveCall({
    target: `${PKG}::commerce_core::raise_dispute`,
    arguments: [
      tx.object(SUI_CONFIG.COMMERCE_CORE),
      tx.object(SUI_CONFIG.CONFIG_MANAGER),
      tx.pure.u64(orderId),
      tx.object(SUI_CONFIG.CLOCK),
    ],
  });
}

// ── cancel_order ──────────────────────────────────────────────────────────────
export function buildCancelOrder(tx: Transaction, orderId: number) {
  tx.moveCall({
    target: `${PKG}::commerce_core::cancel_order`,
    arguments: [
      tx.object(SUI_CONFIG.COMMERCE_CORE),
      tx.object(SUI_CONFIG.ESCROW_MANAGER),
      tx.object(SUI_CONFIG.ROLE_MANAGER),
      tx.pure.u64(orderId),
    ],
  });
}