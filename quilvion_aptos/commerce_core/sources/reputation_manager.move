module commerce_core::reputation_manager {
    use std::vector;
    use aptos_std::table;

    use commerce_core::events;

    // ─── XP Thresholds ───────────────────────────────────────────────────────
    const XP_BRONZE: u64 = 0;
    const XP_SILVER: u64 = 100;
    const XP_GOLD: u64   = 500;

    // ─── Tier Constants ───────────────────────────────────────────────────────
    const TIER_BRONZE: u8 = 1;
    const TIER_SILVER: u8 = 2;
    const TIER_GOLD: u8   = 3;

    // ─── Scoring Constants ────────────────────────────────────────────────────
    const BASE_MERCHANT_SCORE: u64     = 1000;
    const DISPUTE_PENALTY_PER: u64     = 10;
    const MAX_DISPUTES_BEFORE_ZERO: u64 = 100;
    const BASE_XP_PER_ORDER: u64       = 10;

    // ─── Structs ──────────────────────────────────────────────────────────────
    struct BuyerStats has key {
        xp: table::Table<address, u64>,
        last_order: table::Table<address, u64>,
    }

    struct MerchantStats has key {
        score: table::Table<address, u64>,
        order_count: table::Table<address, u64>,
        dispute_count: table::Table<address, u64>,
    }

    struct Badge has key {
        badges: table::Table<address, vector<u8>>,
    }

    // ─── Init ─────────────────────────────────────────────────────────────────
    public fun init(account: &signer) {
        move_to(account, BuyerStats {
            xp: table::new(),
            last_order: table::new(),
        });
        move_to(account, MerchantStats {
            score: table::new(),
            order_count: table::new(),
            dispute_count: table::new(),
        });
        move_to(account, Badge {
            badges: table::new(),
        });
    }

    // ─── XP Award ────────────────────────────────────────────────────────────
    public fun award_xp(buyer: address, order_id: u64) acquires BuyerStats, Badge {
        let stats = borrow_global_mut<BuyerStats>(@commerce_core);

        if (!table::contains(&stats.xp, buyer)) {
            table::add(&mut stats.xp, buyer, 0);
            table::add(&mut stats.last_order, buyer, 0);
        };

        let current_xp = table::borrow_mut(&mut stats.xp, buyer);
        let old_tier   = get_tier_from_xp(*current_xp);
        *current_xp    = *current_xp + BASE_XP_PER_ORDER;
        let new_tier   = get_tier_from_xp(*current_xp);

        // Update last order
        let last = table::borrow_mut(&mut stats.last_order, buyer);
        *last = order_id;

        // Emit XP awarded event before dropping stats borrow
        events::emit_xp_awarded(buyer, BASE_XP_PER_ORDER);

        // Mint badge on tier upgrade (separate borrow scope)
        if (new_tier != old_tier) {
            events::emit_tier_upgraded(buyer, new_tier);
            mint_tier_badge(buyer, new_tier);
        };
    }

    // ─── Buyer Views ──────────────────────────────────────────────────────────
    public fun get_buyer_xp(buyer: address): u64 acquires BuyerStats {
        let stats = borrow_global<BuyerStats>(@commerce_core);
        if (table::contains(&stats.xp, buyer)) {
            *table::borrow(&stats.xp, buyer)
        } else {
            0
        }
    }

    public fun get_buyer_tier(buyer: address): u8 acquires BuyerStats {
        get_tier_from_xp(get_buyer_xp(buyer))
    }

    // ─── Internal Tier Helper ─────────────────────────────────────────────────
    fun get_tier_from_xp(xp: u64): u8 {
        if (xp >= XP_GOLD) {
            TIER_GOLD
        } else if (xp >= XP_SILVER) {
            TIER_SILVER
        } else {
            TIER_BRONZE
        }
    }

    // ─── Merchant Score Update ────────────────────────────────────────────────
    // BUG FIX: Original code had a mutable + immutable borrow conflict on
    // stats.dispute_count. Fixed by reading the count into a local variable
    // before recomputing the score.
    public fun update_merchant_score(
        merchant: address,
        _order_id: u64,
        dispute_raised: bool,
    ) acquires MerchantStats {
        let stats = borrow_global_mut<MerchantStats>(@commerce_core);

        // Initialise merchant entry if first interaction
        if (!table::contains(&stats.score, merchant)) {
            table::add(&mut stats.score,         merchant, BASE_MERCHANT_SCORE);
            table::add(&mut stats.order_count,   merchant, 0);
            table::add(&mut stats.dispute_count, merchant, 0);
        };

        // Increment order count
        let order_count = table::borrow_mut(&mut stats.order_count, merchant);
        *order_count = *order_count + 1;

        // Optionally increment dispute count
        if (dispute_raised) {
            let dispute_count = table::borrow_mut(&mut stats.dispute_count, merchant);
            *dispute_count = *dispute_count + 1;
        };

        // Read dispute count into a local — avoids simultaneous mut+immut borrow
        let dispute_count_val = *table::borrow(&stats.dispute_count, merchant);

        // Recompute score
        let score = table::borrow_mut(&mut stats.score, merchant);
        if (dispute_count_val >= MAX_DISPUTES_BEFORE_ZERO) {
            *score = 0;
        } else {
            *score = BASE_MERCHANT_SCORE - (dispute_count_val * DISPUTE_PENALTY_PER);
        };
    }

    // ─── Merchant Views ───────────────────────────────────────────────────────
    public fun get_merchant_score(merchant: address): u64 acquires MerchantStats {
        let stats = borrow_global<MerchantStats>(@commerce_core);
        if (table::contains(&stats.score, merchant)) {
            *table::borrow(&stats.score, merchant)
        } else {
            BASE_MERCHANT_SCORE
        }
    }

    public fun get_merchant_order_count(merchant: address): u64 acquires MerchantStats {
        let stats = borrow_global<MerchantStats>(@commerce_core);
        if (table::contains(&stats.order_count, merchant)) {
            *table::borrow(&stats.order_count, merchant)
        } else {
            0
        }
    }

    public fun get_merchant_dispute_count(merchant: address): u64 acquires MerchantStats {
        let stats = borrow_global<MerchantStats>(@commerce_core);
        if (table::contains(&stats.dispute_count, merchant)) {
            *table::borrow(&stats.dispute_count, merchant)
        } else {
            0
        }
    }

    // ─── Badge Internals ──────────────────────────────────────────────────────
    fun mint_tier_badge(wallet: address, tier: u8) acquires Badge {
        let badge_store = borrow_global_mut<Badge>(@commerce_core);

        if (!table::contains(&badge_store.badges, wallet)) {
            table::add(&mut badge_store.badges, wallet, vector::empty());
        };

        let badges = table::borrow_mut(&mut badge_store.badges, wallet);
        if (!has_badge_internal(badges, tier)) {
            vector::push_back(badges, tier);
            events::emit_tier_badge_minted(wallet, tier);
        };
    }

    fun has_badge_internal(badges: &vector<u8>, tier: u8): bool {
        let i   = 0;
        let len = vector::length(badges);
        while (i < len) {
            if (*vector::borrow(badges, i) == tier) {
                return true
            };
            i = i + 1;
        };
        false
    }

    // ─── Badge View ───────────────────────────────────────────────────────────
    public fun has_badge(wallet: address, tier: u8): bool acquires Badge {
        let badge_store = borrow_global<Badge>(@commerce_core);
        if (table::contains(&badge_store.badges, wallet)) {
            has_badge_internal(table::borrow(&badge_store.badges, wallet), tier)
        } else {
            false
        }
    }
}
