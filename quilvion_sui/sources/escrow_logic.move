module quilvion::escrow_logic {
    use sui::clock::Clock;
    use sui::table::{Self, Table};
    use quilvion::config_manager;

    // All structs must be `public`in Move 2024
    public struct EscrowRecord has store {
        order_id: u64,
        amount: u64,
        merchant: address,
        buyer: address,
        is_locked: bool,
        is_released: bool,
        created_at: u64,
    }

    public struct DailySpend has store {
        wallet: address,
        amount: u64,
        last_reset: u64,
    }

    public struct EscrowManager has key {
        id: UID,
        escrows: Table<u64, EscrowRecord>,
        daily_spends: Table<address, DailySpend>,
    }

    // Error codes
    const EOrderNotFound: u64 = 1;
    const EOrderAlreadyReleased: u64 = 2;
    const EDailyLimitExceeded: u64 = 4;
    const EInvalidAmount: u64 = 5;

    // `init` must NOT be `public`
    fun init(ctx: &mut TxContext) {
        let escrow_manager = EscrowManager {
            id: object::new(ctx),
            escrows: table::new(ctx),
            daily_spends: table::new(ctx),
        };
        transfer::share_object(escrow_manager);
    }

    // Lock funds for an order
    public fun lock_funds(
        escrow_manager: &mut EscrowManager,
        order_id: u64,
        amount: u64,
        merchant: address,
        buyer: address,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        assert!(amount > 0, EInvalidAmount);
        let escrow = EscrowRecord {
            order_id,
            amount,
            merchant,
            buyer,
            is_locked: true,
            is_released: false,
            // Fix: use method syntax `clock.timestamp_ms()` in Move 2024
            created_at: clock.timestamp_ms(),
        };
        table::add(&mut escrow_manager.escrows, order_id, escrow);
    }

    // Release funds to merchant
    public fun release_funds(
        escrow_manager: &mut EscrowManager,
        order_id: u64,
        _ctx: &TxContext,
    ) {
        assert!(table::contains(&escrow_manager.escrows, order_id), EOrderNotFound);
        let escrow = table::borrow_mut(&mut escrow_manager.escrows, order_id);
        assert!(escrow.is_locked && !escrow.is_released, EOrderAlreadyReleased);
        escrow.is_released = true;
        escrow.is_locked = false;
        // Actual coin transfer handled by CommerceCore
    }

    // Refund funds to buyer
    public fun refund_funds(
        escrow_manager: &mut EscrowManager,
        order_id: u64,
        _ctx: &TxContext,
    ) {
        assert!(table::contains(&escrow_manager.escrows, order_id), EOrderNotFound);
        let escrow = table::borrow_mut(&mut escrow_manager.escrows, order_id);
        assert!(escrow.is_locked && !escrow.is_released, EOrderAlreadyReleased);
        escrow.is_locked = false;
        // Refund to buyer handled by CommerceCore
    }

    // Track daily spend for a wallet
    public fun track_daily_spend(
        escrow_manager: &mut EscrowManager,
        wallet: address,
        amount: u64,
        config: &config_manager::ConfigManager,
        clock: &Clock,
    ) {
        let current_time = clock.timestamp_ms();
        let today_start = current_time - (current_time % 86_400_000);

        if (!table::contains(&escrow_manager.daily_spends, wallet)) {
            let daily_spend = DailySpend {
                wallet,
                amount: 0,
                last_reset: today_start,
            };
            table::add(&mut escrow_manager.daily_spends, wallet, daily_spend);
        };

        let daily_spend = table::borrow_mut(&mut escrow_manager.daily_spends, wallet);

        // Reset if new day
        if (daily_spend.last_reset < today_start) {
            daily_spend.amount = 0;
            daily_spend.last_reset = today_start;
        };

        let new_total = daily_spend.amount + amount;
        assert!(
            new_total <= config_manager::get_daily_spend_limit(config),
            EDailyLimitExceeded
        );
        daily_spend.amount = new_total;
    }

    // Get daily spent amount for a wallet
    public fun get_daily_spent(
        escrow_manager: &EscrowManager,
        wallet: address,
        clock: &Clock,
    ): u64 {
        if (!table::contains(&escrow_manager.daily_spends, wallet)) {
            return 0
        };
        let daily_spend = table::borrow(&escrow_manager.daily_spends, wallet);
        let current_time = clock.timestamp_ms();
        let today_start = current_time - (current_time % 86_400_000);
        if (daily_spend.last_reset < today_start) {
            return 0
        };
        daily_spend.amount
    }

    // Check if an escrow is still locked
    public fun is_escrow_locked(escrow_manager: &EscrowManager, order_id: u64): bool {
        if (!table::contains(&escrow_manager.escrows, order_id)) {
            return false
        };
        let escrow = table::borrow(&escrow_manager.escrows, order_id);
        escrow.is_locked && !escrow.is_released
    }

    // Get escrow details: (amount, merchant, buyer, created_at)
    public fun get_escrow(
        escrow_manager: &EscrowManager,
        order_id: u64,
    ): (u64, address, address, u64) {
        assert!(table::contains(&escrow_manager.escrows, order_id), EOrderNotFound);
        let escrow = table::borrow(&escrow_manager.escrows, order_id);
        (escrow.amount, escrow.merchant, escrow.buyer, escrow.created_at)
    }

    // Reset daily spend for a wallet (admin only)
    public fun reset_daily_spend(
        escrow_manager: &mut EscrowManager,
        wallet: address,
        role_manager: &quilvion::roles::RoleManager,
        ctx: &TxContext,
    ) {
        assert!(quilvion::roles::is_admin(role_manager, tx_context::sender(ctx)), 1);
        if (table::contains(&escrow_manager.daily_spends, wallet)) {
            let daily_spend = table::borrow_mut(&mut escrow_manager.daily_spends, wallet);
            daily_spend.amount = 0;
        };
    }
}
