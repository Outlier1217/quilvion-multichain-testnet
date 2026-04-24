// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./ConfigManager.sol";
import "./EscrowLogic.sol";
import "./ReputationManager.sol";

/**
 * @title CommerceCore
 * @notice Main entry-point for the CommerceCore protocol.
 *         Handles order lifecycle, disputes, risk scoring, and coordinates
 *         with EscrowLogic and ReputationManager.
 *
 * Roles:
 *   DEFAULT_ADMIN_ROLE — full control, add/remove any role
 *   ADMIN_ROLE         — release escrow, resolve disputes
 *   BOT_ROLE           — only setRiskScore()
 *   MERCHANT_ROLE      — deliver digital products
 */
contract CommerceCore is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Roles ─────────────────────────────────────────────────────────
    bytes32 public constant ADMIN_ROLE    = keccak256("ADMIN_ROLE");
    bytes32 public constant BOT_ROLE      = keccak256("BOT_ROLE");
    bytes32 public constant MERCHANT_ROLE = keccak256("MERCHANT_ROLE");
    bytes32 public constant COMMERCE_ROLE = keccak256("COMMERCE_ROLE"); // used to auth sub-contracts

    // ── Order State Enum ──────────────────────────────────────────────
    enum OrderStatus {
        PENDING,       // created, funds in escrow
        COMPLETED,     // auto-completed or admin released
        CANCELLED,     // cancelled before fulfillment, refunded
        DISPUTED,      // buyer raised dispute
        RESOLVED_BUYER,    // dispute resolved: buyer refunded
        RESOLVED_MERCHANT  // dispute resolved: merchant paid
    }

    // ── Order Struct ──────────────────────────────────────────────────
    struct Order {
        uint256    id;
        address    buyer;
        address    merchantWallet;
        uint256    amount;            // USDC amount (6 decimals)
        OrderStatus status;
        bool       isMerchantVerified; // passed from frontend (off-chain KYC)
        bool       requiresEscrow;    // above adminApprovalThreshold
        bool       disputeRaised;
        uint256    createdAt;
        bytes32    contentHash;       // IPFS/content hash for digital delivery
        uint8      riskScore;         // AI fraud score 0–100, set by BOT_ROLE
    }

    // ── State ─────────────────────────────────────────────────────────
    IERC20             public immutable usdc;
    ConfigManager      public immutable config;
    EscrowLogic        public immutable escrow;
    ReputationManager  public immutable reputation;

    uint256 private _nextOrderId;
    mapping(uint256 => Order) private _orders;

    // ── Events ────────────────────────────────────────────────────────
    event OrderCreated(uint256 indexed orderId, address indexed buyer, address indexed merchant, uint256 amount);
    event OrderCompleted(uint256 indexed orderId);
    event OrderCancelled(uint256 indexed orderId);
    event OrderDisputed(uint256 indexed orderId, address indexed buyer);
    event DisputeResolved(uint256 indexed orderId, bool favorBuyer);
    event RiskScoreSet(uint256 indexed orderId, uint8 score);
    event DigitalProductDelivered(uint256 indexed orderId, bytes32 contentHash);

    // ── Constructor ───────────────────────────────────────────────────
    constructor(
        address _usdc,
        address _config,
        address _escrow,
        address _reputation,
        address defaultAdmin
    ) {
        usdc       = IERC20(_usdc);
        config     = ConfigManager(_config);
        escrow     = EscrowLogic(_escrow);
        reputation = ReputationManager(_reputation);

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(ADMIN_ROLE, defaultAdmin);
    }

    // ── Modifiers ─────────────────────────────────────────────────────

    modifier orderExists(uint256 orderId) {
        require(orderId < _nextOrderId, "CommerceCore: order not found");
        _;
    }

    modifier onlyBuyer(uint256 orderId) {
        require(_orders[orderId].buyer == msg.sender, "CommerceCore: not buyer");
        _;
    }

    // ── Order Functions ───────────────────────────────────────────────

    /**
     * @notice Buyer creates an order and transfers USDC into escrow.
     * @param merchantWallet     Merchant's wallet address
     * @param amount             USDC amount (6 decimals)
     * @param isMerchantVerified Off-chain KYC status passed by frontend
     */
    function createOrder(
        address merchantWallet,
        uint256 amount,
        bool    isMerchantVerified
    ) external nonReentrant returns (uint256 orderId) {
        require(merchantWallet != address(0), "CommerceCore: invalid merchant");
        require(amount > 0, "CommerceCore: amount must be > 0");

        // Daily spend limit check
        escrow.trackDailySpend(msg.sender, amount);

        // Transfer USDC from buyer → EscrowLogic
        usdc.safeTransferFrom(msg.sender, address(escrow), amount);

        orderId = _nextOrderId++;

        bool requiresEscrow = amount >= config.adminApprovalThreshold();

        _orders[orderId] = Order({
            id:                  orderId,
            buyer:               msg.sender,
            merchantWallet:      merchantWallet,
            amount:              amount,
            status:              OrderStatus.PENDING,
            isMerchantVerified:  isMerchantVerified,
            requiresEscrow:      requiresEscrow,
            disputeRaised:       false,
            createdAt:           block.timestamp,
            contentHash:         bytes32(0),
            riskScore:           0
        });

        // Lock funds in EscrowLogic
        escrow.lockFunds(orderId, amount, merchantWallet, msg.sender);

        emit OrderCreated(orderId, msg.sender, merchantWallet, amount);

        // Auto-complete for small amounts that don't require escrow
        if (!requiresEscrow) {
            _completeOrder(orderId);
        }
    }

    /**
     * @notice Auto-complete for digital / small-amount orders.
     *         Can also be triggered manually by admin.
     */
    function completeOrder(uint256 orderId)
        external
        orderExists(orderId)
        onlyRole(ADMIN_ROLE)
    {
        Order storage order = _orders[orderId];
        require(order.status == OrderStatus.PENDING, "CommerceCore: not pending");
        _completeOrder(orderId);
    }

    function _completeOrder(uint256 orderId) internal {
        Order storage order = _orders[orderId];
        order.status = OrderStatus.COMPLETED;

        escrow.releaseFunds(orderId);
        reputation.awardXP(order.buyer, orderId);
        reputation.updateMerchantScore(order.merchantWallet, orderId, false);

        emit OrderCompleted(orderId);
    }

    /**
     * @notice Admin manually releases escrowed funds to merchant.
     *         Used for high-value orders requiring manual review.
     */
    function releaseEscrow(uint256 orderId)
        external
        orderExists(orderId)
        onlyRole(ADMIN_ROLE)
    {
        Order storage order = _orders[orderId];
        require(order.status == OrderStatus.PENDING, "CommerceCore: not pending");
        require(order.requiresEscrow, "CommerceCore: not an escrow order");

        order.status = OrderStatus.COMPLETED;

        escrow.releaseFunds(orderId);
        reputation.awardXP(order.buyer, orderId);
        reputation.updateMerchantScore(order.merchantWallet, orderId, false);

        emit OrderCompleted(orderId);
    }

    /**
     * @notice Cancel order before fulfillment — refund to buyer.
     *         Only buyer or admin can cancel a PENDING order.
     */
    function cancelOrder(uint256 orderId)
        external
        orderExists(orderId)
        nonReentrant
    {
        Order storage order = _orders[orderId];
        require(order.status == OrderStatus.PENDING, "CommerceCore: cannot cancel");
        require(
            msg.sender == order.buyer || hasRole(ADMIN_ROLE, msg.sender),
            "CommerceCore: not authorized"
        );

        order.status = OrderStatus.CANCELLED;

        escrow.refundFunds(orderId);

        emit OrderCancelled(orderId);
    }

    /**
     * @notice Merchant marks a digital product as delivered with IPFS/content hash.
     * @param orderId     The order ID
     * @param contentHash IPFS CID or content hash of the digital product
     */
    function deliverDigitalProduct(uint256 orderId, bytes32 contentHash)
        external
        orderExists(orderId)
        onlyRole(MERCHANT_ROLE)
    {
        Order storage order = _orders[orderId];
        require(order.status == OrderStatus.PENDING, "CommerceCore: not pending");
        require(contentHash != bytes32(0), "CommerceCore: invalid content hash");

        order.contentHash = contentHash;

        emit DigitalProductDelivered(orderId, contentHash);

        // Auto-release if not requiring admin escrow and no active dispute
        if (!order.requiresEscrow && !order.disputeRaised) {
            _completeOrder(orderId);
        }
    }

    // ── Dispute Functions ─────────────────────────────────────────────

    /**
     * @notice Buyer flags an order within the refund window.
     */
    function raiseDispute(uint256 orderId)
        external
        orderExists(orderId)
        onlyBuyer(orderId)
    {
        Order storage order = _orders[orderId];
        require(order.status == OrderStatus.PENDING, "CommerceCore: not disputable");
        require(
            block.timestamp <= order.createdAt + config.refundWindow(),
            "CommerceCore: refund window expired"
        );

        order.status       = OrderStatus.DISPUTED;
        order.disputeRaised = true;

        emit OrderDisputed(orderId, msg.sender);
    }

    /**
     * @notice Admin resolves a dispute — either refunds buyer or releases to merchant.
     * @param orderId    The disputed order
     * @param favorBuyer true → refund buyer | false → release to merchant
     */
    function resolveDispute(uint256 orderId, bool favorBuyer)
        external
        orderExists(orderId)
        onlyRole(ADMIN_ROLE)
        nonReentrant
    {
        Order storage order = _orders[orderId];
        require(order.status == OrderStatus.DISPUTED, "CommerceCore: not disputed");

        if (favorBuyer) {
            order.status = OrderStatus.RESOLVED_BUYER;
            escrow.refundFunds(orderId);
        } else {
            order.status = OrderStatus.RESOLVED_MERCHANT;
            escrow.releaseFunds(orderId);
            reputation.awardXP(order.buyer, orderId);
        }

        reputation.updateMerchantScore(order.merchantWallet, orderId, true);

        emit DisputeResolved(orderId, favorBuyer);
    }

    // ── Risk Scoring ──────────────────────────────────────────────────

    /**
     * @notice BOT_ROLE sets AI fraud risk score for an order (0–100).
     */
    function setRiskScore(uint256 orderId, uint8 score)
        external
        orderExists(orderId)
        onlyRole(BOT_ROLE)
    {
        require(score <= 100, "CommerceCore: score must be 0-100");
        _orders[orderId].riskScore = score;
        emit RiskScoreSet(orderId, score);
    }

    function getOrderRiskScore(uint256 orderId)
        external
        view
        orderExists(orderId)
        returns (uint8)
    {
        return _orders[orderId].riskScore;
    }

    // ── View Functions ────────────────────────────────────────────────

    function getOrder(uint256 orderId)
        external
        view
        orderExists(orderId)
        returns (Order memory)
    {
        return _orders[orderId];
    }

    function totalOrders() external view returns (uint256) {
        return _nextOrderId;
    }

    // ── Admin: Treasury ───────────────────────────────────────────────

    /**
     * @notice Admin withdraws accumulated platform fees from EscrowLogic.
     */
    function withdrawTreasury(address to) external onlyRole(ADMIN_ROLE) {
        escrow.withdrawTreasury(to);
    }
}
