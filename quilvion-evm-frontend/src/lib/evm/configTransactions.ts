// src/lib/evm/configTransactions.ts
// EVM-compatible config transaction stubs for admin UI flows.

import { Transaction } from '@/lib/evm/transaction';

export function buildSetPlatformFee(tx: Transaction, basisPoints: number): void {
  tx.moveCall?.({
    target: 'EVM_SET_PLATFORM_FEE',
    arguments: [basisPoints],
  });
}

export function buildSetAdminApprovalThreshold(tx: Transaction, microUSDC: number | string): void {
  tx.moveCall?.({
    target: 'EVM_SET_ADMIN_APPROVAL_THRESHOLD',
    arguments: [microUSDC],
  });
}

export function buildSetDailySpendLimit(tx: Transaction, microUSDC: number | string): void {
  tx.moveCall?.({
    target: 'EVM_SET_DAILY_SPEND_LIMIT',
    arguments: [microUSDC],
  });
}

export function buildSetRefundWindow(tx: Transaction, seconds: number | string): void {
  tx.moveCall?.({
    target: 'EVM_SET_REFUND_WINDOW',
    arguments: [seconds],
  });
}

export function buildSetVerificationExpiry(tx: Transaction, seconds: number | string): void {
  tx.moveCall?.({
    target: 'EVM_SET_VERIFICATION_EXPIRY',
    arguments: [seconds],
  });
}

export function usdcToMicro(usdc: number): number {
  return usdc * 1_000_000;
}

export function microToUsdc(micro: number): number {
  return micro / 1_000_000;
}

export function daysToSeconds(days: number): number {
  return days * 86_400;
}

export function secondsToDays(seconds: number): number {
  return seconds / 86_400;
}

export const CONFIG_PRESETS = {
  platformFee: {
    LOW: 100,
    STANDARD: 250,
    MEDIUM: 300,
    HIGH: 500,
  },
  dailySpendLimit: {
    CONSERVATIVE: usdcToMicro(100),
    STANDARD: usdcToMicro(1000),
    GENEROUS: usdcToMicro(5000),
    UNLIMITED: usdcToMicro(1_000_000),
  },
  approvalThreshold: {
    LOW: usdcToMicro(100),
    STANDARD: usdcToMicro(500),
    MEDIUM: usdcToMicro(1000),
    HIGH: usdcToMicro(5000),
  },
  refundWindow: {
    SHORT: daysToSeconds(1),
    MEDIUM: daysToSeconds(3),
    STANDARD: daysToSeconds(7),
    LONG: daysToSeconds(14),
    EXTENDED: daysToSeconds(30),
  },
  verificationExpiry: {
    SIX_MONTHS: 15_768_000,
    ONE_YEAR: 31_536_000,
    TWO_YEARS: 63_072_000,
    THREE_YEARS: 94_608_000,
  },
};

export function describeConfig(name: string, value: number | string): string {
  switch (name) {
    case 'platformFee':
      return `${value} bps (${Number(value) / 100}%)`;
    case 'approvalThreshold':
    case 'dailySpendLimit':
      return `${microToUsdc(Number(value))} USDC`;
    case 'refundWindow':
      return `${secondsToDays(Number(value))} days`;
    case 'verificationExpiry':
      const years = secondsToDays(Number(value)) / 365;
      return `${years.toFixed(1)} years`;
    default:
      return String(value);
  }
}
