📦 CommerceCore
Order Functions
createOrder(productId, merchantWallet, amount) — buyer creates order, USDC transferred to contract

completeOrder(orderId) — auto-complete for digital + small amount orders

releaseEscrow(orderId) — admin manually releases escrowed funds to merchant

cancelOrder(orderId) — cancel before fulfillment, refund to buyer

deliverDigitalProduct(orderId, contentHash) — merchant marks delivered with IPFS/content hash

Dispute Functions
raiseDispute(orderId) — buyer flags order within refund window

resolveDispute(orderId, favorBuyer) — admin resolves, either refunds buyer or releases to merchant

Risk Scoring
setRiskScore(orderId, score) — BOT_ROLE only, sets AI fraud score 0–100

getOrderRiskScore(orderId) — view function, returns score

⚙️ ConfigManager
Sab kuch admin editable, on-chain:

setDailySpendLimit(amount) — per wallet daily USDC cap

setAdminApprovalThreshold(amount) — above this amount → escrow + admin review

setPlatformFee(bps) — fee in basis points (e.g. 250 = 2.5%)

setRefundWindow(seconds) — dispute raise karne ki time window

👥 Roles
DEFAULT_ADMIN_ROLE — full control, add/remove any role

ADMIN_ROLE — release escrow, resolve disputes

BOT_ROLE — sirf setRiskScore() call kar sakta hai, kuch aur nahi

MERCHANT_ROLE — product add/edit, order deliver kar sakta hai

grantRole / revokeRole — OpenZeppelin standard

✅ Merchant Management (OFF-CHAIN only)
⚠️ NOTE: Merchant verification is handled OFF-CHAIN only. No on-chain registration.

Merchant KYC and verification done off-chain by platform

Verified merchant flag passed as parameter in createOrder() from frontend

No setVerified(), revokeVerification(), or isVerified() functions on-chain

Merchant reputation tracked via ReputationManager only

🏆 ReputationManager
XP — Buyer Side
awardXP(buyerWallet, orderId) — CommerceCore order settle hone pe call karta hai

getBuyerXP(wallet) — total XP view

getBuyerTier(wallet) — returns Bronze / Silver / Gold based on XP thresholds

XP_BRONZE = 0, XP_SILVER = 100, XP_GOLD = 500 — constants

Reputation — Merchant Side
updateMerchantScore(merchantWallet, orderId, disputeRaised) — settled order ke baad call hota hai

getMerchantScore(wallet) — aggregated score view

getMerchantOrderCount(wallet) — total settled orders

NFT Badge (Optional)
mintTierBadge(wallet, tier) — ERC1155 style, sirf tier upgrade pe mint hoga

hasBadge(wallet, tier) — view function

🔒 EscrowLogic
lockFunds(orderId, amount) — order create hone pe funds lock

releaseFunds(orderId) — admin ya auto-complete pe merchant ko release

refundFunds(orderId) — dispute resolve favor buyer pe

trackDailySpend(wallet, amount) — daily limit check, revert if exceeded

getDailySpent(wallet) — aaj kitna spend hua, view function

resetDailySpend(wallet) — midnight ke baad reset (timestamp based)

📡 Events
solidity
event OrderCreated(uint256 orderId, address buyer, address merchant, uint256 amount);
event OrderCompleted(uint256 orderId);
event OrderDisputed(uint256 orderId, address buyer);
event DisputeResolved(uint256 orderId, bool favorBuyer);
event RiskScoreSet(uint256 orderId, uint8 score);
event XPAwarded(address buyer, uint256 amount);
event TierUpgraded(address buyer, string tier);
event TierBadgeMinted(address wallet, uint8 tier);
Note: MerchantVerified event REMOVED — no on-chain verification



product_type (DIGITAL only)	Haan, digital product logic ke liye
risk_score field in Order	Haan, AI fraud score ke liye
content_hash for delivery	Haan, digital product delivery ke liye
Daily spend tracking	Haan, security ke liye
Treasury withdrawal (withdraw_treasury())	Haan, admin fee collect kar sake