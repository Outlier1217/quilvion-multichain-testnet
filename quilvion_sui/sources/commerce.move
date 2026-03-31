module commerce::commerce {

    use std::vector;

    use sui::tx_context::{Self, TxContext};
    use sui::object::{Self, UID};
    use sui::transfer; // ✅ ADD THIS LINE

    use commerce::roles;
    use commerce::config;
    use commerce::escrow;

    struct Order has store {
        id: u64,
        buyer: address,
        seller: address,
        amount: u64,
        status: u8,
        created_at: u64,
        risk: u64
    }

    struct Commerce has key {
        id: UID,
        orders: vector<Order>,
        counter: u64,
        cfg: config::Config,
        esc: escrow::Escrow,
        roles: roles::Roles,
    }

    fun init(ctx: &mut TxContext) {

        let commerce = Commerce {
            id: object::new(ctx),
            orders: vector::empty(),
            counter: 0,
            cfg: config::new(),
            esc: escrow::new(ctx),
            roles: roles::new(ctx)
        };

        transfer::share_object(commerce); // ✅ now works
    }

    public fun create_order(
        c: &mut Commerce,
        seller: address,
        amount: u64,
        ctx: &mut TxContext
    ) {

        let buyer = tx_context::sender(ctx);

        escrow::update_limit(
            &mut c.esc,
            buyer,
            amount,
            config::get_daily_limit(&c.cfg)
        );

        c.counter = c.counter + 1;

        let order = Order {
            id: c.counter,
            buyer,
            seller,
            amount,
            status: 0,
            created_at: tx_context::epoch(ctx),
            risk: 0
        };

        vector::push_back(&mut c.orders, order);
    }
}