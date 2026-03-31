module commerce::escrow {

    use sui::table::{Self, Table};

    struct Escrow has store {
        spent: Table<address, u64>,
    }

    public fun new(ctx: &mut sui::tx_context::TxContext): Escrow {
        Escrow {
            spent: table::new(ctx)
        }
    }

    public fun update_limit(
        e: &mut Escrow,
        user: address,
        amount: u64,
        limit: u64
    ) {

        if (table::contains(&e.spent, user)) {
            let current_ref = table::borrow_mut(&mut e.spent, user);
            assert!(*current_ref + amount <= limit, 1);
            *current_ref = *current_ref + amount;
        } else {
            assert!(amount <= limit, 2);
            table::add(&mut e.spent, user, amount);
        }
    }
}