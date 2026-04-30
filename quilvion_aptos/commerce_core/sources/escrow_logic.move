module commerce_core::escrow_logic {
    use aptos_std::table;
    use aptos_framework::timestamp;

    // ─── Error Codes ──────────────────────────────────────────────────────────
    const E_DAILY_LIMIT_EXCEEDED: u64 = 1;

    // ─── Escrow Struct ────────────────────────────────────────────────────────
    struct Escrow has key {
        balances:      table::Table<u64, u64>,      // order_id → locked amount
        platform_fees: table::Table<u64, u64>,      // order_id → fee amount
        daily_spend:   table::Table<address, u64>,  // wallet  → amount spent today
        last_reset:    table::Table<address, u64>,  // wallet  → last reset day (epoch/86400)
    }

    // ─── Init ─────────────────────────────────────────────────────────────────
    public fun init(account: &signer) {
        move_to(account, Escrow {
            balances:      table::new(),
            platform_fees: table::new(),
            daily_spend:   table::new(),
            last_reset:    table::new(),
        });
    }

    // ─── Fund Locking ─────────────────────────────────────────────────────────
    public fun lock_funds(order_id: u64, amount: u64) acquires Escrow {
        let escrow = borrow_global_mut<Escrow>(@commerce_core);
        table::add(&mut escrow.balances, order_id, amount);
    }

    public fun add_platform_fee(order_id: u64, fee: u64) acquires Escrow {
        let escrow = borrow_global_mut<Escrow>(@commerce_core);
        table::add(&mut escrow.platform_fees, order_id, fee);
    }

    // ─── Fund Release ─────────────────────────────────────────────────────────
    // Returns the full locked amount; caller is responsible for splitting fee.
    public fun release_funds(order_id: u64): u64 acquires Escrow {
        let escrow = borrow_global_mut<Escrow>(@commerce_core);
        let amount = table::remove(&mut escrow.balances, order_id);
        if (table::contains(&escrow.platform_fees, order_id)) {
            table::remove(&mut escrow.platform_fees, order_id);
        };
        amount
    }

    // Returns the full locked amount (full refund to buyer).
    public fun refund_funds(order_id: u64): u64 acquires Escrow {
        let escrow = borrow_global_mut<Escrow>(@commerce_core);
        let amount = table::remove(&mut escrow.balances, order_id);
        if (table::contains(&escrow.platform_fees, order_id)) {
            table::remove(&mut escrow.platform_fees, order_id);
        };
        amount
    }

    // ─── Fee View ─────────────────────────────────────────────────────────────
    public fun get_platform_fee(order_id: u64): u64 acquires Escrow {
        let escrow = borrow_global<Escrow>(@commerce_core);
        if (table::contains(&escrow.platform_fees, order_id)) {
            *table::borrow(&escrow.platform_fees, order_id)
        } else {
            0
        }
    }

    // ─── Daily Spend Tracking ─────────────────────────────────────────────────
    public fun check_and_update_daily_spend(
        wallet: address,
        amount: u64,
        limit: u64,
    ) acquires Escrow {
        let escrow = borrow_global_mut<Escrow>(@commerce_core);
        let today  = timestamp::now_seconds() / 86400;

        // First-time wallet setup
        if (!table::contains(&escrow.last_reset, wallet)) {
            table::add(&mut escrow.last_reset,  wallet, today);
            table::add(&mut escrow.daily_spend, wallet, 0);
        };

        // Auto-reset if a new day has started
        let last_reset = table::borrow_mut(&mut escrow.last_reset, wallet);
        if (*last_reset != today) {
            *last_reset = today;
            let spend = table::borrow_mut(&mut escrow.daily_spend, wallet);
            *spend = 0;
        };

        // Check and update
        let spent = table::borrow_mut(&mut escrow.daily_spend, wallet);
        assert!(*spent + amount <= limit, E_DAILY_LIMIT_EXCEEDED);
        *spent = *spent + amount;
    }

    // ─── Daily Spend View ─────────────────────────────────────────────────────
    public fun get_daily_spent(wallet: address): u64 acquires Escrow {
        let escrow = borrow_global<Escrow>(@commerce_core);
        if (table::contains(&escrow.daily_spend, wallet)) {
            *table::borrow(&escrow.daily_spend, wallet)
        } else {
            0
        }
    }
}
