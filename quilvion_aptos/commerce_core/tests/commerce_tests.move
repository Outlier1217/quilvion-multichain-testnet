
#[test_only]
module commerce_core::commerce_tests {
    use aptos_framework::account;
    use aptos_framework::timestamp;

    use commerce_core::commerce_core;
    use commerce_core::config_manager;
    use commerce_core::escrow_logic;
    use commerce_core::roles;
    use commerce_core::reputation_manager;

    // ─── Test Setup Helper ────────────────────────────────────────────────────
    fun setup(aptos: &signer, admin: &signer) {
        // Start blockchain timestamp
        timestamp::set_time_has_started_for_testing(aptos);

        // Init all modules under admin account
        roles::init(admin);
        config_manager::init(admin);
        escrow_logic::init(admin);
        reputation_manager::init(admin);
        commerce_core::init(admin);
    }

    fun make_account(addr: address): signer {
        account::create_account_for_test(addr)
    }

    // ─── TEST 1: Init sanity check ────────────────────────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    fun test_init(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        // If setup doesn't abort, init is working
    }

    // ─── TEST 2: Create digital order ─────────────────────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    fun test_create_digital_order(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        let buyer = make_account(@0xB1);
        let merchant_addr = @0xAA;

        commerce_core::create_order(
            &buyer,
            merchant_addr,
            1_000_000,  // 1 USDC
            1,          // PRODUCT_TYPE_DIGITAL
            true,
        );

        let order = commerce_core::get_order(1);
        let (id, buyer_addr, _, amount, product_type, _, _, _, _, _, completed, disputed, cancelled)
            = commerce_core::unpack_order(order);

        assert!(id == 1, 1);
        assert!(buyer_addr == @0xB1, 2);
        assert!(amount == 1_000_000, 3);
        assert!(product_type == 1, 4);
        assert!(!completed, 5);
        assert!(!disputed, 6);
        assert!(!cancelled, 7);
    }

    // ─── TEST 3: Create physical order ────────────────────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    fun test_create_physical_order(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        let buyer = make_account(@0xB2);

        commerce_core::create_order(&buyer, @0xAA, 5_000_000, 2, false);
        let order = commerce_core::get_order(1);
        let (_, _, _, _, product_type, _, _, _, _, _, _, _, _) = commerce_core::unpack_order(order);
        assert!(product_type == 2, 1);
    }

    // ─── TEST 4: Invalid product type should abort ─────────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    #[expected_failure(abort_code = 7, location = commerce_core::commerce_core)]
    fun test_invalid_product_type(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        let buyer = make_account(@0xB3);
        commerce_core::create_order(&buyer, @0xAA, 1_000_000, 99, false); // invalid type
    }

    // ─── TEST 5: Auto-complete digital order (small amount) ───────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    fun test_auto_complete_digital_order(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        let buyer = make_account(@0xB4);
        let anyone = make_account(@0xCC); // anyone can auto-complete

        commerce_core::create_order(&buyer, @0xAA, 1_000_000, 1, true);
        commerce_core::complete_order(&anyone, 1);

        let order = commerce_core::get_order(1);
        let (_, _, _, _, _, _, _, _, _, _, completed, _, _) = commerce_core::unpack_order(order);
        assert!(completed, 1);
    }

    // ─── TEST 6: Manual complete by merchant ──────────────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    fun test_manual_complete_by_merchant(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        let buyer    = make_account(@0xB5);
        let merchant = make_account(@0xE1);

        // Grant merchant role
        roles::grant_merchant_role(admin, @0xE1);

        // Create large order (above threshold → manual required)
        commerce_core::create_order(&buyer, @0xE1, 500_000_000, 1, true);
        commerce_core::complete_order(&merchant, 1);

        let order = commerce_core::get_order(1);
        let (_, _, _, _, _, _, _, _, _, _, completed, _, _) = commerce_core::unpack_order(order);
        assert!(completed, 1);
    }

    // ─── TEST 7: Non-merchant cannot manually complete ─────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    #[expected_failure(abort_code = 1, location = commerce_core::commerce_core)]
    fun test_unauthorized_complete(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        let buyer   = make_account(@0xB6);
        let random  = make_account(@0xF1);

        commerce_core::create_order(&buyer, @0xAA, 500_000_000, 1, true);
        commerce_core::complete_order(&random, 1); // should abort
    }

    // ─── TEST 8: Cancel order by buyer ────────────────────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    fun test_cancel_order(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        let buyer = make_account(@0xB7);

        commerce_core::create_order(&buyer, @0xAA, 1_000_000, 1, true);
        commerce_core::cancel_order(&buyer, 1);

        let order = commerce_core::get_order(1);
        let (_, _, _, _, _, _, _, _, _, _, _, _, cancelled) = commerce_core::unpack_order(order);
        assert!(cancelled, 1);
    }

    // ─── TEST 9: Cannot cancel completed order ────────────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    #[expected_failure(abort_code = 3, location = commerce_core::commerce_core)]
    fun test_cannot_cancel_completed(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        let buyer  = make_account(@0xB8);
        let anyone = make_account(@0xCC);

        commerce_core::create_order(&buyer, @0xAA, 1_000_000, 1, true);
        commerce_core::complete_order(&anyone, 1);
        commerce_core::cancel_order(&buyer, 1); // should abort
    }

    // ─── TEST 10: Deliver digital product ─────────────────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    fun test_deliver_digital_product(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        let buyer    = make_account(@0xB9);
        let merchant = make_account(@0xA1);  // @0xAA avoid — use safe address

        commerce_core::create_order(&buyer, @0xA1, 1_000_000, 1, true);

        let hash = b"QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco";
        commerce_core::deliver_digital_product(&merchant, 1, hash);

        let order = commerce_core::get_order(1);
        let (_, _, _, _, _, _, content_hash, _, _, is_delivered, _, _, _) = commerce_core::unpack_order(order);
        assert!(is_delivered, 10);
        assert!(content_hash == hash, 11);
    }

    // ─── TEST 11: Cannot deliver twice ───────────────────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    #[expected_failure(abort_code = 5, location = commerce_core::commerce_core)]
    fun test_cannot_deliver_twice(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        let buyer    = make_account(@0xBA);
        let merchant = make_account(@0xA1);

        commerce_core::create_order(&buyer, @0xA1, 1_000_000, 1, true);
        let hash = b"QmHash1";
        commerce_core::deliver_digital_product(&merchant, 1, hash);
        commerce_core::deliver_digital_product(&merchant, 1, hash); // should abort with E_ALREADY_DELIVERED=5
    }

    // ─── TEST 12: Raise dispute ───────────────────────────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    fun test_raise_dispute(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        let buyer = make_account(@0xBB);

        commerce_core::create_order(&buyer, @0xAA, 1_000_000, 1, true);
        commerce_core::raise_dispute(&buyer, 1);

        let order = commerce_core::get_order(1);
        let (_, _, _, _, _, _, _, _, _, _, _, disputed, _) = commerce_core::unpack_order(order);
        assert!(disputed, 1);
    }

    // ─── TEST 13: Only buyer can raise dispute ────────────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    #[expected_failure(abort_code = 1, location = commerce_core::commerce_core)]
    fun test_only_buyer_raises_dispute(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        let buyer  = make_account(@0xBC);
        let random = make_account(@0xF2);

        commerce_core::create_order(&buyer, @0xAA, 1_000_000, 1, true);
        commerce_core::raise_dispute(&random, 1); // should abort
    }

    // ─── TEST 14: Resolve dispute favor buyer ─────────────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    fun test_resolve_dispute_favor_buyer(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        let buyer = make_account(@0xBD);

        commerce_core::create_order(&buyer, @0xAA, 1_000_000, 1, true);
        commerce_core::raise_dispute(&buyer, 1);
        commerce_core::resolve_dispute(admin, 1, true);

        let order = commerce_core::get_order(1);
        let (_, _, _, _, _, _, _, _, _, _, completed, disputed, _) = commerce_core::unpack_order(order);
        assert!(completed, 1);
        assert!(!disputed, 2);
    }

    // ─── TEST 15: Resolve dispute favor merchant ──────────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    fun test_resolve_dispute_favor_merchant(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        let buyer = make_account(@0xBE);

        commerce_core::create_order(&buyer, @0xAA, 1_000_000, 1, true);
        commerce_core::raise_dispute(&buyer, 1);
        commerce_core::resolve_dispute(admin, 1, false);

        let order = commerce_core::get_order(1);
        let (_, _, _, _, _, _, _, _, _, _, completed, _, _) = commerce_core::unpack_order(order);
        assert!(completed, 1);
    }

    // ─── TEST 16: Set risk score (bot only) ───────────────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    fun test_set_risk_score(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        let buyer = make_account(@0xBF);
        let bot   = make_account(@0xB0);

        roles::grant_bot_role(admin, @0xB0);

        commerce_core::create_order(&buyer, @0xAA, 1_000_000, 1, true);
        commerce_core::set_risk_score(&bot, 1, 75);

        assert!(commerce_core::get_order_risk_score(1) == 75, 1);
    }

    // ─── TEST 17: Non-bot cannot set risk score ───────────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    #[expected_failure(abort_code = 3, location = commerce_core::roles)]
    fun test_non_bot_cannot_set_risk_score(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        let buyer  = make_account(@0xC0);
        let random = make_account(@0xF3);

        commerce_core::create_order(&buyer, @0xAA, 1_000_000, 1, true);
        commerce_core::set_risk_score(&random, 1, 50); // should abort
    }

    // ─── TEST 18: Risk score > 100 should abort ───────────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    #[expected_failure(abort_code = 11, location = commerce_core::commerce_core)]
    fun test_risk_score_out_of_range(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        let buyer = make_account(@0xC1);
        let bot   = make_account(@0xB0);

        roles::grant_bot_role(admin, @0xB0);
        commerce_core::create_order(&buyer, @0xAA, 1_000_000, 1, true);
        commerce_core::set_risk_score(&bot, 1, 101); // should abort
    }

    // ─── TEST 19: Daily spend limit ───────────────────────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    #[expected_failure(abort_code = 1, location = commerce_core::escrow_logic)]
    fun test_daily_spend_limit(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        let buyer = make_account(@0xC2);

        // Set limit to 10 USDC
        config_manager::set_daily_spend_limit(admin, 10_000_000);

        // First order fine (5 USDC)
        commerce_core::create_order(&buyer, @0xAA, 5_000_000, 1, true);
        // Second order fine (4 USDC, total 9)
        commerce_core::create_order(&buyer, @0xAA, 4_000_000, 1, true);
        // Third order exceeds limit (3 USDC, total 12 > 10) → should abort
        commerce_core::create_order(&buyer, @0xAA, 3_000_000, 1, true);
    }

    // ─── TEST 20: Admin release escrow ────────────────────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    fun test_admin_release_escrow(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        let buyer = make_account(@0xC3);

        commerce_core::create_order(&buyer, @0xAA, 500_000_000, 2, false); // physical, large
        commerce_core::release_escrow(admin, 1);

        let order = commerce_core::get_order(1);
        let (_, _, _, _, _, _, _, _, _, _, completed, _, _) = commerce_core::unpack_order(order);
        assert!(completed, 1);
    }

    // ─── TEST 21: Buyer XP awarded after order ─────────────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    fun test_buyer_xp_awarded(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        let buyer  = make_account(@0xC4);
        let anyone = make_account(@0xCC);

        commerce_core::create_order(&buyer, @0xAA, 1_000_000, 1, true);
        commerce_core::complete_order(&anyone, 1);

        let xp = reputation_manager::get_buyer_xp(@0xC4);
        assert!(xp == 10, 1);
    }

    // ─── TEST 22: Buyer tier progression ──────────────────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    fun test_buyer_tier_progression(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        let buyer  = make_account(@0xC5);
        let anyone = make_account(@0xCC);

        // Start at Bronze
        assert!(reputation_manager::get_buyer_tier(@0xC5) == 1, 0);

        // Complete 10 orders → 100 XP → Silver
        let i = 0;
        while (i < 10) {
            commerce_core::create_order(&buyer, @0xAA, 1_000_000, 1, true);
            commerce_core::complete_order(&anyone, i + 1);
            i = i + 1;
        };

        assert!(reputation_manager::get_buyer_tier(@0xC5) == 2, 1); // Silver

        // Complete 40 more → 500 XP → Gold
        while (i < 50) {
            commerce_core::create_order(&buyer, @0xAA, 1_000_000, 1, true);
            commerce_core::complete_order(&anyone, i + 1);
            i = i + 1;
        };

        assert!(reputation_manager::get_buyer_tier(@0xC5) == 3, 2); // Gold
    }

    // ─── TEST 23: Merchant score drops on dispute ─────────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    fun test_merchant_score_on_dispute(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        let buyer = make_account(@0xC6);

        commerce_core::create_order(&buyer, @0xAA, 1_000_000, 1, true);
        commerce_core::raise_dispute(&buyer, 1);
        commerce_core::resolve_dispute(admin, 1, true); // favor buyer → dispute counted

        let score = reputation_manager::get_merchant_score(@0xAA);
        assert!(score == 990, 1); // 1000 - (1 * 10) = 990
    }

    // ─── TEST 24: Config manager setters ─────────────────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    fun test_config_setters(aptos: &signer, admin: &signer) {
        setup(aptos, admin);

        config_manager::set_daily_spend_limit(admin, 999);
        config_manager::set_admin_threshold(admin, 888);
        config_manager::set_platform_fee(admin, 300);
        config_manager::set_refund_window(admin, 3600);

        assert!(config_manager::get_daily_spend_limit() == 999, 1);
        assert!(config_manager::get_admin_threshold()   == 888, 2);
        assert!(config_manager::get_platform_fee_bps()  == 300, 3);
        assert!(config_manager::get_refund_window()     == 3600, 4);
    }

    // ─── TEST 25: Platform fee > 100% should abort ────────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    #[expected_failure(abort_code = 1, location = commerce_core::config_manager)]
    fun test_invalid_platform_fee(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        config_manager::set_platform_fee(admin, 10001); // > 100%
    }

    // ─── TEST 26: Roles grant/revoke ──────────────────────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    fun test_roles(aptos: &signer, admin: &signer) {
        setup(aptos, admin);

        roles::grant_admin_role(admin, @0xD1);
        assert!(roles::has_admin_role(@0xD1), 1);

        roles::revoke_admin_role(admin, @0xD1);
        assert!(!roles::has_admin_role(@0xD1), 2);

        roles::grant_bot_role(admin, @0xD2);
        assert!(roles::has_bot_role(@0xD2), 3);

        roles::grant_merchant_role(admin, @0xD3);
        assert!(roles::has_merchant_role(@0xD3), 4);
    }

    // ─── TEST 27: Non-admin cannot grant roles ────────────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    #[expected_failure(abort_code = 1, location = commerce_core::roles)]
    fun test_non_admin_cannot_grant_roles(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        let random = make_account(@0xF4);
        roles::grant_admin_role(&random, @0xD4); // should abort
    }

    // ─── TEST 28: Withdraw treasury (super admin only) ────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    fun test_withdraw_treasury(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        commerce_core::withdraw_treasury(admin, 100_000);
        // If no abort → super admin check passed
    }

    // ─── TEST 29: Non-super-admin cannot withdraw treasury ────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    #[expected_failure(abort_code = 1, location = commerce_core::roles)]
    fun test_non_super_admin_cannot_withdraw(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        let random = make_account(@0xF5);
        commerce_core::withdraw_treasury(&random, 100_000); // should abort
    }

    // ─── TEST 30: Badge minted on tier upgrade ────────────────────────────────
    #[test(aptos = @0x1, admin = @commerce_core)]
    fun test_badge_on_tier_upgrade(aptos: &signer, admin: &signer) {
        setup(aptos, admin);
        let buyer  = make_account(@0xC7);
        let anyone = make_account(@0xCC);

        // No badge at start
        assert!(!reputation_manager::has_badge(@0xC7, 2), 0); // no Silver badge

        // Complete 10 orders → Silver tier
        let i = 0;
        while (i < 10) {
            commerce_core::create_order(&buyer, @0xAA, 1_000_000, 1, true);
            commerce_core::complete_order(&anyone, i + 1);
            i = i + 1;
        };

        assert!(reputation_manager::has_badge(@0xC7, 2), 1); // Silver badge minted
    }
}
