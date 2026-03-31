module commerce::roles {

    use sui::tx_context::{Self, TxContext};

    struct Roles has store {
        admin: address,
        bot: address
    }

    public fun new(ctx: &mut TxContext): Roles {
        Roles {
            admin: tx_context::sender(ctx),
            bot: tx_context::sender(ctx)
        }
    }

    public fun is_admin(r: &Roles, addr: address): bool {
        r.admin == addr
    }

    public fun is_bot(r: &Roles, addr: address): bool {
        r.bot == addr
    }
}