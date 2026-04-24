// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

/**
 * @title ReputationManager
 * @notice Buyer XP + tier system, Merchant reputation tracking, ERC1155 NFT tier badges
 */
contract ReputationManager is AccessControl, ERC1155 {

    bytes32 public constant ADMIN_ROLE    = keccak256("ADMIN_ROLE");
    bytes32 public constant COMMERCE_ROLE = keccak256("COMMERCE_ROLE"); // CommerceCore only

    // ── XP Tier Constants ─────────────────────────────────────────────
    uint256 public constant XP_BRONZE = 0;
    uint256 public constant XP_SILVER = 100;
    uint256 public constant XP_GOLD   = 500;

    uint8 public constant TIER_BRONZE = 0;
    uint8 public constant TIER_SILVER = 1;
    uint8 public constant TIER_GOLD   = 2;

    // ── Buyer XP ──────────────────────────────────────────────────────
    mapping(address => uint256) private buyerXP;
    mapping(address => uint8)   private buyerTierCache; // cached tier for badge minting

    // ── Merchant Reputation ───────────────────────────────────────────
    struct MerchantStats {
        uint256 totalOrders;
        uint256 disputes;
        uint256 score; // 0–100, weighted
    }
    mapping(address => MerchantStats) private merchantStats;

    // ── Badge Tracking (ERC1155 token IDs = tier) ─────────────────────
    // tokenId 0 = Bronze, 1 = Silver, 2 = Gold
    mapping(address => mapping(uint8 => bool)) private hasBadgeMinted;

    // ── Events ────────────────────────────────────────────────────────
    event XPAwarded(address indexed buyer, uint256 amount);
    event TierUpgraded(address indexed buyer, string tier);
    event TierBadgeMinted(address indexed wallet, uint8 tier);
    event MerchantScoreUpdated(address indexed merchant, uint256 newScore);

    constructor(address defaultAdmin, string memory badgeURI)
        ERC1155(badgeURI)
    {
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(ADMIN_ROLE, defaultAdmin);
    }

    // ── Buyer XP ──────────────────────────────────────────────────────

    /**
     * @notice Award XP to buyer after a settled order. Called by CommerceCore.
     * @param buyerWallet  The buyer address
     * @param orderId      The settled order ID (for event tracking)
     */
    function awardXP(address buyerWallet, uint256 orderId) external onlyRole(COMMERCE_ROLE) {
        uint256 xpAmount = 10; // 10 XP per order (configurable in future)
        buyerXP[buyerWallet] += xpAmount;

        emit XPAwarded(buyerWallet, xpAmount);

        // Check for tier upgrade
        _checkAndUpgradeTier(buyerWallet);

        // Suppress unused variable warning
        orderId;
    }

    function getBuyerXP(address wallet) external view returns (uint256) {
        return buyerXP[wallet];
    }

    function getBuyerTier(address wallet) external view returns (string memory) {
        return _tierName(_calculateTier(wallet));
    }

    function _calculateTier(address wallet) internal view returns (uint8) {
        uint256 xp = buyerXP[wallet];
        if (xp >= XP_GOLD)   return TIER_GOLD;
        if (xp >= XP_SILVER) return TIER_SILVER;
        return TIER_BRONZE;
    }

    function _tierName(uint8 tier) internal pure returns (string memory) {
        if (tier == TIER_GOLD)   return "Gold";
        if (tier == TIER_SILVER) return "Silver";
        return "Bronze";
    }

    function _checkAndUpgradeTier(address wallet) internal {
        uint8 currentTier = _calculateTier(wallet);
        uint8 cached      = buyerTierCache[wallet];

        if (currentTier > cached) {
            buyerTierCache[wallet] = currentTier;
            emit TierUpgraded(wallet, _tierName(currentTier));
            // Mint badge for new tier
            mintTierBadge(wallet, currentTier);
        }
    }

    // ── NFT Tier Badges (ERC1155) ─────────────────────────────────────

    /**
     * @notice Mint a tier badge NFT. Only on tier upgrade.
     *         Can be called internally or by COMMERCE_ROLE.
     */
    function mintTierBadge(address wallet, uint8 tier) public {
        require(
            hasRole(COMMERCE_ROLE, msg.sender) || msg.sender == address(this),
            "ReputationManager: unauthorized"
        );
        require(tier <= TIER_GOLD, "ReputationManager: invalid tier");
        require(!hasBadgeMinted[wallet][tier], "ReputationManager: badge already minted");

        hasBadgeMinted[wallet][tier] = true;
        _mint(wallet, tier, 1, "");

        emit TierBadgeMinted(wallet, tier);
    }

    function hasBadge(address wallet, uint8 tier) external view returns (bool) {
        return hasBadgeMinted[wallet][tier];
    }

    // ── Merchant Reputation ───────────────────────────────────────────

    /**
     * @notice Update merchant reputation after a settled order.
     * @param merchantWallet  Merchant address
     * @param orderId         Settled order ID (for event tracking)
     * @param disputeRaised   Was a dispute raised on this order?
     */
    function updateMerchantScore(
        address merchantWallet,
        uint256 orderId,
        bool disputeRaised
    ) external onlyRole(COMMERCE_ROLE) {
        MerchantStats storage stats = merchantStats[merchantWallet];
        stats.totalOrders++;

        if (disputeRaised) {
            stats.disputes++;
        }

        // Score formula: 100 * (orders - disputes) / orders
        // Weighted rolling average, capped 0–100
        if (stats.totalOrders > 0) {
            uint256 goodOrders = stats.totalOrders - stats.disputes;
            stats.score = (goodOrders * 100) / stats.totalOrders;
        }

        emit MerchantScoreUpdated(merchantWallet, stats.score);

        // Suppress unused variable warning
        orderId;
    }

    function getMerchantScore(address wallet) external view returns (uint256) {
        return merchantStats[wallet].score;
    }

    function getMerchantOrderCount(address wallet) external view returns (uint256) {
        return merchantStats[wallet].totalOrders;
    }

    // ── ERC1155 URI override ──────────────────────────────────────────

// ── Interface Support ─────────────────────────────────────────────

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl, ERC1155)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // ── ERC1155 URI override ──────────────────────────────────────────

    function setURI(string memory newuri) external onlyRole(ADMIN_ROLE) {
        _setURI(newuri);
    }
}
