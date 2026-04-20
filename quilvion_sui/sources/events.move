module quilvion::events {
    use sui::event;

    // All structs must be `public` in Move 2024 edition
    public struct OrderCreated has copy, drop {
        order_id: u64,
        buyer: address,
        merchant: address,
        amount: u64,
    }

    public struct OrderCompleted has copy, drop {
        order_id: u64,
    }

    public struct OrderDisputed has copy, drop {
        order_id: u64,
        buyer: address,
    }

    public struct DisputeResolved has copy, drop {
        order_id: u64,
        favor_buyer: bool,
    }

    public struct RiskScoreSet has copy, drop {
        order_id: u64,
        score: u8,
    }

    public struct XPAwarded has copy, drop {
        buyer: address,
        amount: u64,
    }

    public struct TierUpgraded has copy, drop {
        buyer: address,
        tier: vector<u8>,
    }

    public struct TierBadgeMinted has copy, drop {
        wallet: address,
        tier: u8,
    }

    // Event emission functions
    public fun emit_order_created(order_id: u64, buyer: address, merchant: address, amount: u64) {
        event::emit(OrderCreated { order_id, buyer, merchant, amount });
    }

    public fun emit_order_completed(order_id: u64) {
        event::emit(OrderCompleted { order_id });
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

    public fun emit_xp_awarded(buyer: address, amount: u64) {
        event::emit(XPAwarded { buyer, amount });
    }

    public fun emit_tier_upgraded(buyer: address, tier: vector<u8>) {
        event::emit(TierUpgraded { buyer, tier });
    }

    public fun emit_tier_badge_minted(wallet: address, tier: u8) {
        event::emit(TierBadgeMinted { wallet, tier });
    }
}
