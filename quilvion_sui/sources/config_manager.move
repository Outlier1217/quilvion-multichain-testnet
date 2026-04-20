module quilvion::config_manager {
    use quilvion::roles;

    // Configuration constants
    const DEFAULT_DAILY_SPEND_LIMIT: u64 = 1_000_000_000; // 1000 USDC (6 decimals)
    const DEFAULT_ADMIN_THRESHOLD: u64 = 500_000_000;     // 500 USDC
    const DEFAULT_PLATFORM_FEE: u16 = 250;                // 2.5% in basis points
    const DEFAULT_REFUND_WINDOW: u64 = 7 * 24 * 3600;    // 7 days in seconds
    const DEFAULT_VERIFICATION_EXPIRY: u64 = 365 * 24 * 3600; // 1 year

    // Error codes
    const ENotAuthorized: u64 = 1;
    const EInvalidBasisPoints: u64 = 2;

    // Config Manager object — `public` required in Move 2024
    public struct ConfigManager has key {
        id: UID,
        daily_spend_limit: u64,
        admin_approval_threshold: u64,
        platform_fee_bps: u16,
        refund_window_seconds: u64,
        verification_expiry_seconds: u64,
    }

    // `init` must NOT be `public` in Move 2024
    fun init(ctx: &mut TxContext) {
        let config_manager = ConfigManager {
            id: object::new(ctx),
            daily_spend_limit: DEFAULT_DAILY_SPEND_LIMIT,
            admin_approval_threshold: DEFAULT_ADMIN_THRESHOLD,
            platform_fee_bps: DEFAULT_PLATFORM_FEE,
            refund_window_seconds: DEFAULT_REFUND_WINDOW,
            verification_expiry_seconds: DEFAULT_VERIFICATION_EXPIRY,
        };
        transfer::share_object(config_manager);
    }

    // Set daily spend limit (admin only)
    public fun set_daily_spend_limit(
        config: &mut ConfigManager,
        amount: u64,
        role_manager: &roles::RoleManager,
        ctx: &TxContext,
    ) {
        assert!(roles::is_admin(role_manager, tx_context::sender(ctx)), ENotAuthorized);
        config.daily_spend_limit = amount;
    }

    // Set admin approval threshold (admin only)
    public fun set_admin_approval_threshold(
        config: &mut ConfigManager,
        amount: u64,
        role_manager: &roles::RoleManager,
        ctx: &TxContext,
    ) {
        assert!(roles::is_admin(role_manager, tx_context::sender(ctx)), ENotAuthorized);
        config.admin_approval_threshold = amount;
    }

    // Set platform fee in basis points (admin only)
    public fun set_platform_fee(
        config: &mut ConfigManager,
        bps: u16,
        role_manager: &roles::RoleManager,
        ctx: &TxContext,
    ) {
        assert!(roles::is_admin(role_manager, tx_context::sender(ctx)), ENotAuthorized);
        assert!(bps <= 10000, EInvalidBasisPoints);
        config.platform_fee_bps = bps;
    }

    // Set refund window in seconds (admin only) — `pub` is invalid, use `public`
    public fun set_refund_window(
        config: &mut ConfigManager,
        seconds: u64,
        role_manager: &roles::RoleManager,
        ctx: &TxContext,
    ) {
        assert!(roles::is_admin(role_manager, tx_context::sender(ctx)), ENotAuthorized);
        config.refund_window_seconds = seconds;
    }

    // Set verification expiry in seconds (admin only)
    public fun set_verification_expiry(
        config: &mut ConfigManager,
        seconds: u64,
        role_manager: &roles::RoleManager,
        ctx: &TxContext,
    ) {
        assert!(roles::is_admin(role_manager, tx_context::sender(ctx)), ENotAuthorized);
        config.verification_expiry_seconds = seconds;
    }

    // View functions
    public fun get_daily_spend_limit(config: &ConfigManager): u64 {
        config.daily_spend_limit
    }

    public fun get_admin_approval_threshold(config: &ConfigManager): u64 {
        config.admin_approval_threshold
    }

    public fun get_platform_fee_bps(config: &ConfigManager): u16 {
        config.platform_fee_bps
    }

    public fun get_refund_window(config: &ConfigManager): u64 {
        config.refund_window_seconds
    }

    public fun get_verification_expiry(config: &ConfigManager): u64 {
        config.verification_expiry_seconds
    }
}
