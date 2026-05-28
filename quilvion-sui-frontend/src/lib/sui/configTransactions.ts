/**
 * Quilvion Config Update Transactions
 * 
 * Helper functions to build on-chain configuration update transactions.
 * All functions require ADMIN_ROLE or DEFAULT_ADMIN_ROLE.
 */

import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';

// Package & Object IDs (Testnet)
const PACKAGE_ID = '0xb6ee5d919c1ea7a727b9d86af1bc9259b4f68584b9feb03432f545f5a384a2c4';
const CONFIG_MANAGER = '0xbc97b93da570249a5d0e8d1df257b8eea7325dfcd12f6245effc4b541f9f77eb';
const ROLE_MANAGER = '0x54b04b6cd74f63dccdcdd2b8ca4092f7a7685d485bf7f9fcd31745323c7d6eea';

/**
 * Build transaction to update platform fee
 * 
 * @param tx - Transaction builder
 * @param basisPoints - New fee in basis points (0-10,000)
 *   - 250 = 2.5%
 *   - 300 = 3%
 *   - 200 = 2%
 */
export function buildSetPlatformFee(tx: Transaction, basisPoints: number): void {
  if (basisPoints < 0 || basisPoints > 10000) {
    throw new Error('Basis points must be between 0 and 10,000');
  }

  tx.moveCall({
    target: `${PACKAGE_ID}::config_manager::set_platform_fee`,
    arguments: [
      tx.object(CONFIG_MANAGER),
      tx.pure(bcs.u16().serialize(basisPoints)),
      tx.object(ROLE_MANAGER),
    ],
  });
}

/**
 * Build transaction to update admin approval threshold
 * 
 * @param tx - Transaction builder
 * @param microUSDC - New threshold in micro-USDC (6 decimal places)
 *   - 500,000,000 = 500 USDC
 *   - 1,000,000,000 = 1,000 USDC
 *   - 200,000,000 = 200 USDC
 */
export function buildSetAdminApprovalThreshold(tx: Transaction, microUSDC: number | string): void {
  const amount = typeof microUSDC === 'string' ? BigInt(microUSDC) : BigInt(Math.floor(microUSDC));
  tx.moveCall({
    target: `${PACKAGE_ID}::config_manager::set_admin_approval_threshold`,
    arguments: [
      tx.object(CONFIG_MANAGER),
      tx.pure(bcs.u64().serialize(amount)),
      tx.object(ROLE_MANAGER),
    ],
  });
}

/**
 * Build transaction to update daily spend limit
 * 
 * @param tx - Transaction builder
 * @param microUSDC - New daily limit in micro-USDC
 *   - 1,000,000,000 = 1,000 USDC per day
 *   - 500,000,000 = 500 USDC per day
 *   - 2,000,000,000 = 2,000 USDC per day
 */
export function buildSetDailySpendLimit(tx: Transaction, microUSDC: number | string): void {
  const amount = typeof microUSDC === 'string' ? BigInt(microUSDC) : BigInt(Math.floor(microUSDC));
  tx.moveCall({
    target: `${PACKAGE_ID}::config_manager::set_daily_spend_limit`,
    arguments: [
      tx.object(CONFIG_MANAGER),
      tx.pure(bcs.u64().serialize(amount)),
      tx.object(ROLE_MANAGER),
    ],
  });
}

/**
 * Build transaction to update dispute refund window
 * 
 * @param tx - Transaction builder
 * @param seconds - New window duration in seconds
 *   - 604,800 = 7 days (default)
 *   - 1,209,600 = 14 days
 *   - 259,200 = 3 days
 *   - 86,400 = 1 day
 */
export function buildSetRefundWindow(tx: Transaction, seconds: number | string): void {
  const amount = typeof seconds === 'string' ? BigInt(seconds) : BigInt(Math.floor(seconds));
  tx.moveCall({
    target: `${PACKAGE_ID}::config_manager::set_refund_window`,
    arguments: [
      tx.object(CONFIG_MANAGER),
      tx.pure(bcs.u64().serialize(amount)),
      tx.object(ROLE_MANAGER),
    ],
  });
}

/**
 * Build transaction to update merchant verification expiry
 * 
 * @param tx - Transaction builder
 * @param seconds - New expiry duration in seconds
 *   - 31,536,000 = 1 year (default)
 *   - 63,072,000 = 2 years
 *   - 15,768,000 = 6 months
 */
export function buildSetVerificationExpiry(tx: Transaction, seconds: number | string): void {
  const amount = typeof seconds === 'string' ? BigInt(seconds) : BigInt(Math.floor(seconds));
  tx.moveCall({
    target: `${PACKAGE_ID}::config_manager::set_verification_expiry`,
    arguments: [
      tx.object(CONFIG_MANAGER),
      tx.pure(bcs.u64().serialize(amount)),
      tx.object(ROLE_MANAGER),
    ],
  });
}

/**
 * Utility: Convert USDC to micro-USDC (6 decimals)
 */
export function usdcToMicro(usdc: number): number {
  return usdc * 1_000_000;
}

/**
 * Utility: Convert micro-USDC to USDC
 */
export function microToUsdc(micro: number): number {
  return micro / 1_000_000;
}

/**
 * Utility: Convert days to seconds
 */
export function daysToSeconds(days: number): number {
  return days * 86_400;
}

/**
 * Utility: Convert seconds to days
 */
export function secondsToDays(seconds: number): number {
  return seconds / 86_400;
}

/**
 * Configuration presets for quick updates
 */
export const CONFIG_PRESETS = {
  platformFee: {
    LOW: 100,      // 1%
    STANDARD: 250, // 2.5%
    MEDIUM: 300,   // 3%
    HIGH: 500,     // 5%
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

/**
 * Get human-readable config description
 */
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

/**
 * Package ID constant for verification
 */
export const PACKAGE_CONFIG = {
  PACKAGE_ID,
  CONFIG_MANAGER,
  ROLE_MANAGER,
  NETWORK: 'Sui Testnet',
  EXPLORER_PACKAGE: `https://suiscan.xyz/testnet/object/${PACKAGE_ID}`,
  EXPLORER_CONFIG: `https://suiscan.xyz/testnet/object/${CONFIG_MANAGER}`,
};
