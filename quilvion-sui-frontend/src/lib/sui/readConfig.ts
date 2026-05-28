/**
 * Read protocol configuration from Sui blockchain
 * Source of truth for all configuration values
 */

import { SuiClient } from '@mysten/sui/client';

const TESTNET_RPC = 'https://fullnode.testnet.sui.io:443';
const PACKAGE_ID = '0xb6ee5d919c1ea7a727b9d86af1bc9259b4f68584b9feb03432f545f5a384a2c4';
const CONFIG_MANAGER = '0xbc97b93da570249a5d0e8d1df257b8eea7325dfcd12f6245effc4b541f9f77eb';

export interface OnChainConfig {
  platformFeeBps: number;
  adminApprovalThresholdMicro: number;
  dailySpendLimitMicro: number;
  disputeRefundWindowSeconds: number;
  merchantVerificationExpirySeconds: number;
}

/**
 * Read configuration state object from Sui blockchain
 * This is the source of truth for all protocol parameters
 */
export async function readConfigFromChain(): Promise<OnChainConfig | null> {
  try {
    const client = new SuiClient({ url: TESTNET_RPC });
    
    // Get the config manager object
    const configObj = await client.getObject({
      id: CONFIG_MANAGER,
      options: {
        showContent: true,
      },
    });

    if (configObj.data?.content?.dataType === 'moveObject') {
      const fields = (configObj.data.content as any).fields;
      
      return {
        platformFeeBps: parseInt(fields.platform_fee_bps || '250'),
        adminApprovalThresholdMicro: parseInt(fields.admin_approval_threshold_micro || '500000000'),
        dailySpendLimitMicro: parseInt(fields.daily_spend_limit_micro || '1000000000'),
        disputeRefundWindowSeconds: parseInt(fields.dispute_refund_window_seconds || '604800'),
        merchantVerificationExpirySeconds: parseInt(fields.merchant_verification_expiry_seconds || '31536000'),
      };
    }

    return null;
  } catch (error) {
    console.error('Failed to read config from chain:', error);
    return null;
  }
}

/**
 * Utility functions for display
 */
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

/**
 * Check if on-chain values match database values
 */
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
