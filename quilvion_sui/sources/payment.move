module commerce::payment {

    use sui::coin::{Self, Coin};
    use sui::tx_context::TxContext;

    public fun payout<T>(
        coin: &mut Coin<T>,
        fee_bps: u64,
        ctx: &mut TxContext
    ): (Coin<T>, Coin<T>) {

        let total = coin::value(coin);
        let fee = (total * fee_bps) / 10000;
        let seller_amt = total - fee;

        let fee_coin = coin::split(coin, fee, ctx);
        let seller_coin = coin::split(coin, seller_amt, ctx);

        (fee_coin, seller_coin)
    }
}