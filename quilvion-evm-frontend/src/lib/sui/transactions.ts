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
  // Convert display USDC to micro-units (6 decimals)
  const amountMicroUnits = toUsdc(amountUsdc);

  // CRITICAL: Split coin to exact amount before passing to contract
  const [coin] = tx.splitCoins(tx.object(usdcCoinObjectId), [
    tx.pure.u64(amountMicroUnits),
  ]);

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
      coin,  // Use only the split coin (exact amount needed)
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

// ── release_escrow (Buyer confirms successful delivery) ───────────────────────
export function buildReleaseEscrow(tx: Transaction, orderId: number) {
  tx.moveCall({
    target: `${SUI_CONFIG.PACKAGE_ID}::commerce_core::release_escrow`,
    arguments: [
      tx.object(SUI_CONFIG.COMMERCE_CORE),
      tx.object(SUI_CONFIG.ESCROW_MANAGER),
      tx.object(SUI_CONFIG.REP_MANAGER),
      tx.object(SUI_CONFIG.CONFIG_MANAGER),
      tx.object(SUI_CONFIG.ROLE_MANAGER),
      tx.pure.u64(orderId),
      tx.object(SUI_CONFIG.CLOCK),
    ],
  });
}

// ── deliver_digital_product (Merchant provides delivery info) ──────────────────
export function buildDeliverDigitalProduct(tx: Transaction, orderId: number, deliveryInfo: string) {
  tx.moveCall({
    target: `${SUI_CONFIG.PACKAGE_ID}::commerce_core::deliver_digital_product`,
    arguments: [
      tx.object(SUI_CONFIG.COMMERCE_CORE),
      tx.pure.u64(orderId),
      tx.pure.string(deliveryInfo),
      tx.object(SUI_CONFIG.CLOCK),
    ],
  });
}