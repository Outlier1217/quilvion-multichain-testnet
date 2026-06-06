export const COMMERCE_CORE_ADDRESS = '0xA1fa19D58335b1341c5B8217E26C766fB605B1bA' as `0x${string}`;
export const MOCK_USDC_ADDRESS     = '0xDbA3C917F0710869e9826F37c1e1ee0fcBa951ad' as `0x${string}`;

export const USDC_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount',  type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner',   type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export const COMMERCE_ABI = [
  {
    name: 'createOrder',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'merchantWallet',     type: 'address' },
      { name: 'amount',             type: 'uint256' },
      { name: 'isMerchantVerified', type: 'bool'    },
    ],
    outputs: [{ name: 'orderId', type: 'uint256' }],
  },
  {
    name: 'raiseDispute',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'orderId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'releaseEscrow',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'orderId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'cancelOrder',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'orderId', type: 'uint256' }],
    outputs: [],
  },
] as const;

// Legacy stubs
export function buildCreateOrder() {}
export function buildRaiseDispute() {}
export function buildReleaseEscrow() {}
export function buildCancelOrder() {}
export function buildDeliverDigitalProduct() {}