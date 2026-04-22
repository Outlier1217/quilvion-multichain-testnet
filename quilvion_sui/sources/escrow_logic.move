/// escrow_logic.move
/// Stores actual funds as Balance<SUI> inside each EscrowRecord.
/// Platform fees are accumulated in a treasury Balance<SUI> inside
/// EscrowManager and can be withdrawn by an admin at any time.
module quilvion::escrow_logic {
    use sui::balance::{Self, Balance};
    use sui::clock::Clock;
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::table::{Self, Table};
    use sui::transfer;
    use quilvion::config_manager;

    // ── Structs ───────────────────────────────────────────────────────────────

    public struct EscrowRecord has store {
        order_id:    u64,
        merchant:    address,
        buyer:       address,
        is_locked:   bool,
        is_released: bool,
        created_at:  u64,
        funds:       Balance<SUI>,
    }

    public struct DailySpend has store {
        wallet:     address,
        amount:     u64,
        last_reset: u64,
    }

    public struct EscrowManager has key {
        id:           UID,
        escrows:      Table<u64, EscrowRecord>,
        daily_spends: Table<address, DailySpend>,
        /// Accumulated platform fees — withdrawn by admin via withdraw_treasury()
        treasury:     Balance<SUI>,
    }

    // ── Error codes ───────────────────────────────────────────────────────────

    const EOrderNotFound:        u64 = 1;
    const EOrderAlreadyReleased: u64 = 2;
    const EDailyLimitExceeded:   u64 = 4;
    const EInvalidAmount:        u64 = 5;
    const ENotAuthorized:        u64 = 6;
    const EInsufficientTreasury: u64 = 7;

    // ── Init ──────────────────────────────────────────────────────────────────

    fun init(ctx: &mut TxContext) {
        transfer::share_object(EscrowManager {
            id:           object::new(ctx),
            escrows:      table::new(ctx),
            daily_spends: table::new(ctx),
            treasury:     balance::zero<SUI>(),
        });
    }

    // ── Core escrow operations ────────────────────────────────────────────────

    /// Lock a Coin<SUI> in escrow for `order_id`.
    /// The coin is fully consumed here.
    public fun lock_funds(
        escrow_manager: &mut EscrowManager,
        order_id: u64,
        merchant: address,
        buyer:    address,
        payment:  Coin<SUI>,
        clock:    &Clock,
        _ctx:     &mut TxContext,
    ) {
        let amount = coin::value(&payment);
        assert!(amount > 0, EInvalidAmount);

        table::add(&mut escrow_manager.escrows, order_id, EscrowRecord {
            order_id,
            merchant,
            buyer,
            is_locked:   true,
            is_released: false,
            created_at:  clock.timestamp_ms(),
            funds:       coin::into_balance(payment),
        });
    }

    /// Release funds to merchant WITH platform fee deduction.
    ///
    /// fee_bps  — platform fee in basis points (e.g. 250 = 2.5%)
    ///            pass config_manager::get_platform_fee_bps(config)
    ///
    /// Returns  — (merchant_amount, fee_amount)
    ///
    /// Fee goes into treasury; merchant gets the rest immediately.
    public fun release_funds_with_fee(
        escrow_manager: &mut EscrowManager,
        order_id: u64,
        fee_bps:  u64,   // e.g. 250 for 2.5%
        ctx:      &mut TxContext,
    ): (u64, u64) {
        assert!(table::contains(&escrow_manager.escrows, order_id), EOrderNotFound);
        let record = table::borrow_mut(&mut escrow_manager.escrows, order_id);
        assert!(record.is_locked && !record.is_released, EOrderAlreadyReleased);

        record.is_released = true;
        record.is_locked   = false;

        let total    = balance::value(&record.funds);
        let merchant = record.merchant;

        // fee_amount = total * fee_bps / 10_000  (integer division, rounds down)
        let fee_amount      = (total * fee_bps) / 10_000;
        let merchant_amount = total - fee_amount;

        // Split: fee stays in treasury, rest goes to merchant
        let mut full_balance = balance::withdraw_all(&mut record.funds);

        if (fee_amount > 0) {
            let fee_balance = balance::split(&mut full_balance, fee_amount);
            balance::join(&mut escrow_manager.treasury, fee_balance);
        };

        let payout = coin::from_balance(full_balance, ctx);
        transfer::public_transfer(payout, merchant);

        (merchant_amount, fee_amount)
    }

    /// Legacy release (no fee) — kept for backward compat / dispute resolution
    /// in favor of merchant where fee was already considered 0.
    /// Returns total amount released.
    public fun release_funds(
        escrow_manager: &mut EscrowManager,
        order_id: u64,
        ctx:      &mut TxContext,
    ): u64 {
        assert!(table::contains(&escrow_manager.escrows, order_id), EOrderNotFound);
        let record = table::borrow_mut(&mut escrow_manager.escrows, order_id);
        assert!(record.is_locked && !record.is_released, EOrderAlreadyReleased);

        record.is_released = true;
        record.is_locked   = false;

        let merchant = record.merchant;
        let amount   = balance::value(&record.funds);

        let payout = coin::from_balance(balance::withdraw_all(&mut record.funds), ctx);
        transfer::public_transfer(payout, merchant);

        amount
    }

    /// Refund full amount to buyer (no fee deducted on refund).
    public fun refund_funds(
        escrow_manager: &mut EscrowManager,
        order_id: u64,
        ctx:      &mut TxContext,
    ) {
        assert!(table::contains(&escrow_manager.escrows, order_id), EOrderNotFound);
        let record = table::borrow_mut(&mut escrow_manager.escrows, order_id);
        assert!(record.is_locked && !record.is_released, EOrderAlreadyReleased);

        record.is_locked = false;

        let buyer  = record.buyer;
        let refund = coin::from_balance(balance::withdraw_all(&mut record.funds), ctx);
        transfer::public_transfer(refund, buyer);
    }

    // ── Treasury management ───────────────────────────────────────────────────

    /// Admin withdraws accumulated platform fees from treasury.
    /// `amount` — how much to withdraw (pass treasury_balance() to withdraw all)
    public fun withdraw_treasury(
        escrow_manager: &mut EscrowManager,
        amount:       u64,
        recipient:    address,
        role_manager: &quilvion::roles::RoleManager,
        ctx:          &mut TxContext,
    ) {
        assert!(
            quilvion::roles::is_admin(role_manager, tx_context::sender(ctx)),
            ENotAuthorized,
        );
        assert!(
            balance::value(&escrow_manager.treasury) >= amount,
            EInsufficientTreasury,
        );

        let withdrawn = coin::from_balance(
            balance::split(&mut escrow_manager.treasury, amount),
            ctx,
        );
        transfer::public_transfer(withdrawn, recipient);
    }

    /// View: how much is in the treasury right now.
    public fun treasury_balance(escrow_manager: &EscrowManager): u64 {
        balance::value(&escrow_manager.treasury)
    }

    // ── Daily spend tracking ──────────────────────────────────────────────────

    public fun track_daily_spend(
        escrow_manager: &mut EscrowManager,
        wallet: address,
        amount: u64,
        config: &config_manager::ConfigManager,
        clock:  &Clock,
    ) {
        let current_time = clock.timestamp_ms();
        let today_start  = current_time - (current_time % 86_400_000);

        if (!table::contains(&escrow_manager.daily_spends, wallet)) {
            table::add(&mut escrow_manager.daily_spends, wallet, DailySpend {
                wallet,
                amount:     0,
                last_reset: today_start,
            });
        };

        let ds = table::borrow_mut(&mut escrow_manager.daily_spends, wallet);
        if (ds.last_reset < today_start) {
            ds.amount     = 0;
            ds.last_reset = today_start;
        };

        let new_total = ds.amount + amount;
        assert!(
            new_total <= config_manager::get_daily_spend_limit(config),
            EDailyLimitExceeded,
        );
        ds.amount = new_total;
    }

    public fun get_daily_spent(
        escrow_manager: &EscrowManager,
        wallet: address,
        clock:  &Clock,
    ): u64 {
        if (!table::contains(&escrow_manager.daily_spends, wallet)) { return 0 };
        let ds = table::borrow(&escrow_manager.daily_spends, wallet);
        let current_time = clock.timestamp_ms();
        let today_start  = current_time - (current_time % 86_400_000);
        if (ds.last_reset < today_start) { return 0 };
        ds.amount
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    public fun is_escrow_locked(escrow_manager: &EscrowManager, order_id: u64): bool {
        if (!table::contains(&escrow_manager.escrows, order_id)) { return false };
        let r = table::borrow(&escrow_manager.escrows, order_id);
        r.is_locked && !r.is_released
    }

    /// Returns (amount, merchant, buyer, created_at)
    public fun get_escrow(
        escrow_manager: &EscrowManager,
        order_id: u64,
    ): (u64, address, address, u64) {
        assert!(table::contains(&escrow_manager.escrows, order_id), EOrderNotFound);
        let r = table::borrow(&escrow_manager.escrows, order_id);
        (balance::value(&r.funds), r.merchant, r.buyer, r.created_at)
    }

    // ── Admin helpers ─────────────────────────────────────────────────────────

    public fun reset_daily_spend(
        escrow_manager: &mut EscrowManager,
        wallet:       address,
        role_manager: &quilvion::roles::RoleManager,
        ctx:          &TxContext,
    ) {
        assert!(quilvion::roles::is_admin(role_manager, tx_context::sender(ctx)), ENotAuthorized);
        if (table::contains(&escrow_manager.daily_spends, wallet)) {
            table::borrow_mut(&mut escrow_manager.daily_spends, wallet).amount = 0;
        };
    }
}
