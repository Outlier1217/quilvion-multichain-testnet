module commerce_core::config_manager {
    use std::signer;
    use commerce_core::roles;

    // ─── Error Codes ──────────────────────────────────────────────────────────
    const E_INVALID_FEE_BPS: u64 = 1;  // fee bps cannot exceed 100%

    // ─── Config Struct ────────────────────────────────────────────────────────
    struct Config has key {
        admin: address,
        daily_spend_limit: u64,   // max USDC a buyer can spend per day (octas)
        admin_threshold: u64,     // orders above this require manual release (octas)
        platform_fee_bps: u64,    // platform fee in basis points (250 = 2.5%)
        refund_window: u64,       // seconds within which a dispute can be raised
        treasury: address,        // platform fee recipient
    }

    // ─── Init ─────────────────────────────────────────────────────────────────
    public fun init(account: &signer) {
        move_to(account, Config {
            admin: signer::address_of(account),
            daily_spend_limit: 1_000_000_000,  // 1000 USDC (6 decimals)
            admin_threshold:     100_000_000,  // 100 USDC
            platform_fee_bps:            250,  // 2.5%
            refund_window:             86400,  // 24 hours
            treasury: signer::address_of(account),
        });
    }

    // ─── Setters (admin only) ─────────────────────────────────────────────────
    public fun set_daily_spend_limit(account: &signer, limit: u64) acquires Config {
        roles::assert_admin(signer::address_of(account));
        borrow_global_mut<Config>(@commerce_core).daily_spend_limit = limit;
    }

    public fun set_admin_threshold(account: &signer, threshold: u64) acquires Config {
        roles::assert_admin(signer::address_of(account));
        borrow_global_mut<Config>(@commerce_core).admin_threshold = threshold;
    }

    public fun set_platform_fee(account: &signer, bps: u64) acquires Config {
        roles::assert_admin(signer::address_of(account));
        assert!(bps <= 10000, E_INVALID_FEE_BPS);
        borrow_global_mut<Config>(@commerce_core).platform_fee_bps = bps;
    }

    public fun set_refund_window(account: &signer, secs: u64) acquires Config {
        roles::assert_admin(signer::address_of(account));
        borrow_global_mut<Config>(@commerce_core).refund_window = secs;
    }

    public fun set_treasury(account: &signer, treasury_addr: address) acquires Config {
        roles::assert_admin(signer::address_of(account));
        borrow_global_mut<Config>(@commerce_core).treasury = treasury_addr;
    }

    // ─── Getters ──────────────────────────────────────────────────────────────
    public fun get_daily_spend_limit(): u64 acquires Config {
        borrow_global<Config>(@commerce_core).daily_spend_limit
    }

    public fun get_admin_threshold(): u64 acquires Config {
        borrow_global<Config>(@commerce_core).admin_threshold
    }

    public fun get_platform_fee_bps(): u64 acquires Config {
        borrow_global<Config>(@commerce_core).platform_fee_bps
    }

    public fun get_refund_window(): u64 acquires Config {
        borrow_global<Config>(@commerce_core).refund_window
    }

    public fun get_treasury(): address acquires Config {
        borrow_global<Config>(@commerce_core).treasury
    }
}
