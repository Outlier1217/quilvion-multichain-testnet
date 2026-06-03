// src/lib/evm/transactions.ts
// EVM-compatible frontend stubs for transaction helpers.

import { Transaction } from '@/lib/evm/transaction';

export function buildCreateOrder(
  tx: Transaction,
  productId: number,
  merchantWallet: string,
  amountUsdc: number,
  usdcCoinObjectId: string,
) {
  tx.moveCall?.({
    target: 'EVM_CREATE_ORDER',
    arguments: [productId, merchantWallet, amountUsdc, usdcCoinObjectId],
  });
}

export function buildRaiseDispute(tx: Transaction, orderId: number) {
  tx.moveCall?.({
    target: 'EVM_RAISE_DISPUTE',
    arguments: [orderId],
  });
}

export function buildCancelOrder(tx: Transaction, orderId: number) {
  tx.moveCall?.({
    target: 'EVM_CANCEL_ORDER',
    arguments: [orderId],
  });
}

export function buildReleaseEscrow(tx: Transaction, orderId: number) {
  tx.moveCall?.({
    target: 'EVM_RELEASE_ESCROW',
    arguments: [orderId],
  });
}

export function buildDeliverDigitalProduct(tx: Transaction, orderId: number, deliveryInfo: string) {
  tx.moveCall?.({
    target: 'EVM_DELIVER_DIGITAL_PRODUCT',
    arguments: [orderId, deliveryInfo],
  });
}
