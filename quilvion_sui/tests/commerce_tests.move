#[test_only]
module quilvion::commerce_test {
    use sui::test_scenario::{Self, Scenario, ctx};
    use sui::test_utils;
    use sui::clock::{Self, Clock};
    use sui::coin::{Self, Coin};
    use sui::balance;
    use sui::sui::SUI;
    
    use quilvion::commerce_core;
    use quilvion::roles;
    use quilvion::config_manager;
    use quilvion::escrow_logic;
    use quilvion::reputation_manager;
    use quilvion::events;
    
    const TEST_ADMIN: address = @0xAdmin;
    const TEST_MERCHANT: address = @0xMerchant;
    const TEST_BUYER: address = @0xBuyer;
    const TEST_BOT: address = @0xBot;
    
    const PRODUCT_ID: u64 = 1;
    const PRODUCT_TYPE_DIGITAL: u8 = 0;
    const ORDER_AMOUNT: u64 = 100_000_000; // 100 USDC
    
    // Setup function to initialize all contracts
    fun setup_test_environment(scenario: &mut Scenario) {
        // Initialize all modules
        roles::init(ctx(scenario));
        config_manager::init(ctx(scenario));
        escrow_logic::init(ctx(scenario));
        reputation_manager::init(ctx(scenario));
        commerce_core::init(ctx(scenario));
        commerce_core::init_verification(ctx(scenario));
        
        // Grant roles
        let role_manager = get_role_manager(scenario);
        
        // Grant ADMIN_ROLE
        roles::grant_role(role_manager, TEST_ADMIN, b"ADMIN_ROLE", ctx(scenario));
        
        // Grant MERCHANT_ROLE
        roles::grant_role(role_manager, TEST_MERCHANT, b"MERCHANT_ROLE", ctx(scenario));
        
        // Grant BOT_ROLE
        roles::grant_role(role_manager, TEST_BOT, b"BOT_ROLE", ctx(scenario));
    }
    
    fun get_role_manager(scenario: &Scenario): &mut roles::RoleManager {
        let role_manager_id = test_scenario::shared_object_id::<roles::RoleManager>(scenario);
        test_scenario::take_shared::<roles::RoleManager>(scenario, role_manager_id)
    }
    
    fun get_config_manager(scenario: &Scenario): &mut config_manager::ConfigManager {
        let config_id = test_scenario::shared_object_id::<config_manager::ConfigManager>(scenario);
        test_scenario::take_shared::<config_manager::ConfigManager>(scenario, config_id)
    }
    
    fun get_escrow_manager(scenario: &Scenario): &mut escrow_logic::EscrowManager {
        let escrow_id = test_scenario::shared_object_id::<escrow_logic::EscrowManager>(scenario);
        test_scenario::take_shared::<escrow_logic::EscrowManager>(scenario, escrow_id)
    }
    
    fun get_rep_manager(scenario: &Scenario): &mut reputation_manager::ReputationManager {
        let rep_id = test_scenario::shared_object_id::<reputation_manager::ReputationManager>(scenario);
        test_scenario::take_shared::<reputation_manager::ReputationManager>(scenario, rep_id)
    }
    
    fun get_commerce_core(scenario: &Scenario): &mut commerce_core::CommerceCore {
        let core_id = test_scenario::shared_object_id::<commerce_core::CommerceCore>(scenario);
        test_scenario::take_shared::<commerce_core::CommerceCore>(scenario, core_id)
    }
    
    // Test 1: Create Order
    #[test]
    fun test_create_order() {
        let scenario = &mut test_scenario::begin(TEST_ADMIN);
        setup_test_environment(scenario);
        
        // Switch to buyer
        test_scenario::next_tx(scenario, TEST_BUYER);
        
        let core = get_commerce_core(scenario);
        let escrow = get_escrow_manager(scenario);
        let config = get_config_manager(scenario);
        let rep = get_rep_manager(scenario);
        let role = get_role_manager(scenario);
        
        // Create mock payment coin
        let payment = coin::mint_for_testing(ORDER_AMOUNT, ctx(scenario));
        let clock = clock::clock_for_testing(ctx(scenario));
        
        // Create order
        commerce_core::create_order(
            core, escrow, config, rep, role,
            PRODUCT_ID, TEST_MERCHANT, ORDER_AMOUNT,
            PRODUCT_TYPE_DIGITAL, payment, clock, ctx(scenario)
        );
        
        // Verify order created
        let risk_score = commerce_core::get_order_risk_score(core, 1);
        assert!(risk_score == 0, 1);
        
        test_scenario::end(scenario);
    }
    
    // Test 2: Complete order (auto-complete for digital)
    #[test]
    fun test_complete_order() {
        let scenario = &mut test_scenario::begin(TEST_ADMIN);
        setup_test_environment(scenario);
        
        // First create order as buyer
        test_scenario::next_tx(scenario, TEST_BUYER);
        
        let core = get_commerce_core(scenario);
        let escrow = get_escrow_manager(scenario);
        let config = get_config_manager(scenario);
        let rep = get_rep_manager(scenario);
        let role = get_role_manager(scenario);
        
        let payment = coin::mint_for_testing(ORDER_AMOUNT, ctx(scenario));
        let clock = clock::clock_for_testing(ctx(scenario));
        
        commerce_core::create_order(
            core, escrow, config, rep, role,
            PRODUCT_ID, TEST_MERCHANT, ORDER_AMOUNT,
            PRODUCT_TYPE_DIGITAL, payment, clock, ctx(scenario)
        );
        
        // Order should be auto-completed
        let risk_score = commerce_core::get_order_risk_score(core, 1);
        assert!(risk_score == 0, 1);
        
        test_scenario::end(scenario);
    }
    
    // Test 3: Set risk score (BOT role)
    #[test]
    fun test_set_risk_score() {
        let scenario = &mut test_scenario::begin(TEST_ADMIN);
        setup_test_environment(scenario);
        
        // Create order as buyer
        test_scenario::next_tx(scenario, TEST_BUYER);
        
        let core = get_commerce_core(scenario);
        let escrow = get_escrow_manager(scenario);
        let config = get_config_manager(scenario);
        let rep = get_rep_manager(scenario);
        let role = get_role_manager(scenario);
        
        let payment = coin::mint_for_testing(ORDER_AMOUNT, ctx(scenario));
        let clock = clock::clock_for_testing(ctx(scenario));
        
        commerce_core::create_order(
            core, escrow, config, rep, role,
            PRODUCT_ID, TEST_MERCHANT, ORDER_AMOUNT,
            PRODUCT_TYPE_DIGITAL, payment, clock, ctx(scenario)
        );
        
        // Switch to BOT to set risk score
        test_scenario::next_tx(scenario, TEST_BOT);
        
        let core = get_commerce_core(scenario);
        let role = get_role_manager(scenario);
        
        commerce_core::set_risk_score(core, role, 1, 85, ctx(scenario));
        
        // Verify risk score
        let risk_score = commerce_core::get_order_risk_score(core, 1);
        assert!(risk_score == 85, 2);
        
        test_scenario::end(scenario);
    }
    
    // Test 4: Raise dispute
    #[test]
    fun test_raise_dispute() {
        let scenario = &mut test_scenario::begin(TEST_ADMIN);
        setup_test_environment(scenario);
        
        // Create order
        test_scenario::next_tx(scenario, TEST_BUYER);
        
        let core = get_commerce_core(scenario);
        let escrow = get_escrow_manager(scenario);
        let config = get_config_manager(scenario);
        let rep = get_rep_manager(scenario);
        let role = get_role_manager(scenario);
        
        let payment = coin::mint_for_testing(ORDER_AMOUNT, ctx(scenario));
        let clock = clock::clock_for_testing(ctx(scenario));
        
        commerce_core::create_order(
            core, escrow, config, rep, role,
            PRODUCT_ID, TEST_MERCHANT, ORDER_AMOUNT,
            1, // PHYSICAL product (won't auto-complete)
            payment, clock, ctx(scenario)
        );
        
        // Raise dispute as buyer
        test_scenario::next_tx(scenario, TEST_BUYER);
        
        let core = get_commerce_core(scenario);
        let config = get_config_manager(scenario);
        let clock = clock::clock_for_testing(ctx(scenario));
        
        commerce_core::raise_dispute(core, config, 1, clock, ctx(scenario));
        
        test_scenario::end(scenario);
    }
    
    // Test 5: Award XP and check tier
    #[test]
    fun test_xp_and_tier() {
        let scenario = &mut test_scenario::begin(TEST_ADMIN);
        setup_test_environment(scenario);
        
        // Create and complete multiple orders
        let mut i = 0;
        while (i < 15) {
            test_scenario::next_tx(scenario, TEST_BUYER);
            
            let core = get_commerce_core(scenario);
            let escrow = get_escrow_manager(scenario);
            let config = get_config_manager(scenario);
            let rep = get_rep_manager(scenario);
            let role = get_role_manager(scenario);
            
            let payment = coin::mint_for_testing(ORDER_AMOUNT, ctx(scenario));
            let clock = clock::clock_for_testing(ctx(scenario));
            
            commerce_core::create_order(
                core, escrow, config, rep, role,
                PRODUCT_ID, TEST_MERCHANT, ORDER_AMOUNT,
                PRODUCT_TYPE_DIGITAL, payment, clock, ctx(scenario)
            );
            
            i = i + 1;
        };
        
        // Check buyer XP and tier
        test_scenario::next_tx(scenario, TEST_ADMIN);
        let rep = get_rep_manager(scenario);
        
        let xp = reputation_manager::get_buyer_xp(rep, TEST_BUYER);
        let tier = reputation_manager::get_buyer_tier(rep, TEST_BUYER);
        
        assert!(xp >= 150, 1); // 15 orders * 10 XP
        assert!(tier == reputation_manager::tier_silver(), 2);
        
        test_scenario::end(scenario);
    }
    
    // Test 6: Daily spend limit
    #[test]
    #[expected_failure(abort_code = 4)]
    fun test_daily_spend_limit() {
        let scenario = &mut test_scenario::begin(TEST_ADMIN);
        setup_test_environment(scenario);
        
        // Set low daily limit
        test_scenario::next_tx(scenario, TEST_ADMIN);
        let config = get_config_manager(scenario);
        let role = get_role_manager(scenario);
        
        config_manager::set_daily_spend_limit(config, 50_000_000, role, ctx(scenario));
        
        // Try to create order exceeding limit
        test_scenario::next_tx(scenario, TEST_BUYER);
        
        let core = get_commerce_core(scenario);
        let escrow = get_escrow_manager(scenario);
        let config = get_config_manager(scenario);
        let rep = get_rep_manager(scenario);
        let role = get_role_manager(scenario);
        
        let payment = coin::mint_for_testing(100_000_000, ctx(scenario));
        let clock = clock::clock_for_testing(ctx(scenario));
        
        // This should fail with daily limit exceeded error
        commerce_core::create_order(
            core, escrow, config, rep, role,
            PRODUCT_ID, TEST_MERCHANT, 100_000_000,
            PRODUCT_TYPE_DIGITAL, payment, clock, ctx(scenario)
        );
        
        test_scenario::end(scenario);
    }
    
    // Test 7: Merchant verification
    #[test]
    fun test_merchant_verification() {
        let scenario = &mut test_scenario::begin(TEST_ADMIN);
        setup_test_environment(scenario);
        
        // Admin verifies merchant
        test_scenario::next_tx(scenario, TEST_ADMIN);
        
        let verification = test_scenario::take_shared::<commerce_core::MerchantVerification>(scenario, 
            test_scenario::shared_object_id::<commerce_core::MerchantVerification>(scenario));
        let role = get_role_manager(scenario);
        let clock = clock::clock_for_testing(ctx(scenario));
        
        let expiry = clock::timestamp_ms(clock) + 365 * 24 * 3600 * 1000;
        commerce_core::set_verified(verification, role, TEST_MERCHANT, expiry, ctx(scenario));
        
        // Check if verified
        let is_verified = commerce_core::is_verified(verification, TEST_MERCHANT, clock);
        assert!(is_verified, 1);
        
        test_scenario::end(scenario);
    }
    
    // Test 8: Admin resolves dispute
    #[test]
    fun test_resolve_dispute_favor_buyer() {
        let scenario = &mut test_scenario::begin(TEST_ADMIN);
        setup_test_environment(scenario);
        
        // Create physical product order
        test_scenario::next_tx(scenario, TEST_BUYER);
        
        let core = get_commerce_core(scenario);
        let escrow = get_escrow_manager(scenario);
        let config = get_config_manager(scenario);
        let rep = get_rep_manager(scenario);
        let role = get_role_manager(scenario);
        
        let payment = coin::mint_for_testing(ORDER_AMOUNT, ctx(scenario));
        let clock = clock::clock_for_testing(ctx(scenario));
        
        commerce_core::create_order(
            core, escrow, config, rep, role,
            PRODUCT_ID, TEST_MERCHANT, ORDER_AMOUNT,
            1, // Physical product
            payment, clock, ctx(scenario)
        );
        
        // Raise dispute
        test_scenario::next_tx(scenario, TEST_BUYER);
        let core = get_commerce_core(scenario);
        let config = get_config_manager(scenario);
        let clock = clock::clock_for_testing(ctx(scenario));
        
        commerce_core::raise_dispute(core, config, 1, clock, ctx(scenario));
        
        // Admin resolves in favor of buyer
        test_scenario::next_tx(scenario, TEST_ADMIN);
        let core = get_commerce_core(scenario);
        let escrow = get_escrow_manager(scenario);
        let rep = get_rep_manager(scenario);
        let role = get_role_manager(scenario);
        let clock = clock::clock_for_testing(ctx(scenario));
        
        commerce_core::resolve_dispute(core, escrow, rep, role, 1, true, clock, ctx(scenario));
        
        test_scenario::end(scenario);
    }
    
    // Test 9: Platform fee calculation
    #[test]
    fun test_platform_fee() {
        let scenario = &mut test_scenario::begin(TEST_ADMIN);
        setup_test_environment(scenario);
        
        // Set platform fee to 2.5%
        test_scenario::next_tx(scenario, TEST_ADMIN);
        let config = get_config_manager(scenario);
        let role = get_role_manager(scenario);
        
        config_manager::set_platform_fee(config, 250, role, ctx(scenario));
        
        // Create order
        test_scenario::next_tx(scenario, TEST_BUYER);
        
        let core = get_commerce_core(scenario);
        let escrow = get_escrow_manager(scenario);
        let config = get_config_manager(scenario);
        let rep = get_rep_manager(scenario);
        let role = get_role_manager(scenario);
        
        let payment = coin::mint_for_testing(1000_000_000, ctx(scenario));
        let clock = clock::clock_for_testing(ctx(scenario));
        
        commerce_core::create_order(
            core, escrow, config, rep, role,
            PRODUCT_ID, TEST_MERCHANT, 1000_000_000,
            PRODUCT_TYPE_DIGITAL, payment, clock, ctx(scenario)
        );
        
        test_scenario::end(scenario);
    }
}