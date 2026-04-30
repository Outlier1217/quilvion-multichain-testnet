/// mock_usdc.move
/// Fake USDC for local network testing only.
/// Mimics Circle's USDC interface: module name `usdc`, struct name `USDC`.
/// DO NOT deploy to testnet or mainnet.
module usdc::usdc {
    use sui::coin;

    public struct USDC has drop {}

    fun init(witness: USDC, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency(
            witness,
            6,                  // 6 decimals — same as real USDC
            b"USDC",
            b"USD Coin",
            b"Mock USDC for local testing",
            option::none(),
            ctx,
        );
        transfer::public_freeze_object(metadata);
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
    }

    /// Mint mock USDC — only for testing
    public fun mint(
        cap: &mut coin::TreasuryCap<USDC>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        coin::mint_and_transfer(cap, amount, recipient, ctx);
    }
}
