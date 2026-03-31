module quilvion::commerce {

    use sui::object;
    use sui::tx_context;
    use sui::coin;
    use sui::transfer;
    use sui::event;
    use sui::sui::SUI;

    // ===============================
    // CONSTANTS
    // ===============================
    const ESCROW_HOLD: u8 = 0;
    const COMPLETED: u8 = 1;

    const PLATFORM_FEE_BPS: u64 = 184; // 1.84%

    // ===============================
    // ORDER STRUCT
    // ===============================
    struct Order has key {
        id: object::UID,
        buyer: address,
        seller: address,
        amount: u64,
        status: u8,
    }

    // ===============================
    // VAULT (ESCROW)
    // ===============================
    struct Vault has key {
        id: object::UID,
        balance: coin::Coin<SUI>,
        owner: address, // platform owner
    }

    // ===============================
    // EVENTS
    // ===============================
    struct OrderCreated has copy, drop {
        order_id: object::ID,
        buyer: address,
        seller: address,
    }

    struct OrderCompleted has copy, drop {
        order_id: object::ID,
    }

    // ===============================
    // CREATE ORDER (ESCROW HOLD)
    // ===============================
    public fun create_order(
        seller: address,
        payment: coin::Coin<SUI>,
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

        // 🔐 Create Vault (Escrow)
        let vault = Vault {
            id: object::new(ctx),
            balance: payment,
            owner: buyer, // NOTE: will update later to platform owner
        };

        event::emit(OrderCreated {
            order_id: object::id(&order),
            buyer,
            seller,
        });

        transfer::share_object(order);
        transfer::share_object(vault);
    }

    // ===============================
    // INTERNAL: PROCESS PAYOUT
    // ===============================
    fun process_payout(
        vault: &mut Vault,
        seller: address,
        ctx: &mut tx_context::TxContext
    ) {
        let total = coin::value(&vault.balance);

        let fee = (total * PLATFORM_FEE_BPS) / 10000;
        let seller_amount = total - fee;

        let fee_coin = coin::split(&mut vault.balance, fee, ctx);
        let seller_coin = coin::split(&mut vault.balance, seller_amount, ctx);

        transfer::public_transfer(fee_coin, vault.owner);
        transfer::public_transfer(seller_coin, seller);
    }

    // ===============================
    // CONFIRM DELIVERY → PAYOUT
    // ===============================
    public fun confirm_delivery(
        order: &mut Order,
        vault: &mut Vault,
        ctx: &mut tx_context::TxContext
    ) {
        let sender = tx_context::sender(ctx);

        assert!(sender == order.buyer, 2);
        assert!(order.status == ESCROW_HOLD, 3);

        order.status = COMPLETED;

        process_payout(vault, order.seller, ctx);

        event::emit(OrderCompleted {
            order_id: object::id(order),
        });
    }
}