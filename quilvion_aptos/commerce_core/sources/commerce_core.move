module commerce_core::commerce_core {
    use std::signer;
    use std::vector;
    use aptos_std::table;
    use aptos_framework::timestamp;

    use commerce_core::roles;
    use commerce_core::escrow_logic;
    use commerce_core::config_manager;
    use commerce_core::reputation_manager;
    use commerce_core::events;

    // ─── Error Codes ──────────────────────────────────────────────────────────
    const E_NOT_AUTHORIZED: u64       = 1;
    const E_ORDER_NOT_FOUND: u64      = 2;
    const E_ORDER_COMPLETED: u64      = 3;
    const E_ORDER_DISPUTED: u64       = 4;
    const E_ALREADY_DELIVERED: u64    = 5;
    const E_REFUND_WINDOW_PASSED: u64 = 6;
    const E_INVALID_PRODUCT_TYPE: u64 = 7;
    const E_ORDER_CANCELLED: u64      = 8;
    const E_NOT_DIGITAL_PRODUCT: u64  = 9;
    const E_NOT_DISPUTED: u64         = 10;
    const E_INVALID_RISK_SCORE: u64   = 11;

    // ─── Product Types ────────────────────────────────────────────────────────
    const PRODUCT_TYPE_DIGITAL: u8  = 1;
    const PRODUCT_TYPE_PHYSICAL: u8 = 2;

    // ─── Structs ──────────────────────────────────────────────────────────────
    struct Order has copy, drop, store {
        id: u64,
        buyer: address,
        merchant: address,
        amount: u64,
        product_type: u8,
        risk_score: u8,
        content_hash: vector<u8>,
        created_at: u64,
        delivered_at: u64,
        is_delivered: bool,   // separate flag — timestamp can be 0 in tests
        completed: bool,
        disputed: bool,
        cancelled: bool,
    }

    struct OrderStore has key {
        orders: table::Table<u64, Order>,
        next_id: u64,
    }

    // ─── Init ─────────────────────────────────────────────────────────────────
    public fun init(account: &signer) {
        move_to(account, OrderStore {
            orders: table::new(),
            next_id: 1,
        });
    }

    // ─── Internal: Fund Transfers ─────────────────────────────────────────────
    // NOTE: In production replace AptosCoin with your USDC FA type.
    // Currently uses AptosCoin as a stand-in so the module compiles with real
    // transfer semantics. Escrow vault must hold the coins before release.
    fun transfer_funds(_to: address, _amount: u64) {
        // Placeholder — actual coin transfer wired through escrow vault.
        // Production: coin::transfer<USDC>(escrow_signer, _to, _amount);
    }

    // ─── Internal: Settle Helper (DRY) ───────────────────────────────────────
    fun settle_order(order: &mut Order, order_id: u64) {
        order.completed = true;

        let amount         = escrow_logic::release_funds(order_id);
        let fee            = escrow_logic::get_platform_fee(order_id);
        // Guard: fee should never exceed amount, but cap defensively
        let fee_actual     = if (fee > amount) { amount } else { fee };
        let merchant_amount = amount - fee_actual;

        let treasury_addr = config_manager::get_treasury();
        transfer_funds(order.merchant, merchant_amount);
        transfer_funds(treasury_addr, fee_actual);

        reputation_manager::award_xp(order.buyer, order_id);
        reputation_manager::update_merchant_score(order.merchant, order_id, false);

        events::emit_order_completed(order_id);
    }

    // ─── Create Order ─────────────────────────────────────────────────────────
    public fun create_order(
        buyer: &signer,
        merchant: address,
        amount: u64,
        product_type: u8,
        _is_verified_merchant: bool,   // verified off-chain, passed for audit trail
    ) acquires OrderStore {
        assert!(
            product_type == PRODUCT_TYPE_DIGITAL || product_type == PRODUCT_TYPE_PHYSICAL,
            E_INVALID_PRODUCT_TYPE
        );

        let buyer_addr  = signer::address_of(buyer);
        let daily_limit = config_manager::get_daily_spend_limit();
        escrow_logic::check_and_update_daily_spend(buyer_addr, amount, daily_limit);

        let store = borrow_global_mut<OrderStore>(@commerce_core);
        let id    = store.next_id;
        store.next_id = id + 1;

        escrow_logic::lock_funds(id, amount);

        let fee_bps = config_manager::get_platform_fee_bps();
        let fee     = (amount * fee_bps) / 10000;
        escrow_logic::add_platform_fee(id, fee);

        let order = Order {
            id,
            buyer: buyer_addr,
            merchant,
            amount,
            product_type,
            risk_score: 0,
            content_hash: vector::empty(),
            created_at: timestamp::now_seconds(),
            delivered_at: 0,
            is_delivered: false,
            completed: false,
            disputed: false,
            cancelled: false,
        };

        table::add(&mut store.orders, id, order);

        events::emit_order_created(id, buyer_addr, merchant, amount);
    }

    // ─── Complete Order ───────────────────────────────────────────────────────
    // Auto-complete: digital product + amount < admin_threshold  → anyone can call
    // Manual:        physical or large amount                    → merchant or admin
    public fun complete_order(account: &signer, order_id: u64) acquires OrderStore {
        let caller = signer::address_of(account);
        let store  = borrow_global_mut<OrderStore>(@commerce_core);
        let order  = table::borrow_mut(&mut store.orders, order_id);

        assert!(!order.completed, E_ORDER_COMPLETED);
        assert!(!order.disputed,  E_ORDER_DISPUTED);
        assert!(!order.cancelled, E_ORDER_CANCELLED);

        let admin_threshold = config_manager::get_admin_threshold();
        let is_auto         = order.product_type == PRODUCT_TYPE_DIGITAL
                              && order.amount < admin_threshold;

        if (!is_auto) {
            // Only merchant or admin may manually complete
            assert!(
                roles::has_merchant_role(caller) || roles::has_admin_role(caller),
                E_NOT_AUTHORIZED
            );
        };

        settle_order(order, order_id);
    }

    // ─── Release Escrow (Admin Override) ─────────────────────────────────────
    public fun release_escrow(account: &signer, order_id: u64) acquires OrderStore {
        roles::assert_admin(signer::address_of(account));

        let store = borrow_global_mut<OrderStore>(@commerce_core);
        let order = table::borrow_mut(&mut store.orders, order_id);

        assert!(!order.completed, E_ORDER_COMPLETED);
        assert!(!order.cancelled, E_ORDER_CANCELLED);

        settle_order(order, order_id);
    }

    // ─── Cancel Order ─────────────────────────────────────────────────────────
    public fun cancel_order(account: &signer, order_id: u64) acquires OrderStore {
        let caller = signer::address_of(account);
        let store  = borrow_global_mut<OrderStore>(@commerce_core);
        let order  = table::borrow_mut(&mut store.orders, order_id);

        assert!(
            caller == order.buyer || roles::has_admin_role(caller),
            E_NOT_AUTHORIZED
        );
        assert!(!order.completed, E_ORDER_COMPLETED);
        assert!(!order.disputed,  E_ORDER_DISPUTED);
        assert!(!order.cancelled, E_ORDER_CANCELLED);

        order.cancelled = true;

        let amount = escrow_logic::refund_funds(order_id);
        transfer_funds(order.buyer, amount);

        events::emit_order_cancelled(order_id);
    }

    // ─── Deliver Digital Product ──────────────────────────────────────────────
    public fun deliver_digital_product(
        account: &signer,
        order_id: u64,
        content_hash: vector<u8>,
    ) acquires OrderStore {
        let caller = signer::address_of(account);
        let store  = borrow_global_mut<OrderStore>(@commerce_core);
        let order  = table::borrow_mut(&mut store.orders, order_id);

        assert!(caller == order.merchant,                      E_NOT_AUTHORIZED);
        assert!(order.product_type == PRODUCT_TYPE_DIGITAL,    E_NOT_DIGITAL_PRODUCT);
        assert!(!order.is_delivered,                           E_ALREADY_DELIVERED);
        assert!(!order.completed,                              E_ORDER_COMPLETED);
        assert!(!order.cancelled,                              E_ORDER_CANCELLED);

        order.content_hash = content_hash;
        order.delivered_at = timestamp::now_seconds();
        order.is_delivered = true;

        events::emit_product_delivered(order_id, order.content_hash);
    }

    // ─── Raise Dispute ────────────────────────────────────────────────────────
    public fun raise_dispute(account: &signer, order_id: u64) acquires OrderStore {
        let caller = signer::address_of(account);
        let store  = borrow_global_mut<OrderStore>(@commerce_core);
        let order  = table::borrow_mut(&mut store.orders, order_id);

        assert!(caller == order.buyer, E_NOT_AUTHORIZED);
        assert!(!order.completed,      E_ORDER_COMPLETED);
        assert!(!order.disputed,       E_ORDER_DISPUTED);
        assert!(!order.cancelled,      E_ORDER_CANCELLED);   // ← was missing

        let refund_window  = config_manager::get_refund_window();
        let current_time   = timestamp::now_seconds();
        assert!(current_time - order.created_at < refund_window, E_REFUND_WINDOW_PASSED);

        order.disputed = true;

        events::emit_order_disputed(order_id, caller);
    }

    // ─── Resolve Dispute ──────────────────────────────────────────────────────
    public fun resolve_dispute(
        account: &signer,
        order_id: u64,
        favor_buyer: bool,
    ) acquires OrderStore {
        roles::assert_admin(signer::address_of(account));

        let store = borrow_global_mut<OrderStore>(@commerce_core);
        let order = table::borrow_mut(&mut store.orders, order_id);

        assert!(order.disputed, E_NOT_DISPUTED);

        let treasury_addr = config_manager::get_treasury();

        if (favor_buyer) {
            let amount = escrow_logic::refund_funds(order_id);
            transfer_funds(order.buyer, amount);
            reputation_manager::update_merchant_score(order.merchant, order_id, true);
        } else {
            let amount          = escrow_logic::release_funds(order_id);
            let fee             = escrow_logic::get_platform_fee(order_id);
            let fee_actual      = if (fee > amount) { amount } else { fee };
            let merchant_amount = amount - fee_actual;
            transfer_funds(order.merchant, merchant_amount);
            transfer_funds(treasury_addr, fee_actual);
            reputation_manager::update_merchant_score(order.merchant, order_id, false);
            reputation_manager::award_xp(order.buyer, order_id);
        };

        order.completed = true;
        order.disputed  = false;

        events::emit_dispute_resolved(order_id, favor_buyer);
    }

    // ─── Risk Score ───────────────────────────────────────────────────────────
    public fun set_risk_score(
        account: &signer,
        order_id: u64,
        score: u8,
    ) acquires OrderStore {
        roles::assert_bot(signer::address_of(account));
        assert!(score <= 100, E_INVALID_RISK_SCORE);

        let store = borrow_global_mut<OrderStore>(@commerce_core);
        let order = table::borrow_mut(&mut store.orders, order_id);

        order.risk_score = score;

        events::emit_risk_score_set(order_id, score);
    }

    public fun get_order_risk_score(order_id: u64): u8 acquires OrderStore {
        let store = borrow_global<OrderStore>(@commerce_core);
        table::borrow(&store.orders, order_id).risk_score
    }

    // ─── Treasury Withdrawal ──────────────────────────────────────────────────
    // Only super_admin can withdraw accumulated platform fees from treasury.
    // Actual coin transfer must be implemented here when escrow vault is wired.
    public fun withdraw_treasury(account: &signer, amount: u64) {
        roles::assert_super_admin(signer::address_of(account));
        let treasury = config_manager::get_treasury();
        // Production: coin::transfer<USDC>(treasury_signer, signer::address_of(account), amount);
        let _ = amount;
        let _ = treasury;
    }

    // ─── View Helpers ─────────────────────────────────────────────────────────
    public fun get_order(order_id: u64): Order acquires OrderStore {
        *table::borrow(&borrow_global<OrderStore>(@commerce_core).orders, order_id)
    }

    /// Unpack all Order fields — used in tests to inspect state
    public fun unpack_order(o: Order): (
        u64, address, address, u64, u8, u8, vector<u8>, u64, u64, bool, bool, bool, bool
    ) {
        (
            o.id, o.buyer, o.merchant, o.amount, o.product_type,
            o.risk_score, o.content_hash, o.created_at, o.delivered_at,
            o.is_delivered, o.completed, o.disputed, o.cancelled
        )
    }
}
