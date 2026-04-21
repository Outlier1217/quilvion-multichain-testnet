/// escrow_logic.move
/// Stores actual funds as Balance<SUI> inside each EscrowRecord so that
/// Coin objects are fully consumed on deposit and properly transferred on
/// release / refund.  Replace SUI with your USDC type once you have its
/// package address.
module quilvion::escrow_logic {
    use sui::balance::{Self, Balance};
    use sui::clock::Clock;
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::table::{Self, Table};
    use sui::transfer;
    use quilvion::config_manager;

    // ── Structs ──────────────────────────────────────────────────────────────

    public struct EscrowRecord has store {
        order_id:    u64,
        merchant:    address,
        buyer:       address,
        is_locked:   bool,
        is_released: bool,
        created_at:  u64,
        funds:       Balance<SUI>,   // actual coins held in escrow
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
    }

    // ── Error codes ───────────────────────────────────────────────────────────

    const EOrderNotFound:        u64 = 1;
    const EOrderAlreadyReleased: u64 = 2;
    const EDailyLimitExceeded:   u64 = 4;
    const EInvalidAmount:        u64 = 5;

    // ── Init ──────────────────────────────────────────────────────────────────

    fun init(ctx: &mut TxContext) {
        transfer::share_object(EscrowManager {
            id:           object::new(ctx),
            escrows:      table::new(ctx),
            daily_spends: table::new(ctx),
        });
    }

    // ── Core escrow operations ────────────────────────────────────────────────

    /// Lock a Coin<SUI> in escrow for `order_id`.
    /// The coin is fully consumed here — no leftover value is possible.
    public fun lock_funds(
        escrow_manager: &mut EscrowManager,
        order_id: u64,
        merchant: address,
        buyer:    address,
        payment:  Coin<SUI>,      // caller passes the whole coin; we store it
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
            funds:       coin::into_balance(payment),   // consume coin -> balance
        });
    }

    /// Release funds to the merchant.
    /// Returns the amount released (so CommerceCore can calculate fees).
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

        // Drain the stored balance and transfer to merchant
        let payout = coin::from_balance(balance::withdraw_all(&mut record.funds), ctx);
        transfer::public_transfer(payout, merchant);

        amount
    }

    /// Refund funds to the buyer.
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
        assert!(new_total <= config_manager::get_daily_spend_limit(config), EDailyLimitExceeded);
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
        assert!(quilvion::roles::is_admin(role_manager, tx_context::sender(ctx)), 1);
        if (table::contains(&escrow_manager.daily_spends, wallet)) {
            table::borrow_mut(&mut escrow_manager.daily_spends, wallet).amount = 0;
        };
    }
}
