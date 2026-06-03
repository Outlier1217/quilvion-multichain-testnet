/**
 * EVM-compatible config loader stub for admin UI flows.
 */

export interface OnChainConfig {
  platformFeeBps: number;
  adminApprovalThresholdMicro: number;
  dailySpendLimitMicro: number;
  disputeRefundWindowSeconds: number;
  merchantVerificationExpirySeconds: number;
}

export async function readConfigFromChain(): Promise<OnChainConfig | null> {
  // On-chain config is not loaded directly from Sui in the EVM frontend.
  // This stub keeps the admin UI compatible while the backend remains the source of truth.
  return null;
}

export function formatConfigDisplay(config: OnChainConfig) {
  return {
    platformFee: (config.platformFeeBps / 100).toFixed(2) + '%',
    platformFeeBps: config.platformFeeBps,
    adminApprovalThreshold: (config.adminApprovalThresholdMicro / 1_000_000).toFixed(2),
    dailySpendLimit: (config.dailySpendLimitMicro / 1_000_000).toFixed(2),
    refundWindow: (config.disputeRefundWindowSeconds / 86_400).toFixed(0),
    verificationExpiry: (config.merchantVerificationExpirySeconds / 31_536_000).toFixed(0),
  };
}

export function configsMatch(
  onChain: OnChainConfig,
  dbPlatformFee: number,
  dbApprovalThreshold: number,
  dbDailySpendLimit: number,
  dbRefundWindow: number,
  dbVerificationExpiry: number
): boolean {
  return (
    onChain.platformFeeBps === dbPlatformFee &&
    onChain.adminApprovalThresholdMicro === dbApprovalThreshold &&
    onChain.dailySpendLimitMicro === dbDailySpendLimit &&
    onChain.disputeRefundWindowSeconds === dbRefundWindow &&
    onChain.merchantVerificationExpirySeconds === dbVerificationExpiry
  );
}
