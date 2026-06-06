// src/lib/evm/configTransactions.ts
import { EVM_CONFIG } from './constants';

// Helper functions
export const usdcToMicro = (usdc: number) => Math.round(usdc * 1_000_000);
export const daysToSeconds = (days: number) => days * 86_400;

const CONFIG_MANAGER_ABI = [
  "function setPlatformFee(uint256 bps) external",
  "function setDailySpendLimit(uint256 amount) external",
  "function setAdminApprovalThreshold(uint256 amount) external",
  "function setDisputeRefundWindow(uint256 seconds_) external",
  "function setMerchantVerificationExpiry(uint256 seconds_) external",
];

// These build ethers transaction objects for use with wagmi/viem sendTransaction
export function buildSetPlatformFee(tx: any, bps: number) {
  tx.contractAddress = EVM_CONFIG.CONTRACTS.CONFIG_MANAGER;
  tx.abi = CONFIG_MANAGER_ABI;
  tx.functionName = 'setPlatformFee';
  tx.args = [BigInt(bps)];
}

export function buildSetDailySpendLimit(tx: any, microAmount: number) {
  tx.contractAddress = EVM_CONFIG.CONTRACTS.CONFIG_MANAGER;
  tx.abi = CONFIG_MANAGER_ABI;
  tx.functionName = 'setDailySpendLimit';
  tx.args = [BigInt(microAmount)];
}

export function buildSetAdminApprovalThreshold(tx: any, microAmount: number) {
  tx.contractAddress = EVM_CONFIG.CONTRACTS.CONFIG_MANAGER;
  tx.abi = CONFIG_MANAGER_ABI;
  tx.functionName = 'setAdminApprovalThreshold';
  tx.args = [BigInt(microAmount)];
}

export function buildSetRefundWindow(tx: any, seconds: number) {
  tx.contractAddress = EVM_CONFIG.CONTRACTS.CONFIG_MANAGER;
  tx.abi = ["function setRefundWindow(uint256 seconds_) external"];
  tx.functionName = 'setRefundWindow';   // ✅ exact sol function name
  tx.args = [BigInt(seconds)];
}

export function buildSetVerificationExpiry(tx: any, seconds: number) {
  tx.contractAddress = EVM_CONFIG.CONTRACTS.CONFIG_MANAGER;
  tx.abi = CONFIG_MANAGER_ABI;
  tx.functionName = 'setMerchantVerificationExpiry';
  tx.args = [BigInt(seconds)];
}

export function describeConfig(key: string, value: number): string {
  switch (key) {
    case 'platformFee': return `${(value / 100).toFixed(2)}% fee`;
    case 'dailySpendLimit': return `${value / 1_000_000} USDC daily limit`;
    case 'approvalThreshold': return `${value / 1_000_000} USDC threshold`;
    case 'refundWindow': return `${value / 86400} day window`;
    case 'verificationExpiry': return `${value / 31536000} year expiry`;
    default: return String(value);
  }
}