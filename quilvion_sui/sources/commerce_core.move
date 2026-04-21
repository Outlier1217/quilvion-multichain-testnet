/// commerce_core.move
/// Uses Coin<SUI> as the payment type. Replace SUI with your USDC type once
/// you have its package address (e.g. `use 0xABC::usdc::USDC`).
module quilvion::commerce_core {
    use sui::clock::Clock;
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::table::{Self, Table};
    use sui::transfer;
    use quilvion::roles;
    use quilvion::config_manager;
    use quilvion::escrow_logic;
    use quilvion::reputation_manager;
    use quilvion::events;

    // ── Order status ──────────────────────────────────────────────────────────

    const ORDER_STATUS_PENDING:         u8 = 0;
    const ORDER_STATUS_COMPLETED:       u8 = 1;
    const ORDER_STATUS_DISPUTED:        u8 = 2;
    const ORDER_STATUS_CANCELLED:       u8 = 3;
    const ORDER_STATUS_ESCROW_RELEASED: u8 = 4;
    const ORDER_STATUS_REFUNDED:        u8 = 5;

    // ── Product type ──────────────────────────────────────────────────────────

    const PRODUCT_TYPE_DIGITAL: u8 = 0;

    // ── Error codes ───────────────────────────────────────────────────────────

    const ENotMerchant:   u64 = 1;
    const ENotBuyer:      u64 = 2;
    const EOrderNotFound: u64 = 3;
    const EInvalidStatus: u64 = 4;
    const EDisputeTooLate: u64 = 5;
    const EAlreadyDisputed: u64 = 6;
    const ENotAuthorized: u64 = 7;
    const EOrderNotPending: u64 = 8;

    // ── Structs ───────────────────────────────────────────────────────────────

    public struct Order has store {
        id:                   u64,
        product_id:           u64,
        buyer:                address,
        merchant:             address,
        amount:               u64,
        status:               u8,
        product_type:         u8,
        content_hash:         vector<u8>,
        created_at:           u64,
        disputed_at:          u64,
        risk_score:           u8,
        is_verified_merchant: bool,
    }

    public struct CommerceCore has key {
        id:            UID,
        orders:        Table<u64, Order>,
        next_order_id: u64,
    }

    // ── Init ──────────────────────────────────────────────────────────────────

    fun init(ctx: &mut TxContext) {
        transfer::share_object(CommerceCore {
            id:            object::new(ctx),
            orders:        table::new(ctx),
            next_order_id: 1,
        });
    }

    // ── Public entry points ───────────────────────────────────────────────────

    /// Create a new order.
    /// `payment` is the full Coin<SUI> for the order — it is stored in escrow.
    /// The caller must pass a coin whose value == `amount`; split beforehand if
    /// needed (e.g. `coin::split(&mut my_coin, amount, ctx)`).
    public fun create_order(
        core:            &mut CommerceCore,
        escrow_manager:  &mut escrow_logic::EscrowManager,
        config:          &config_manager::ConfigManager,
        rep_manager:     &mut reputation_manager::ReputationManager,
        role_manager:    &roles::RoleManager,
        product_id:      u64,
        merchant_wallet: address,
        product_type:    u8,
        payment:         Coin<SUI>,   // ← fully consumed here
        clock:           &Clock,
        ctx:             &mut TxContext,
    ) {
        let buyer  = tx_context::sender(ctx);
        let amount = coin::value(&payment);

        // Check daily spend limit before locking
        escrow_logic::track_daily_spend(escrow_manager, buyer, amount, config, clock);

        let order_id = core.next_order_id;

        // Lock coin in escrow — coin is consumed inside lock_funds
        escrow_logic::lock_funds(
            escrow_manager,
            order_id,
            merchant_wallet,
            buyer,
            payment,
            clock,
            ctx,
        );

        let is_verified = roles::is_merchant(role_manager, merchant_wallet);

        table::add(&mut core.orders, order_id, Order {
            id:                   order_id,
            product_id,
            buyer,
            merchant:             merchant_wallet,
            amount,
            status:               ORDER_STATUS_PENDING,
            product_type,
            content_hash:         vector::empty(),
            created_at:           clock.timestamp_ms(),
            disputed_at:          0,
            risk_score:           0,
            is_verified_merchant: is_verified,
        });

        core.next_order_id = core.next_order_id + 1;
        events::emit_order_created(order_id, buyer, merchant_wallet, amount);

        // Auto-complete for small digital orders
        let threshold = config_manager::get_admin_approval_threshold(config);
        if (product_type == PRODUCT_TYPE_DIGITAL && amount < threshold) {
            complete_order(
                core, escrow_manager, rep_manager, config,
                role_manager, order_id, clock, ctx,
            );
        };
    }

    /// Complete an order — releases escrow to merchant and awards XP.
    public fun complete_order(
        core:           &mut CommerceCore,
        escrow_manager: &mut escrow_logic::EscrowManager,
        rep_manager:    &mut reputation_manager::ReputationManager,
        config:         &config_manager::ConfigManager,
        _role_manager:  &roles::RoleManager,
        order_id:       u64,
        _clock:         &Clock,
        ctx:            &mut TxContext,
    ) {
        assert!(table::contains(&core.orders, order_id), EOrderNotFound);
        let order = table::borrow_mut(&mut core.orders, order_id);
        assert!(order.status == ORDER_STATUS_PENDING, EOrderNotPending);

        order.status = ORDER_STATUS_COMPLETED;

        let _fee_bps    = config_manager::get_platform_fee_bps(config);
        // release_funds transfers the full balance to merchant and returns amount
        let _released   = escrow_logic::release_funds(escrow_manager, order_id, ctx);
        // TODO: split fee before release if you add a treasury Balance field.

        reputation_manager::award_xp(rep_manager, order.buyer, order_id, ctx);
        reputation_manager::update_merchant_score(rep_manager, order.merchant, order_id, false, ctx);

        events::emit_order_completed(order_id);
    }

    /// Admin-only: force-release escrow to merchant.
    public fun release_escrow(
        core:           &mut CommerceCore,
        escrow_manager: &mut escrow_logic::EscrowManager,
        rep_manager:    &mut reputation_manager::ReputationManager,
        role_manager:   &roles::RoleManager,
        order_id:       u64,
        _clock:         &Clock,
        ctx:            &mut TxContext,
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

    /// Cancel an order and refund the buyer (buyer or admin only).
    public fun cancel_order(
        core:           &mut CommerceCore,
        escrow_manager: &mut escrow_logic::EscrowManager,
        role_manager:   &roles::RoleManager,
        order_id:       u64,
        ctx:            &mut TxContext,
    ) {
        assert!(table::contains(&core.orders, order_id), EOrderNotFound);

        let order = table::borrow_mut(&mut core.orders, order_id);
        assert!(order.status == ORDER_STATUS_PENDING, EOrderNotPending);

        let sender = tx_context::sender(ctx);
        assert!(
            sender == order.buyer || roles::is_admin(role_manager, sender),
            ENotAuthorized,
        );

        order.status = ORDER_STATUS_CANCELLED;
        escrow_logic::refund_funds(escrow_manager, order_id, ctx);
    }

    /// Merchant delivers a digital product by recording its content hash.
    public fun deliver_digital_product(
        core:         &mut CommerceCore,
        role_manager: &roles::RoleManager,
        order_id:     u64,
        content_hash: vector<u8>,
        ctx:          &mut TxContext,
    ) {
        assert!(table::contains(&core.orders, order_id), EOrderNotFound);

        let sender = tx_context::sender(ctx);
        let order  = table::borrow_mut(&mut core.orders, order_id);

        assert!(roles::is_merchant(role_manager, sender), ENotMerchant);
        assert!(sender == order.merchant, ENotMerchant);

        order.content_hash = content_hash;
    }

    /// Buyer raises a dispute within the refund window.
    public fun raise_dispute(
        core:     &mut CommerceCore,
        config:   &config_manager::ConfigManager,
        order_id: u64,
        clock:    &Clock,
        ctx:      &mut TxContext,
    ) {
        assert!(table::contains(&core.orders, order_id), EOrderNotFound);

        let order  = table::borrow_mut(&mut core.orders, order_id);
        let sender = tx_context::sender(ctx);

        assert!(sender == order.buyer, ENotBuyer);
        assert!(order.status == ORDER_STATUS_PENDING, EOrderNotPending);
        assert!(order.disputed_at == 0, EAlreadyDisputed);

        let refund_window = config_manager::get_refund_window(config);
        let current_time  = clock.timestamp_ms();
        // timestamp_ms is in milliseconds; convert elapsed to seconds
        let time_elapsed  = (current_time - order.created_at) / 1_000;
        assert!(time_elapsed <= refund_window, EDisputeTooLate);

        order.status      = ORDER_STATUS_DISPUTED;
        order.disputed_at = current_time;

        events::emit_order_disputed(order_id, order.buyer);
    }

    /// Admin resolves a dispute — either refunds buyer or releases to merchant.
    public fun resolve_dispute(
        core:           &mut CommerceCore,
        escrow_manager: &mut escrow_logic::EscrowManager,
        rep_manager:    &mut reputation_manager::ReputationManager,
        role_manager:   &roles::RoleManager,
        order_id:       u64,
        favor_buyer:    bool,
        _clock:         &Clock,
        ctx:            &mut TxContext,
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

    /// BOT_ROLE sets a fraud risk score (0–100) on an order.
    public fun set_risk_score(
        core:         &mut CommerceCore,
        role_manager: &roles::RoleManager,
        order_id:     u64,
        score:        u8,
        ctx:          &mut TxContext,
    ) {
        assert!(roles::is_bot(role_manager, tx_context::sender(ctx)), ENotAuthorized);
        assert!(score <= 100, EInvalidStatus);
        assert!(table::contains(&core.orders, order_id), EOrderNotFound);

        table::borrow_mut(&mut core.orders, order_id).risk_score = score;
        events::emit_risk_score_set(order_id, score);
    }

    /// View: get risk score for an order.
    public fun get_order_risk_score(core: &CommerceCore, order_id: u64): u8 {
        assert!(table::contains(&core.orders, order_id), EOrderNotFound);
        table::borrow(&core.orders, order_id).risk_score
    }
}
