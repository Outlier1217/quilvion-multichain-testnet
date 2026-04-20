module quilvion::commerce_core {
    use sui::clock::Clock;
    use sui::coin::Coin;
    use sui::sui::SUI;
    use sui::table::{Self, Table};
    use quilvion::roles;
    use quilvion::config_manager;
    use quilvion::escrow_logic;
    use quilvion::reputation_manager;
    use quilvion::events;

    // Order status constants
    const ORDER_STATUS_PENDING: u8          = 0;
    const ORDER_STATUS_COMPLETED: u8        = 1;
    const ORDER_STATUS_DISPUTED: u8         = 2;
    const ORDER_STATUS_CANCELLED: u8        = 3;
    const ORDER_STATUS_ESCROW_RELEASED: u8  = 4;
    const ORDER_STATUS_REFUNDED: u8         = 5;

    // Product type constants
    const PRODUCT_TYPE_DIGITAL: u8  = 0;
    // const PRODUCT_TYPE_PHYSICAL: u8 = 1; // reserved for future use

    // Error codes
    const ENotMerchant: u64    = 1;
    const ENotBuyer: u64       = 2;
    const EOrderNotFound: u64  = 3;
    const EInvalidStatus: u64  = 4;
    const EDisputeTooLate: u64 = 5;
    const EAlreadyDisputed: u64 = 6;
    const ENotAuthorized: u64  = 7;
    const EOrderNotPending: u64 = 8;

    // Order structure — `public` required in Move 2024
    public struct Order has store {
        id: u64,
        product_id: u64,
        buyer: address,
        merchant: address,
        amount: u64,
        status: u8,
        product_type: u8,
        content_hash: vector<u8>,
        created_at: u64,
        disputed_at: u64,
        risk_score: u8,
        is_verified_merchant: bool,  // field now correctly defined
    }

    // Commerce Core shared object
    public struct CommerceCore has key {
        id: UID,
        orders: Table<u64, Order>,
        next_order_id: u64,
    }

    // `init` must NOT be `public`
    fun init(ctx: &mut TxContext) {
        let commerce_core = CommerceCore {
            id: object::new(ctx),
            orders: table::new(ctx),
            next_order_id: 1,
        };
        transfer::share_object(commerce_core);
    }

    // Create a new order
    // NOTE: `payment` uses SUI as a placeholder. Replace `SUI` with your actual USDC type
    // once you have its package address (e.g. `use 0xABC::usdc::USDC`)
    public fun create_order(
        core: &mut CommerceCore,
        escrow_manager: &mut escrow_logic::EscrowManager,
        config: &config_manager::ConfigManager,
        rep_manager: &mut reputation_manager::ReputationManager,
        role_manager: &roles::RoleManager,
        product_id: u64,
        merchant_wallet: address,
        amount: u64,
        product_type: u8,
        _payment: Coin<SUI>,   // swap SUI -> your USDC type when available
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let buyer = tx_context::sender(ctx);

        // Check daily spend limit
        escrow_logic::track_daily_spend(escrow_manager, buyer, amount, config, clock);

        // Lock funds in escrow
        let order_id = core.next_order_id;
        escrow_logic::lock_funds(escrow_manager, order_id, amount, merchant_wallet, buyer, clock, ctx);

        // Merchant verification is handled off-chain; default to false on-chain
        let is_verified = roles::is_merchant(role_manager, merchant_wallet);

        let order = Order {
            id: order_id,
            product_id,
            buyer,
            merchant: merchant_wallet,
            amount,
            status: ORDER_STATUS_PENDING,
            product_type,
            content_hash: vector::empty(),
            created_at: clock.timestamp_ms(),
            disputed_at: 0,
            risk_score: 0,
            is_verified_merchant: is_verified,
        };

        table::add(&mut core.orders, order_id, order);
        core.next_order_id = core.next_order_id + 1;

        events::emit_order_created(order_id, buyer, merchant_wallet, amount);

        // Auto-complete for digital products under the admin threshold
        let threshold = config_manager::get_admin_approval_threshold(config);
        if (product_type == PRODUCT_TYPE_DIGITAL && amount < threshold) {
            complete_order(core, escrow_manager, rep_manager, config, role_manager, order_id, clock, ctx);
        };
    }

    // Complete an order — releases escrow to merchant and awards XP to buyer
    public fun complete_order(
        core: &mut CommerceCore,
        escrow_manager: &mut escrow_logic::EscrowManager,
        rep_manager: &mut reputation_manager::ReputationManager,
        config: &config_manager::ConfigManager,
        _role_manager: &roles::RoleManager,
        order_id: u64,
        _clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(table::contains(&core.orders, order_id), EOrderNotFound);

        let order = table::borrow_mut(&mut core.orders, order_id);
        assert!(order.status == ORDER_STATUS_PENDING, EOrderNotPending);

        order.status = ORDER_STATUS_COMPLETED;

        escrow_logic::release_funds(escrow_manager, order_id, ctx);
        reputation_manager::award_xp(rep_manager, order.buyer, order_id, ctx);
        reputation_manager::update_merchant_score(rep_manager, order.merchant, order_id, false, ctx);

        let fee_bps = config_manager::get_platform_fee_bps(config);
        let _fee_amount = (order.amount * (fee_bps as u64)) / 10_000;
        // TODO: transfer fee to platform treasury and remainder to merchant
        // This requires a Coin<T> object stored in escrow — wire up in a later step.

        events::emit_order_completed(order_id);
    }

    // Release escrow to merchant (admin only)
    public fun release_escrow(
        core: &mut CommerceCore,
        escrow_manager: &mut escrow_logic::EscrowManager,
        rep_manager: &mut reputation_manager::ReputationManager,
        role_manager: &roles::RoleManager,
        order_id: u64,
        _clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(roles::is_admin(role_manager, tx_context::sender(ctx)), ENotAuthorized);
        assert!(table::contains(&core.orders, order_id), EOrderNotFound);

        let order = table::borrow_mut(&mut core.orders, order_id);
        assert!(order.status == ORDER_STATUS_PENDING, EOrderNotPending);

        order.status = ORDER_STATUS_ESCROW_RELEASED;
        escrow_logic::release_funds(escrow_manager, order_id, ctx);
        reputation_manager::award_xp(rep_manager, order.buyer, order_id, ctx);
        reputation_manager::update_merchant_score(rep_manager, order.merchant, order_id, false, ctx);

        events::emit_order_completed(order_id);
    }

    // Cancel order and refund buyer (buyer or admin)
    public fun cancel_order(
        core: &mut CommerceCore,
        escrow_manager: &mut escrow_logic::EscrowManager,
        role_manager: &roles::RoleManager,
        order_id: u64,
        ctx: &mut TxContext,
    ) {
        assert!(table::contains(&core.orders, order_id), EOrderNotFound);

        let order = table::borrow_mut(&mut core.orders, order_id);
        assert!(order.status == ORDER_STATUS_PENDING, EOrderNotPending);

        let sender = tx_context::sender(ctx);
        assert!(
            sender == order.buyer || roles::is_admin(role_manager, sender),
            ENotAuthorized
        );

        order.status = ORDER_STATUS_CANCELLED;
        escrow_logic::refund_funds(escrow_manager, order_id, ctx);
    }

    // Deliver digital product content hash (merchant only)
    public fun deliver_digital_product(
        core: &mut CommerceCore,
        role_manager: &roles::RoleManager,
        order_id: u64,
        content_hash: vector<u8>,
        ctx: &mut TxContext,
    ) {
        assert!(table::contains(&core.orders, order_id), EOrderNotFound);

        let sender = tx_context::sender(ctx);
        let order = table::borrow_mut(&mut core.orders, order_id);

        assert!(roles::is_merchant(role_manager, sender), ENotMerchant);
        assert!(sender == order.merchant, ENotMerchant);

        order.content_hash = content_hash;
    }

    // Buyer raises a dispute within the refund window
    public fun raise_dispute(
        core: &mut CommerceCore,
        config: &config_manager::ConfigManager,
        order_id: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(table::contains(&core.orders, order_id), EOrderNotFound);

        let order = table::borrow_mut(&mut core.orders, order_id);
        let sender = tx_context::sender(ctx);

        assert!(sender == order.buyer, ENotBuyer);
        assert!(order.status == ORDER_STATUS_PENDING, EOrderNotPending);
        assert!(order.disputed_at == 0, EAlreadyDisputed);

        let refund_window = config_manager::get_refund_window(config);
        let current_time = clock.timestamp_ms();
        // timestamp_ms returns milliseconds; convert elapsed to seconds
        let time_elapsed = (current_time - order.created_at) / 1_000;
        assert!(time_elapsed <= refund_window, EDisputeTooLate);

        order.status = ORDER_STATUS_DISPUTED;
        order.disputed_at = current_time;

        events::emit_order_disputed(order_id, order.buyer);
    }

    // Resolve a dispute (admin only)
    public fun resolve_dispute(
        core: &mut CommerceCore,
        escrow_manager: &mut escrow_logic::EscrowManager,
        rep_manager: &mut reputation_manager::ReputationManager,
        role_manager: &roles::RoleManager,
        order_id: u64,
        favor_buyer: bool,
        _clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(roles::is_admin(role_manager, tx_context::sender(ctx)), ENotAuthorized);
        assert!(table::contains(&core.orders, order_id), EOrderNotFound);

        let order = table::borrow_mut(&mut core.orders, order_id);
        assert!(order.status == ORDER_STATUS_DISPUTED, EInvalidStatus);

        if (favor_buyer) {
            order.status = ORDER_STATUS_REFUNDED;
            escrow_logic::refund_funds(escrow_manager, order_id, ctx);
            reputation_manager::update_merchant_score(rep_manager, order.merchant, order_id, true, ctx);
        } else {
            order.status = ORDER_STATUS_ESCROW_RELEASED;
            escrow_logic::release_funds(escrow_manager, order_id, ctx);
            reputation_manager::update_merchant_score(rep_manager, order.merchant, order_id, false, ctx);
            reputation_manager::award_xp(rep_manager, order.buyer, order_id, ctx);
        };

        events::emit_dispute_resolved(order_id, favor_buyer);
    }

    // Set risk score for an order (BOT_ROLE only)
    public fun set_risk_score(
        core: &mut CommerceCore,
        role_manager: &roles::RoleManager,
        order_id: u64,
        score: u8,
        ctx: &mut TxContext,
    ) {
        assert!(roles::is_bot(role_manager, tx_context::sender(ctx)), ENotAuthorized);
        assert!(score <= 100, EInvalidStatus);
        assert!(table::contains(&core.orders, order_id), EOrderNotFound);

        let order = table::borrow_mut(&mut core.orders, order_id);
        order.risk_score = score;

        events::emit_risk_score_set(order_id, score);
    }

    // View: get risk score for an order
    public fun get_order_risk_score(core: &CommerceCore, order_id: u64): u8 {
        assert!(table::contains(&core.orders, order_id), EOrderNotFound);
        table::borrow(&core.orders, order_id).risk_score
    }
}
