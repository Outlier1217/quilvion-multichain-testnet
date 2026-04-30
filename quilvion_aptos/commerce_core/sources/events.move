module commerce_core::events {
    use aptos_framework::event;

    // ─── Event Structs ────────────────────────────────────────────────────────
    // NOTE: #[event] attribute is required by Aptos event v2 system.
    // Without it, event::emit() will fail at compile time.

    #[event]
    struct OrderCreated has drop, store {
        order_id: u64,
        buyer: address,
        merchant: address,
        amount: u64,
    }

    #[event]
    struct OrderCompleted has drop, store {
        order_id: u64,
    }

    #[event]
    struct OrderCancelled has drop, store {
        order_id: u64,
    }

    #[event]
    struct OrderDisputed has drop, store {
        order_id: u64,
        buyer: address,
    }

    #[event]
    struct DisputeResolved has drop, store {
        order_id: u64,
        favor_buyer: bool,
    }

    #[event]
    struct RiskScoreSet has drop, store {
        order_id: u64,
        score: u8,
    }

    #[event]
    struct ProductDelivered has drop, store {
        order_id: u64,
        content_hash: vector<u8>,
    }

    #[event]
    struct XPAwarded has drop, store {
        buyer: address,
        amount: u64,
    }

    // TierUpgraded: emitted when buyer crosses a tier threshold
    #[event]
    struct TierUpgraded has drop, store {
        buyer: address,
        tier: u8,   // 1 = Bronze, 2 = Silver, 3 = Gold
    }

    #[event]
    struct TierBadgeMinted has drop, store {
        wallet: address,
        tier: u8,
    }

    // ─── Emit Functions ───────────────────────────────────────────────────────

    public fun emit_order_created(order_id: u64, buyer: address, merchant: address, amount: u64) {
        event::emit(OrderCreated { order_id, buyer, merchant, amount });
    }

    public fun emit_order_completed(order_id: u64) {
        event::emit(OrderCompleted { order_id });
    }

    public fun emit_order_cancelled(order_id: u64) {
        event::emit(OrderCancelled { order_id });
    }

    public fun emit_order_disputed(order_id: u64, buyer: address) {
        event::emit(OrderDisputed { order_id, buyer });
    }

    public fun emit_dispute_resolved(order_id: u64, favor_buyer: bool) {
        event::emit(DisputeResolved { order_id, favor_buyer });
    }

    public fun emit_risk_score_set(order_id: u64, score: u8) {
        event::emit(RiskScoreSet { order_id, score });
    }

    public fun emit_product_delivered(order_id: u64, content_hash: vector<u8>) {
        event::emit(ProductDelivered { order_id, content_hash });
    }

    public fun emit_xp_awarded(buyer: address, amount: u64) {
        event::emit(XPAwarded { buyer, amount });
    }

    public fun emit_tier_upgraded(buyer: address, tier: u8) {
        event::emit(TierUpgraded { buyer, tier });
    }

    public fun emit_tier_badge_minted(wallet: address, tier: u8) {
        event::emit(TierBadgeMinted { wallet, tier });
    }
}
