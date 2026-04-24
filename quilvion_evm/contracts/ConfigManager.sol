// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ConfigManager
 * @notice On-chain editable platform configuration — admin controlled
 */
contract ConfigManager is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // ── Config State ──────────────────────────────────────────────────
    uint256 public dailySpendLimit;        // per-wallet daily USDC cap (in USDC units, 6 decimals)
    uint256 public adminApprovalThreshold; // above this → escrow + admin review
    uint256 public platformFeeBps;         // fee in basis points (250 = 2.5%)
    uint256 public refundWindow;           // seconds buyer can raise dispute

    // ── Events ────────────────────────────────────────────────────────
    event DailySpendLimitSet(uint256 amount);
    event AdminApprovalThresholdSet(uint256 amount);
    event PlatformFeeSet(uint256 bps);
    event RefundWindowSet(uint256 seconds_);

    constructor(
        address defaultAdmin,
        uint256 _dailySpendLimit,
        uint256 _adminApprovalThreshold,
        uint256 _platformFeeBps,
        uint256 _refundWindow
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(ADMIN_ROLE, defaultAdmin);

        dailySpendLimit        = _dailySpendLimit;
        adminApprovalThreshold = _adminApprovalThreshold;
        platformFeeBps         = _platformFeeBps;
        refundWindow           = _refundWindow;
    }

    // ── Setters (admin only) ──────────────────────────────────────────

    function setDailySpendLimit(uint256 amount) external onlyRole(ADMIN_ROLE) {
        dailySpendLimit = amount;
        emit DailySpendLimitSet(amount);
    }

    function setAdminApprovalThreshold(uint256 amount) external onlyRole(ADMIN_ROLE) {
        adminApprovalThreshold = amount;
        emit AdminApprovalThresholdSet(amount);
    }

    function setPlatformFee(uint256 bps) external onlyRole(ADMIN_ROLE) {
        require(bps <= 1000, "ConfigManager: fee too high"); // max 10%
        platformFeeBps = bps;
        emit PlatformFeeSet(bps);
    }

    function setRefundWindow(uint256 seconds_) external onlyRole(ADMIN_ROLE) {
        refundWindow = seconds_;
        emit RefundWindowSet(seconds_);
    }
}
