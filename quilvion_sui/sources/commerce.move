module quilvion::commerce {

    use sui::object;
    use sui::tx_context;
    use sui::coin;
    use sui::transfer;
    use sui::event;
    use sui::sui::SUI; // ✅ FIX

    const ESCROW_HOLD: u8 = 0;
    const COMPLETED: u8 = 1;

    struct Order has key {
        id: object::UID,
        buyer: address,
        seller: address,
        amount: u64,
        status: u8,
    }

    struct OrderCreated has copy, drop {
        order_id: object::ID, // ✅ FIX
        buyer: address,
        seller: address,
    }

    public fun create_order(
        seller: address,
        payment: coin::Coin<SUI>, // ✅ FIX
        ctx: &mut tx_context::TxContext
    ) {
        let buyer = tx_context::sender(ctx);
        let amount = coin::value(&payment);

        assert!(seller != buyer, 0);
        assert!(amount > 0, 1);

        let order = Order {
            id: object::new(ctx),
            buyer,
            seller,
            amount,
            status: ESCROW_HOLD,
        };

        event::emit(OrderCreated {
            order_id: object::id(&order),
            buyer,
            seller,
        });

        transfer::share_object(order);

        transfer::public_transfer(payment, buyer);
    }

    public fun confirm_delivery(
        order: &mut Order,
        ctx: &mut tx_context::TxContext
    ) {
        let sender = tx_context::sender(ctx);

        assert!(sender == order.buyer, 2);
        assert!(order.status == ESCROW_HOLD, 3);

        order.status = COMPLETED;
    }
}