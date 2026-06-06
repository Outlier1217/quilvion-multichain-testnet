// src/lib/evm/readConfig.ts
import { JsonRpcProvider, Contract } from 'ethers';
import { EVM_CONFIG } from './constants';

export interface OnChainConfig {
  platformFeeBps: number;
  adminApprovalThresholdMicro: number;
  dailySpendLimitMicro: number;
  disputeRefundWindowSeconds: number;
  merchantVerificationExpirySeconds: number;
}

// ✅ Exact function names from ConfigManager.sol
const CONFIG_MANAGER_ABI = [
  "function platformFeeBps() external view returns (uint256)",
  "function adminApprovalThreshold() external view returns (uint256)",
  "function dailySpendLimit() external view returns (uint256)",
  "function refundWindow() external view returns (uint256)",
];

export async function readConfigFromChain(): Promise<OnChainConfig> {
  const provider = new JsonRpcProvider(EVM_CONFIG.RPC_URL);
  const contract = new Contract(
    EVM_CONFIG.CONTRACTS.CONFIG_MANAGER,
    CONFIG_MANAGER_ABI,
    provider
  );

  const [fee, threshold, dailyLimit, refundWin] = await Promise.all([
    contract.platformFeeBps(),
    contract.adminApprovalThreshold(),
    contract.dailySpendLimit(),
    contract.refundWindow(),
  ]);

  return {
    platformFeeBps: Number(fee),
    adminApprovalThresholdMicro: Number(threshold),
    dailySpendLimitMicro: Number(dailyLimit),
    disputeRefundWindowSeconds: Number(refundWin),
    merchantVerificationExpirySeconds: 31_536_000, // not in contract, hardcoded 1 year
  };
}

export function configsMatch(
  chain: OnChainConfig,
  platformFeeBps: number,
  adminApprovalThresholdMicro: number,
  dailySpendLimitMicro: number,
  disputeRefundWindowSeconds: number,
  merchantVerificationExpirySeconds: number,
): boolean {
  return (
    chain.platformFeeBps === platformFeeBps &&
    chain.adminApprovalThresholdMicro === adminApprovalThresholdMicro &&
    chain.dailySpendLimitMicro === dailySpendLimitMicro &&
    chain.disputeRefundWindowSeconds === disputeRefundWindowSeconds
  );
}

export function formatConfigDisplay(config: OnChainConfig) {
  return {
    platformFee: `${(config.platformFeeBps / 100).toFixed(2)}%`,
    approvalThreshold: `${config.adminApprovalThresholdMicro / 1_000_000} USDC`,
    dailySpendLimit: `${config.dailySpendLimitMicro / 1_000_000} USDC`,
    refundWindow: `${config.disputeRefundWindowSeconds / 86400} days`,
  };
}