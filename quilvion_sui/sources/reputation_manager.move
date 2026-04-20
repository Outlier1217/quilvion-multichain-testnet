module quilvion::reputation_manager {
    use sui::table::{Self, Table};
    use quilvion::events;

    // XP thresholds
    const XP_SILVER: u64 = 100;
    const XP_GOLD: u64 = 500;

    // XP per order
    const XP_PER_ORDER: u64 = 10;

    // Merchant score adjustment
    const SCORE_INCREASE: u64 = 5;
    const SCORE_DECREASE: u64 = 20;
    const MAX_MERCHANT_SCORE: u64 = 100;
    const MIN_MERCHANT_SCORE: u64 = 0;

    // All structs must be `public` in Move 2024
    public struct BuyerReputation has store {
        wallet: address,
        total_xp: u64,
        order_count: u64,
        tier: vector<u8>,
    }

    public struct MerchantReputation has store {
        wallet: address,
        score: u64,
        total_orders: u64,
        disputed_orders: u64,
    }

    public struct ReputationManager has key {
        id: UID,
        buyer_reputations: Table<address, BuyerReputation>,
        merchant_reputations: Table<address, MerchantReputation>,
    }

    public struct BadgeManager has key {
        id: UID,
        badges: Table<address, vector<u8>>,
    }

    // Tier string helpers
    public fun tier_bronze(): vector<u8> { b"Bronze" }
    public fun tier_silver(): vector<u8> { b"Silver" }
    public fun tier_gold(): vector<u8>   { b"Gold" }

    // `init` must NOT be `public`
    fun init(ctx: &mut TxContext) {
        let rep_manager = ReputationManager {
            id: object::new(ctx),
            buyer_reputations: table::new(ctx),
            merchant_reputations: table::new(ctx),
        };
        transfer::share_object(rep_manager);

        let badge_manager = BadgeManager {
            id: object::new(ctx),
            badges: table::new(ctx),
        };
        transfer::share_object(badge_manager);
    }

    // Award XP to buyer after a completed order
    public fun award_xp(
        rep_manager: &mut ReputationManager,
        buyer_wallet: address,
        _order_id: u64,
        _ctx: &mut TxContext,
    ) {
        let old_tier = get_buyer_tier(rep_manager, buyer_wallet);

        if (!table::contains(&rep_manager.buyer_reputations, buyer_wallet)) {
            let buyer_rep = BuyerReputation {
                wallet: buyer_wallet,
                total_xp: XP_PER_ORDER,
                order_count: 1,
                tier: tier_bronze(),
            };
            table::add(&mut rep_manager.buyer_reputations, buyer_wallet, buyer_rep);
        } else {
            let buyer_rep = table::borrow_mut(&mut rep_manager.buyer_reputations, buyer_wallet);
            buyer_rep.total_xp = buyer_rep.total_xp + XP_PER_ORDER;
            buyer_rep.order_count = buyer_rep.order_count + 1;

            if (buyer_rep.total_xp >= XP_GOLD) {
                buyer_rep.tier = tier_gold();
            } else if (buyer_rep.total_xp >= XP_SILVER) {
                buyer_rep.tier = tier_silver();
            } else {
                buyer_rep.tier = tier_bronze();
            };
        };

        events::emit_xp_awarded(buyer_wallet, XP_PER_ORDER);

        let new_tier = get_buyer_tier(rep_manager, buyer_wallet);
        if (old_tier != new_tier) {
            events::emit_tier_upgraded(buyer_wallet, new_tier);
        };
    }

    // Update merchant score after order settlement
    public fun update_merchant_score(
        rep_manager: &mut ReputationManager,
        merchant_wallet: address,
        _order_id: u64,
        dispute_raised: bool,
        _ctx: &mut TxContext,
    ) {
        if (!table::contains(&rep_manager.merchant_reputations, merchant_wallet)) {
            let initial_score = if (dispute_raised) {
                MAX_MERCHANT_SCORE - SCORE_DECREASE
            } else {
                MAX_MERCHANT_SCORE
            };
            let merchant_rep = MerchantReputation {
                wallet: merchant_wallet,
                score: initial_score,
                total_orders: 1,
                disputed_orders: if (dispute_raised) { 1 } else { 0 },
            };
            table::add(&mut rep_manager.merchant_reputations, merchant_wallet, merchant_rep);
        } else {
            let merchant_rep = table::borrow_mut(&mut rep_manager.merchant_reputations, merchant_wallet);
            merchant_rep.total_orders = merchant_rep.total_orders + 1;

            if (dispute_raised) {
                merchant_rep.disputed_orders = merchant_rep.disputed_orders + 1;
                if (merchant_rep.score >= SCORE_DECREASE) {
                    merchant_rep.score = merchant_rep.score - SCORE_DECREASE;
                } else {
                    merchant_rep.score = MIN_MERCHANT_SCORE;
                };
            } else {
                if (merchant_rep.score + SCORE_INCREASE <= MAX_MERCHANT_SCORE) {
                    merchant_rep.score = merchant_rep.score + SCORE_INCREASE;
                } else {
                    merchant_rep.score = MAX_MERCHANT_SCORE;
                };
            };
        };
    }

    // Get buyer XP
    public fun get_buyer_xp(rep_manager: &ReputationManager, wallet: address): u64 {
        if (!table::contains(&rep_manager.buyer_reputations, wallet)) {
            return 0
        };
        table::borrow(&rep_manager.buyer_reputations, wallet).total_xp
    }

    // Get buyer tier
    public fun get_buyer_tier(rep_manager: &ReputationManager, wallet: address): vector<u8> {
        if (!table::contains(&rep_manager.buyer_reputations, wallet)) {
            return tier_bronze()
        };
        table::borrow(&rep_manager.buyer_reputations, wallet).tier
    }

    // Get merchant score
    public fun get_merchant_score(rep_manager: &ReputationManager, wallet: address): u64 {
        if (!table::contains(&rep_manager.merchant_reputations, wallet)) {
            return MAX_MERCHANT_SCORE
        };
        table::borrow(&rep_manager.merchant_reputations, wallet).score
    }

    // Get merchant total order count
    public fun get_merchant_order_count(rep_manager: &ReputationManager, wallet: address): u64 {
        if (!table::contains(&rep_manager.merchant_reputations, wallet)) {
            return 0
        };
        table::borrow(&rep_manager.merchant_reputations, wallet).total_orders
    }

    // Mint a tier badge for a wallet (ERC-1155 style)
    public fun mint_tier_badge(
        badge_manager: &mut BadgeManager,
        wallet: address,
        tier: u8,
        _ctx: &mut TxContext,
    ) {
        if (!table::contains(&badge_manager.badges, wallet)) {
            let mut badges_vec: vector<u8> = vector::empty();
            vector::push_back(&mut badges_vec, tier);
            table::add(&mut badge_manager.badges, wallet, badges_vec);
        } else {
            let badges_vec = table::borrow_mut(&mut badge_manager.badges, wallet);
            let len = vector::length(badges_vec);
            let mut found = false;
            let mut i = 0;
            while (i < len) {
                if (*vector::borrow(badges_vec, i) == tier) {
                    found = true;
                    break
                };
                i = i + 1;
            };
            if (!found) {
                vector::push_back(badges_vec, tier);
            };
        };
        events::emit_tier_badge_minted(wallet, tier);
    }

    // Check if a wallet holds a specific badge tier
    public fun has_badge(badge_manager: &BadgeManager, wallet: address, tier: u8): bool {
        if (!table::contains(&badge_manager.badges, wallet)) {
            return false
        };
        let badges_vec = table::borrow(&badge_manager.badges, wallet);
        let len = vector::length(badges_vec);
        let mut i = 0;
        while (i < len) {
            if (*vector::borrow(badges_vec, i) == tier) {
                return true
            };
            i = i + 1;
        };
        false
    }
}
