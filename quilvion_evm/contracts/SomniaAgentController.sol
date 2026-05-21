// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ─── Minimal interfaces to existing contracts (no import needed) ───────────────
interface ICommerceCore {
    function setRiskScore(uint256 orderId, uint8 score) external;
    function resolveDispute(uint256 orderId, bool favorBuyer) external;
    function completeOrder(uint256 orderId) external;
    function getOrder(uint256 orderId) external view returns (
        uint256 id,
        address buyer,
        address merchantWallet,
        uint256 amount,
        uint8   status,          // OrderStatus enum index
        bool    isMerchantVerified,
        bool    requiresEscrow,
        bool    disputeRaised,
        uint256 createdAt,
        bytes32 contentHash,
        uint8   riskScore
    );
    function totalOrders() external view returns (uint256);
    function getOrderRiskScore(uint256 orderId) external view returns (uint8);
}

interface IConfigManager {
    function setDailySpendLimit(uint256 amount) external;
    function setAdminApprovalThreshold(uint256 amount) external;
    function setPlatformFee(uint256 bps) external;
    function setRefundWindow(uint256 seconds_) external;
    function dailySpendLimit() external view returns (uint256);
    function adminApprovalThreshold() external view returns (uint256);
    function platformFeeBps() external view returns (uint256);
    function refundWindow() external view returns (uint256);
}

interface IReputationManager {
    function getBuyerXP(address wallet) external view returns (uint256);
    function getBuyerTier(address wallet) external view returns (string memory);
    function getMerchantScore(address wallet) external view returns (uint256);
    function getMerchantOrderCount(address wallet) external view returns (uint256);
}

interface IEscrowLogic {
    function getDailySpent(address wallet) external view returns (uint256);
    function getLockedFunds(uint256 orderId) external view returns (uint256);
    function resetDailySpend(address wallet) external;
    function treasuryBalance() external view returns (uint256);
}

/**
 * @title  SomniaAgentController
 * @author Quilvion Protocol
 * @notice Autonomous AI-agent gateway for the Quilvion commerce protocol,
 *         deployed on Somnia's Agentic L1.
 *
 * ── What it does ───────────────────────────────────────────────────────────────
 *  1. FRAUD SCORING RELAY   — Agent pushes AI-computed risk scores (0–100)
 *                             on-chain via BOT_ROLE in CommerceCore.
 *  2. DISPUTE AUTO-ESCALATION — Disputed orders with high merchant risk get
 *                             auto-resolved by the agent after an escrow timeout.
 *  3. DYNAMIC CONFIG TUNING — Agent adjusts platform limits based on
 *                             volume signals pushed from off-chain analytics.
 *  4. MERCHANT WATCHLIST    — Agent flags merchants whose dispute rate exceeds
 *                             threshold; flagged merchants require manual review.
 *  5. TIER REWARD TRIGGERS  — Agent logs on-chain reward hints when buyers
 *                             cross XP milestones, consumable by the frontend.
 *
 * ── Role model ─────────────────────────────────────────────────────────────────
 *  DEFAULT_ADMIN_ROLE  — Full control, can grant / revoke any role
 *  AGENT_ROLE          — The Somnia AI agent wallet(s); executes autonomous tasks
 *  OPERATOR_ROLE       — Human ops team; can pause agent, update thresholds
 *
 * ── Integration with existing contracts ────────────────────────────────────────
 *  This contract holds BOT_ROLE in CommerceCore (set by admin after deploy).
 *  It holds ADMIN_ROLE in ConfigManager for dynamic tuning (optional; ops decides).
 *  All existing contracts are untouched.
 */
contract SomniaAgentController is AccessControl, ReentrancyGuard {

    // ── Roles ──────────────────────────────────────────────────────────────────
    bytes32 public constant AGENT_ROLE    = keccak256("AGENT_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // ── Protocol contract references ───────────────────────────────────────────
    ICommerceCore     public immutable commerce;
    IConfigManager    public immutable config;
    IReputationManager public immutable reputation;
    IEscrowLogic      public immutable escrow;

    // ── Agent configuration (operator-adjustable) ──────────────────────────────

    /// Minimum risk score (0-100) for the agent to auto-flag an order
    uint8  public riskFlagThreshold = 70;

    /// Minimum risk score for the agent to auto-resolve a dispute in buyer's favour
    uint8  public autoResolveRiskThreshold = 85;

    /// Seconds after which a DISPUTED order can be auto-resolved by the agent
    uint256 public disputeAutoResolveDelay = 48 hours;

    /// Merchant score (0-100) below which merchant is added to watchlist
    uint256 public merchantWatchlistThreshold = 40;

    /// Minimum number of orders before a merchant can be watchlisted
    uint256 public merchantMinOrders = 5;

    /// Max platform fee the agent can ever set (safety ceiling)
    uint256 public maxAgentFeeBps = 500; // 5%

    // ── Agent pausing ──────────────────────────────────────────────────────────
    bool public agentPaused;

    // ── Watchlist ──────────────────────────────────────────────────────────────
    mapping(address => bool)    public merchantWatchlist;
    mapping(address => uint256) public merchantWatchlistedAt;

    // ── Agent task logs ────────────────────────────────────────────────────────

    struct RiskAction {
        uint256 orderId;
        uint8   score;
        uint256 timestamp;
        address agentWallet;
    }

    struct DisputeAction {
        uint256 orderId;
        bool    favorBuyer;
        uint256 timestamp;
        string  reason;
        address agentWallet;
    }

    struct ConfigAction {
        string  parameter;
        uint256 oldValue;
        uint256 newValue;
        uint256 timestamp;
        address agentWallet;
    }

    struct RewardTrigger {
        address buyer;
        uint256 xpSnapshot;
        string  tier;
        uint256 timestamp;
    }

    // ── On-chain audit trail (last 500 entries, ring buffer) ──────────────────
    uint256 private constant LOG_SIZE = 500;

    RiskAction[500]    private _riskLog;
    DisputeAction[500] private _disputeLog;
    ConfigAction[500]  private _configLog;
    RewardTrigger[500] private _rewardLog;

    uint256 private _riskHead;
    uint256 private _disputeHead;
    uint256 private _configHead;
    uint256 private _rewardHead;

    // ── Events ─────────────────────────────────────────────────────────────────
    event AgentRiskScoreSubmitted(uint256 indexed orderId, uint8 score, address indexed agent);
    event AgentDisputeResolved(uint256 indexed orderId, bool favorBuyer, string reason, address indexed agent);
    event AgentConfigUpdated(string indexed parameter, uint256 oldValue, uint256 newValue, address indexed agent);
    event MerchantWatchlisted(address indexed merchant, uint256 score, address indexed agent);
    event MerchantRemovedFromWatchlist(address indexed merchant, address indexed operator);
    event AgentRewardTriggered(address indexed buyer, uint256 xp, string tier, address indexed agent);
    event AgentPaused(address indexed operator);
    event AgentResumed(address indexed operator);
    event ThresholdUpdated(string indexed param, uint256 value);

    // ── Modifiers ──────────────────────────────────────────────────────────────

    modifier agentActive() {
        require(!agentPaused, "SomniaAgent: agent is paused");
        require(hasRole(AGENT_ROLE, msg.sender), "SomniaAgent: caller not agent");
        _;
    }

    // ── Constructor ────────────────────────────────────────────────────────────

    constructor(
        address _commerce,
        address _config,
        address _reputation,
        address _escrow,
        address defaultAdmin,
        address agentWallet
    ) {
        require(_commerce   != address(0), "SomniaAgent: invalid commerce");
        require(_config     != address(0), "SomniaAgent: invalid config");
        require(_reputation != address(0), "SomniaAgent: invalid reputation");
        require(_escrow     != address(0), "SomniaAgent: invalid escrow");

        commerce    = ICommerceCore(_commerce);
        config      = IConfigManager(_config);
        reputation  = IReputationManager(_reputation);
        escrow      = IEscrowLogic(_escrow);

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(OPERATOR_ROLE, defaultAdmin);
        _grantRole(AGENT_ROLE, agentWallet);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  TASK 1 — FRAUD SCORING RELAY
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Agent submits an AI-computed fraud risk score for a single order.
     *         This contract must hold BOT_ROLE in CommerceCore.
     * @param orderId  Target order
     * @param score    Risk score 0–100 (higher = more fraudulent)
     */
    function submitRiskScore(uint256 orderId, uint8 score)
        external
        agentActive
        nonReentrant
    {
        require(score <= 100, "SomniaAgent: invalid score");

        // Push score to CommerceCore (requires BOT_ROLE grant)
        commerce.setRiskScore(orderId, score);

        // Log action
        uint256 slot = _riskHead % LOG_SIZE;
        _riskLog[slot] = RiskAction({
            orderId:     orderId,
            score:       score,
            timestamp:   block.timestamp,
            agentWallet: msg.sender
        });
        _riskHead++;

        emit AgentRiskScoreSubmitted(orderId, score, msg.sender);
    }

    /**
     * @notice Batch risk score submission — up to 50 orders per call.
     *         Gas-efficient for Somnia's high-throughput L1.
     */
    function batchSubmitRiskScores(
        uint256[] calldata orderIds,
        uint8[]   calldata scores
    ) external agentActive nonReentrant {
        require(orderIds.length == scores.length, "SomniaAgent: length mismatch");
        require(orderIds.length <= 50, "SomniaAgent: max 50 per batch");

        for (uint256 i = 0; i < orderIds.length; i++) {
            require(scores[i] <= 100, "SomniaAgent: invalid score");
            commerce.setRiskScore(orderIds[i], scores[i]);

            uint256 slot = _riskHead % LOG_SIZE;
            _riskLog[slot] = RiskAction({
                orderId:     orderIds[i],
                score:       scores[i],
                timestamp:   block.timestamp,
                agentWallet: msg.sender
            });
            _riskHead++;

            emit AgentRiskScoreSubmitted(orderIds[i], scores[i], msg.sender);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  TASK 2 — DISPUTE AUTO-ESCALATION & AUTO-RESOLUTION
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Agent resolves a disputed order autonomously when:
     *         - Order has been DISPUTED for > disputeAutoResolveDelay seconds, AND
     *         - Either risk score >= autoResolveRiskThreshold (favor buyer)
     *           OR merchant is on watchlist (favor buyer)
     *           OR agent provides explicit verdict with documented reason.
     *
     * @param orderId    Disputed order
     * @param favorBuyer Agent's verdict
     * @param reason     Off-chain evidence summary (stored in event + log)
     */
    function agentResolveDispute(
        uint256 orderId,
        bool    favorBuyer,
        string  calldata reason
    ) external agentActive nonReentrant {
        (
            ,               // id
            ,               // buyer
            address merchantWallet,
            ,               // amount
            uint8 status,
            ,               // isMerchantVerified
            ,               // requiresEscrow
            bool  disputeRaised,
            uint256 createdAt,
            ,               // contentHash
            uint8 riskScore
        ) = commerce.getOrder(orderId);

        // status 3 = DISPUTED in CommerceCore enum
        require(status == 3, "SomniaAgent: order not disputed");
        require(disputeRaised, "SomniaAgent: no dispute on record");

        // Enforce delay — agent cannot rush a resolution
        require(
            block.timestamp >= createdAt + disputeAutoResolveDelay,
            "SomniaAgent: resolve delay not passed"
        );

        // Verdict must be justified: high risk OR watchlisted merchant OR favorBuyer explicitly
        bool highRisk         = riskScore >= autoResolveRiskThreshold;
        bool watchlisted      = merchantWatchlist[merchantWallet];
        require(
            highRisk || watchlisted || favorBuyer,
            "SomniaAgent: insufficient evidence for merchant-favor resolution"
        );

        // This contract must hold ADMIN_ROLE in CommerceCore for resolveDispute
        commerce.resolveDispute(orderId, favorBuyer);

        uint256 slot = _disputeHead % LOG_SIZE;
        _disputeLog[slot] = DisputeAction({
            orderId:     orderId,
            favorBuyer:  favorBuyer,
            timestamp:   block.timestamp,
            reason:      reason,
            agentWallet: msg.sender
        });
        _disputeHead++;

        emit AgentDisputeResolved(orderId, favorBuyer, reason, msg.sender);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  TASK 3 — DYNAMIC CONFIG TUNING
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Agent dynamically adjusts the daily spend limit based on
     *         real-time volume analytics fed from off-chain.
     *         This contract must hold ADMIN_ROLE in ConfigManager.
     * @param newLimit  New daily spend limit in USDC (6 decimals)
     */
    function agentSetDailySpendLimit(uint256 newLimit) external agentActive {
        require(newLimit > 0, "SomniaAgent: limit must be > 0");
        uint256 old = config.dailySpendLimit();
        config.setDailySpendLimit(newLimit);
        _logConfig("dailySpendLimit", old, newLimit);
        emit AgentConfigUpdated("dailySpendLimit", old, newLimit, msg.sender);
    }

    /**
     * @notice Agent adjusts the admin approval threshold (escrow trigger level).
     */
    function agentSetAdminApprovalThreshold(uint256 newThreshold) external agentActive {
        require(newThreshold > 0, "SomniaAgent: threshold must be > 0");
        uint256 old = config.adminApprovalThreshold();
        config.setAdminApprovalThreshold(newThreshold);
        _logConfig("adminApprovalThreshold", old, newThreshold);
        emit AgentConfigUpdated("adminApprovalThreshold", old, newThreshold, msg.sender);
    }

    /**
     * @notice Agent adjusts platform fee — hard-capped at maxAgentFeeBps.
     */
    function agentSetPlatformFee(uint256 newFeeBps) external agentActive {
        require(newFeeBps <= maxAgentFeeBps, "SomniaAgent: fee exceeds agent ceiling");
        uint256 old = config.platformFeeBps();
        config.setPlatformFee(newFeeBps);
        _logConfig("platformFeeBps", old, newFeeBps);
        emit AgentConfigUpdated("platformFeeBps", old, newFeeBps, msg.sender);
    }

    /**
     * @notice Agent adjusts refund window duration.
     */
    function agentSetRefundWindow(uint256 newWindow) external agentActive {
        require(newWindow >= 1 hours, "SomniaAgent: window too short");
        require(newWindow <= 30 days,  "SomniaAgent: window too long");
        uint256 old = config.refundWindow();
        config.setRefundWindow(newWindow);
        _logConfig("refundWindow", old, newWindow);
        emit AgentConfigUpdated("refundWindow", old, newWindow, msg.sender);
    }

    function _logConfig(string memory param, uint256 old, uint256 newVal) internal {
        uint256 slot = _configHead % LOG_SIZE;
        _configLog[slot] = ConfigAction({
            parameter:   param,
            oldValue:    old,
            newValue:    newVal,
            timestamp:   block.timestamp,
            agentWallet: msg.sender
        });
        _configHead++;
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  TASK 4 — MERCHANT WATCHLIST
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Agent watchlists a merchant whose on-chain dispute rate is too high.
     *         Reads live data from ReputationManager — no off-chain trust needed.
     * @param merchant  Merchant wallet to evaluate
     */
    function agentWatchlistMerchant(address merchant) external agentActive {
        require(merchant != address(0), "SomniaAgent: zero address");
        require(!merchantWatchlist[merchant], "SomniaAgent: already watchlisted");

        uint256 orderCount = reputation.getMerchantOrderCount(merchant);
        require(orderCount >= merchantMinOrders, "SomniaAgent: insufficient order history");

        uint256 score = reputation.getMerchantScore(merchant);
        require(score < merchantWatchlistThreshold, "SomniaAgent: score above threshold");

        merchantWatchlist[merchant]    = true;
        merchantWatchlistedAt[merchant] = block.timestamp;

        emit MerchantWatchlisted(merchant, score, msg.sender);
    }

    /**
     * @notice Operator removes a merchant from watchlist after manual review.
     */
    function operatorRemoveFromWatchlist(address merchant)
        external
        onlyRole(OPERATOR_ROLE)
    {
        require(merchantWatchlist[merchant], "SomniaAgent: not watchlisted");
        merchantWatchlist[merchant] = false;
        emit MerchantRemovedFromWatchlist(merchant, msg.sender);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  TASK 5 — TIER REWARD TRIGGERS
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Agent emits an on-chain reward trigger whenever a buyer crosses
     *         an XP milestone. Frontend listens for this event to push
     *         personalised rewards, discount codes, or NFT airdrops.
     *
     * @param buyer  Buyer wallet to check
     */
    function agentTriggerReward(address buyer) external agentActive {
        require(buyer != address(0), "SomniaAgent: zero address");

        uint256 xp   = reputation.getBuyerXP(buyer);
        string memory tier = reputation.getBuyerTier(buyer);

        // Only emit if XP is at a meaningful tier boundary
        require(xp >= 10, "SomniaAgent: buyer has no qualifying XP");

        uint256 slot = _rewardHead % LOG_SIZE;
        _rewardLog[slot] = RewardTrigger({
            buyer:       buyer,
            xpSnapshot:  xp,
            tier:        tier,
            timestamp:   block.timestamp
        });
        _rewardHead++;

        emit AgentRewardTriggered(buyer, xp, tier, msg.sender);
    }

    /**
     * @notice Batch reward triggers — up to 100 wallets per call.
     */
    function batchTriggerRewards(address[] calldata buyers)
        external
        agentActive
    {
        require(buyers.length <= 100, "SomniaAgent: max 100 per batch");
        for (uint256 i = 0; i < buyers.length; i++) {
            if (buyers[i] == address(0)) continue;
            uint256 xp = reputation.getBuyerXP(buyers[i]);
            if (xp < 10) continue;

            string memory tier = reputation.getBuyerTier(buyers[i]);

            uint256 slot = _rewardHead % LOG_SIZE;
            _rewardLog[slot] = RewardTrigger({
                buyer:       buyers[i],
                xpSnapshot:  xp,
                tier:        tier,
                timestamp:   block.timestamp
            });
            _rewardHead++;

            emit AgentRewardTriggered(buyers[i], xp, tier, msg.sender);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  OPERATOR CONTROLS
    // ══════════════════════════════════════════════════════════════════════════

    function pauseAgent() external onlyRole(OPERATOR_ROLE) {
        agentPaused = true;
        emit AgentPaused(msg.sender);
    }

    function resumeAgent() external onlyRole(OPERATOR_ROLE) {
        agentPaused = false;
        emit AgentResumed(msg.sender);
    }

    function setRiskFlagThreshold(uint8 val) external onlyRole(OPERATOR_ROLE) {
        riskFlagThreshold = val;
        emit ThresholdUpdated("riskFlagThreshold", val);
    }

    function setAutoResolveRiskThreshold(uint8 val) external onlyRole(OPERATOR_ROLE) {
        autoResolveRiskThreshold = val;
        emit ThresholdUpdated("autoResolveRiskThreshold", val);
    }

    function setDisputeAutoResolveDelay(uint256 val) external onlyRole(OPERATOR_ROLE) {
        require(val >= 1 hours, "SomniaAgent: delay too short");
        disputeAutoResolveDelay = val;
        emit ThresholdUpdated("disputeAutoResolveDelay", val);
    }

    function setMerchantWatchlistThreshold(uint256 val) external onlyRole(OPERATOR_ROLE) {
        require(val <= 100, "SomniaAgent: invalid threshold");
        merchantWatchlistThreshold = val;
        emit ThresholdUpdated("merchantWatchlistThreshold", val);
    }

    function setMerchantMinOrders(uint256 val) external onlyRole(OPERATOR_ROLE) {
        merchantMinOrders = val;
        emit ThresholdUpdated("merchantMinOrders", val);
    }

    function setMaxAgentFeeBps(uint256 val) external onlyRole(OPERATOR_ROLE) {
        require(val <= 1000, "SomniaAgent: ceiling too high"); // absolute max 10%
        maxAgentFeeBps = val;
        emit ThresholdUpdated("maxAgentFeeBps", val);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS — AGENT DASHBOARD
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Latest N risk actions from the circular log (max 50)
    function getRecentRiskActions(uint256 n)
        external
        view
        returns (RiskAction[] memory out)
    {
        n = n > 50 ? 50 : n;
        uint256 total = _riskHead < LOG_SIZE ? _riskHead : LOG_SIZE;
        n = n > total ? total : n;
        out = new RiskAction[](n);
        for (uint256 i = 0; i < n; i++) {
            uint256 idx = (_riskHead - 1 - i) % LOG_SIZE;
            out[i] = _riskLog[idx];
        }
    }

    /// @notice Latest N dispute actions (max 50)
    function getRecentDisputeActions(uint256 n)
        external
        view
        returns (DisputeAction[] memory out)
    {
        n = n > 50 ? 50 : n;
        uint256 total = _disputeHead < LOG_SIZE ? _disputeHead : LOG_SIZE;
        n = n > total ? total : n;
        out = new DisputeAction[](n);
        for (uint256 i = 0; i < n; i++) {
            uint256 idx = (_disputeHead - 1 - i) % LOG_SIZE;
            out[i] = _disputeLog[idx];
        }
    }

    /// @notice Latest N config actions (max 50)
    function getRecentConfigActions(uint256 n)
        external
        view
        returns (ConfigAction[] memory out)
    {
        n = n > 50 ? 50 : n;
        uint256 total = _configHead < LOG_SIZE ? _configHead : LOG_SIZE;
        n = n > total ? total : n;
        out = new ConfigAction[](n);
        for (uint256 i = 0; i < n; i++) {
            uint256 idx = (_configHead - 1 - i) % LOG_SIZE;
            out[i] = _configLog[idx];
        }
    }

    /// @notice Latest N reward triggers (max 100)
    function getRecentRewardTriggers(uint256 n)
        external
        view
        returns (RewardTrigger[] memory out)
    {
        n = n > 100 ? 100 : n;
        uint256 total = _rewardHead < LOG_SIZE ? _rewardHead : LOG_SIZE;
        n = n > total ? total : n;
        out = new RewardTrigger[](n);
        for (uint256 i = 0; i < n; i++) {
            uint256 idx = (_rewardHead - 1 - i) % LOG_SIZE;
            out[i] = _rewardLog[idx];
        }
    }

    /// @notice Aggregated agent stats for monitoring dashboards
    function agentStats()
        external
        view
        returns (
            uint256 totalRiskActions,
            uint256 totalDisputeActions,
            uint256 totalConfigActions,
            uint256 totalRewardTriggers,
            bool    paused
        )
    {
        totalRiskActions    = _riskHead;
        totalDisputeActions = _disputeHead;
        totalConfigActions  = _configHead;
        totalRewardTriggers = _rewardHead;
        paused              = agentPaused;
    }

    /// @notice Live protocol snapshot readable by the agent's off-chain process
    function protocolSnapshot()
        external
        view
        returns (
            uint256 totalOrders,
            uint256 dailySpendLimit,
            uint256 adminApprovalThreshold,
            uint256 platformFeeBps,
            uint256 refundWindow,
            uint256 treasuryBalance
        )
    {
        totalOrders            = commerce.totalOrders();
        dailySpendLimit        = config.dailySpendLimit();
        adminApprovalThreshold = config.adminApprovalThreshold();
        platformFeeBps         = config.platformFeeBps();
        refundWindow           = config.refundWindow();
        treasuryBalance        = escrow.treasuryBalance();
    }
}
