// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./ConfigManager.sol";

/**
 * @title EscrowLogic
 * @notice Handles USDC fund locking, releasing, refunding and daily spend tracking.
 *         Used internally by CommerceCore.
 */
contract EscrowLogic is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE       = keccak256("ADMIN_ROLE");
    bytes32 public constant COMMERCE_ROLE    = keccak256("COMMERCE_ROLE"); // only CommerceCore

    IERC20         public immutable usdc;
    ConfigManager  public immutable config;

    // orderId → locked amount
    mapping(uint256 => uint256) private lockedFunds;
    // orderId → merchant wallet (for release)
    mapping(uint256 => address) private orderMerchant;
    // orderId → buyer wallet (for refund)
    mapping(uint256 => address) private orderBuyer;

    // Daily spend tracking
    mapping(address => uint256) private dailySpent;
    mapping(address => uint256) private lastSpendDay; // unix day number

    // Platform fee accumulator
    uint256 public treasuryBalance;

    // ── Events ────────────────────────────────────────────────────────
    event FundsLocked(uint256 indexed orderId, uint256 amount);
    event FundsReleased(uint256 indexed orderId, address merchant, uint256 amount);
    event FundsRefunded(uint256 indexed orderId, address buyer, uint256 amount);
    event TreasuryWithdrawn(address indexed to, uint256 amount);

    constructor(address _usdc, address _config, address defaultAdmin) {
        usdc   = IERC20(_usdc);
        config = ConfigManager(_config);
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(ADMIN_ROLE, defaultAdmin);
    }

    // ── Daily Spend ───────────────────────────────────────────────────

    function _todayNumber() internal view returns (uint256) {
        return block.timestamp / 1 days;
    }

    /**
     * @notice Track buyer daily spend; reverts if limit exceeded.
     */
    function trackDailySpend(address wallet, uint256 amount) public onlyRole(COMMERCE_ROLE) {
        _resetIfNewDay(wallet);
        uint256 newTotal = dailySpent[wallet] + amount;
        require(newTotal <= config.dailySpendLimit(), "EscrowLogic: daily spend limit exceeded");
        dailySpent[wallet] = newTotal;
    }

    function _resetIfNewDay(address wallet) internal {
        uint256 today = _todayNumber();
        if (lastSpendDay[wallet] < today) {
            dailySpent[wallet]   = 0;
            lastSpendDay[wallet] = today;
        }
    }

    function getDailySpent(address wallet) external view returns (uint256) {
        if (lastSpendDay[wallet] < _todayNumber()) return 0;
        return dailySpent[wallet];
    }

    function resetDailySpend(address wallet) external onlyRole(ADMIN_ROLE) {
        dailySpent[wallet]   = 0;
        lastSpendDay[wallet] = _todayNumber();
    }

    // ── Fund Lifecycle ────────────────────────────────────────────────

    /**
     * @notice Lock USDC from buyer into escrow.
     *         Called by CommerceCore after transferring USDC here.
     */
    function lockFunds(
        uint256 orderId,
        uint256 amount,
        address merchant,
        address buyer
    ) external onlyRole(COMMERCE_ROLE) {
        require(lockedFunds[orderId] == 0, "EscrowLogic: already locked");
        lockedFunds[orderId]   = amount;
        orderMerchant[orderId] = merchant;
        orderBuyer[orderId]    = buyer;
        emit FundsLocked(orderId, amount);
    }

    /**
     * @notice Release escrowed funds to merchant minus platform fee.
     */
    function releaseFunds(uint256 orderId) external onlyRole(COMMERCE_ROLE) {
        uint256 amount = lockedFunds[orderId];
        require(amount > 0, "EscrowLogic: no funds locked");
        address merchant = orderMerchant[orderId];

        uint256 fee        = (amount * config.platformFeeBps()) / 10_000;
        uint256 merchantAmt = amount - fee;

        lockedFunds[orderId] = 0;
        treasuryBalance += fee;

        usdc.safeTransfer(merchant, merchantAmt);
        emit FundsReleased(orderId, merchant, merchantAmt);
    }

    /**
     * @notice Refund escrowed funds to buyer.
     */
    function refundFunds(uint256 orderId) external onlyRole(COMMERCE_ROLE) {
        uint256 amount = lockedFunds[orderId];
        require(amount > 0, "EscrowLogic: no funds locked");
        address buyer = orderBuyer[orderId];

        lockedFunds[orderId] = 0;

        usdc.safeTransfer(buyer, amount);
        emit FundsRefunded(orderId, buyer, amount);
    }

    /**
     * @notice Admin withdraws accumulated platform fees.
     */
    function withdrawTreasury(address to) external onlyRole(ADMIN_ROLE) {
        uint256 amount = treasuryBalance;
        require(amount > 0, "EscrowLogic: nothing to withdraw");
        treasuryBalance = 0;
        usdc.safeTransfer(to, amount);
        emit TreasuryWithdrawn(to, amount);
    }

    function getLockedFunds(uint256 orderId) external view returns (uint256) {
        return lockedFunds[orderId];
    }
}
