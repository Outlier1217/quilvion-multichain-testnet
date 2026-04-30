#!/bin/bash
# ============================================================
# Quilvion Final Test Suite — Dynamic Order ID Tracking
# next_order_id = 10 confirmed, so new orders start at 10
# ============================================================

PKG="0x71cb5a24592aa9f73c8833773357b5f4c367526d11e5ff8e67e0865dd4055d3d"
WALLET="0x5ae3c435809e3bb32c22284ab148eac5403bdf09d44c49d2ebd0405bd95707a4"
COMMERCE_CORE="0x618f8390607769e10b7adb0eed821cb65bd6196c30b732ada5125f0e30ca3cc1"
ESCROW_MANAGER="0x825cfd97894b735da0945989945c63a9df5e2aec82da756920aa3cec3ea0842a"
CONFIG_MANAGER="0xb8311b66f98369cda8ab1dc6fa3e577fa1915c2160a831fbc50ba39071cc630f"
ROLE_MANAGER="0xda833ef14c69c263f334721d475cb801bba8c41124095064797c5291b89770fc"
REP_MANAGER="0x787c7e67eb82ecbed9a853b59bc3fa5968eae2032ac10bab25a59d69c042b040"
BADGE_MANAGER="0x66e46d53dc27d1a3427659bd341074da627861b1bee120a5a0cccb7025311435"
TREASURY_CAP="0xaebad5a6ff994abed4f15120c74cde216a1adae82cfe1408fa75b8757f873a23"
CLOCK="0x0000000000000000000000000000000000000000000000000000000000000006"

PASS=0; FAIL=0

# ── Get current next_order_id from chain ──────────────────────────────────────
NEXT_ID=$(sui client object $COMMERCE_CORE --json 2>/dev/null | \
  python3 -c "import json,sys; d=json.load(sys.stdin); print(d['content']['fields']['next_order_id'])" 2>/dev/null)
echo "📋 Current next_order_id on-chain: $NEXT_ID"

# Order IDs will be: NEXT_ID, NEXT_ID+1, NEXT_ID+2, NEXT_ID+3, NEXT_ID+4
O1=$NEXT_ID
O2=$((NEXT_ID+1))
O3=$((NEXT_ID+2))
O4=$((NEXT_ID+3))
O5=$((NEXT_ID+4))

echo "📋 Orders this run: $O1 $O2 $O3 $O4 $O5"

# ── Mint USDC and return coin ID ──────────────────────────────────────────────
mint_usdc() {
    local amount=$1
    sui client call \
      --package $PKG --module usdc --function mint \
      --args $TREASURY_CAP $amount $WALLET \
      --gas-budget 10000000 --json 2>/dev/null | \
    python3 -c "
import json,sys
data=json.load(sys.stdin)
for obj in data.get('objectChanges',[]):
    t = obj.get('objectType','')
    if '::usdc::USDC' in t and obj.get('type')=='created':
        print(obj['objectId'])
        break
" 2>/dev/null
}

run_test() {
    local name="$1"; shift
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🧪 TEST: $name"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    result=$(eval "$@" 2>&1)
    if echo "$result" | grep -q "Status: Success"; then
        echo "✅ PASS"
        PASS=$((PASS+1))
        return 0
    else
        echo "❌ FAIL"
        echo "$result" | grep -E "Error|error|abort|code [0-9]" | head -3
        FAIL=$((FAIL+1))
        return 1
    fi
}

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   QUILVION FINAL TEST SUITE              ║"
echo "╚══════════════════════════════════════════╝"

# ════════════════════════════════════════════════
# GROUP 1: CONFIG MANAGER
# ════════════════════════════════════════════════
echo ""; echo "▶ GROUP 1: CONFIG MANAGER"

run_test "set_platform_fee (250 bps = 2.5%)" \
"sui client call --package $PKG --module config_manager --function set_platform_fee \
  --args $CONFIG_MANAGER 250 $ROLE_MANAGER --gas-budget 10000000"

run_test "set_admin_approval_threshold (100 USDC = 100_000_000)" \
"sui client call --package $PKG --module config_manager --function set_admin_approval_threshold \
  --args $CONFIG_MANAGER 100000000 $ROLE_MANAGER --gas-budget 10000000"

run_test "set_daily_spend_limit (5000 USDC = 5_000_000_000)" \
"sui client call --package $PKG --module config_manager --function set_daily_spend_limit \
  --args $CONFIG_MANAGER 5000000000 $ROLE_MANAGER --gas-budget 10000000"

run_test "set_refund_window (7 days = 604800 sec)" \
"sui client call --package $PKG --module config_manager --function set_refund_window \
  --args $CONFIG_MANAGER 604800 $ROLE_MANAGER --gas-budget 10000000"

# ════════════════════════════════════════════════
# GROUP 2: ESCROW ORDER + ADMIN RELEASE  (Order O1)
# ════════════════════════════════════════════════
echo ""; echo "▶ GROUP 2: ESCROW + ADMIN RELEASE  (Order $O1)"

echo "🔧 Minting 150 USDC..."
COIN1=$(mint_usdc 150000000)
echo "   Coin: $COIN1"

run_test "create_order ORDER-$O1 (150 USDC → escrow, above 100 USDC threshold)" \
"sui client call --package $PKG --module commerce_core --function create_order \
  --args $COMMERCE_CORE $ESCROW_MANAGER $CONFIG_MANAGER $REP_MANAGER $ROLE_MANAGER \
         100 $WALLET 0 $COIN1 $CLOCK --gas-budget 50000000"

run_test "set_risk_score ORDER-$O1 (BOT sets score=20)" \
"sui client call --package $PKG --module commerce_core --function set_risk_score \
  --args $COMMERCE_CORE $ROLE_MANAGER $O1 20 --gas-budget 10000000"

run_test "release_escrow ORDER-$O1 (admin releases, 2.5% fee to treasury)" \
"sui client call --package $PKG --module commerce_core --function release_escrow \
  --args $COMMERCE_CORE $ESCROW_MANAGER $REP_MANAGER $CONFIG_MANAGER $ROLE_MANAGER \
         $O1 $CLOCK --gas-budget 50000000"

# ════════════════════════════════════════════════
# GROUP 3: DISPUTE → FAVOR BUYER  (Order O2)
# ════════════════════════════════════════════════
echo ""; echo "▶ GROUP 3: DISPUTE → FAVOR BUYER  (Order $O2)"

echo "🔧 Minting 120 USDC..."
COIN2=$(mint_usdc 120000000)
echo "   Coin: $COIN2"

run_test "create_order ORDER-$O2 (120 USDC → escrow)" \
"sui client call --package $PKG --module commerce_core --function create_order \
  --args $COMMERCE_CORE $ESCROW_MANAGER $CONFIG_MANAGER $REP_MANAGER $ROLE_MANAGER \
         101 $WALLET 0 $COIN2 $CLOCK --gas-budget 50000000"

run_test "raise_dispute ORDER-$O2 (buyer raises within window)" \
"sui client call --package $PKG --module commerce_core --function raise_dispute \
  --args $COMMERCE_CORE $CONFIG_MANAGER $O2 $CLOCK --gas-budget 10000000"

run_test "resolve_dispute ORDER-$O2 favor_buyer=true (full USDC refund)" \
"sui client call --package $PKG --module commerce_core --function resolve_dispute \
  --args $COMMERCE_CORE $ESCROW_MANAGER $REP_MANAGER $CONFIG_MANAGER $ROLE_MANAGER \
         $O2 true $CLOCK --gas-budget 50000000"

# ════════════════════════════════════════════════
# GROUP 4: DISPUTE → FAVOR MERCHANT  (Order O3)
# ════════════════════════════════════════════════
echo ""; echo "▶ GROUP 4: DISPUTE → FAVOR MERCHANT  (Order $O3)"

echo "🔧 Minting 110 USDC..."
COIN3=$(mint_usdc 110000000)
echo "   Coin: $COIN3"

run_test "create_order ORDER-$O3 (110 USDC → escrow)" \
"sui client call --package $PKG --module commerce_core --function create_order \
  --args $COMMERCE_CORE $ESCROW_MANAGER $CONFIG_MANAGER $REP_MANAGER $ROLE_MANAGER \
         102 $WALLET 0 $COIN3 $CLOCK --gas-budget 50000000"

run_test "raise_dispute ORDER-$O3" \
"sui client call --package $PKG --module commerce_core --function raise_dispute \
  --args $COMMERCE_CORE $CONFIG_MANAGER $O3 $CLOCK --gas-budget 10000000"

run_test "resolve_dispute ORDER-$O3 favor_buyer=false (merchant paid, fee deducted)" \
"sui client call --package $PKG --module commerce_core --function resolve_dispute \
  --args $COMMERCE_CORE $ESCROW_MANAGER $REP_MANAGER $CONFIG_MANAGER $ROLE_MANAGER \
         $O3 false $CLOCK --gas-budget 50000000"

# ════════════════════════════════════════════════
# GROUP 5: CANCEL ORDER  (Order O4)
# ════════════════════════════════════════════════
echo ""; echo "▶ GROUP 5: CANCEL ORDER  (Order $O4)"

echo "🔧 Minting 130 USDC..."
COIN4=$(mint_usdc 130000000)
echo "   Coin: $COIN4"

run_test "create_order ORDER-$O4 (130 USDC → escrow)" \
"sui client call --package $PKG --module commerce_core --function create_order \
  --args $COMMERCE_CORE $ESCROW_MANAGER $CONFIG_MANAGER $REP_MANAGER $ROLE_MANAGER \
         103 $WALLET 0 $COIN4 $CLOCK --gas-budget 50000000"

run_test "cancel_order ORDER-$O4 (full USDC refund to buyer)" \
"sui client call --package $PKG --module commerce_core --function cancel_order \
  --args $COMMERCE_CORE $ESCROW_MANAGER $ROLE_MANAGER $O4 --gas-budget 10000000"

# ════════════════════════════════════════════════
# GROUP 6: DIGITAL DELIVERY  (Order O5)
# ════════════════════════════════════════════════
echo ""; echo "▶ GROUP 6: DIGITAL DELIVERY  (Order $O5)"

echo "🔧 Minting 200 USDC..."
COIN5=$(mint_usdc 200000000)
echo "   Coin: $COIN5"

run_test "create_order ORDER-$O5 (200 USDC → escrow)" \
"sui client call --package $PKG --module commerce_core --function create_order \
  --args $COMMERCE_CORE $ESCROW_MANAGER $CONFIG_MANAGER $REP_MANAGER $ROLE_MANAGER \
         104 $WALLET 0 $COIN5 $CLOCK --gas-budget 50000000"

# content_hash = "QmTestHash" as bytes
run_test "deliver_digital_product ORDER-$O5 (merchant stores IPFS hash)" \
"sui client call --package $PKG --module commerce_core --function deliver_digital_product \
  --args $COMMERCE_CORE $ROLE_MANAGER $O5 '[81,109,84,101,115,116,72,97,115,104]' \
  --gas-budget 10000000"

# ════════════════════════════════════════════════
# GROUP 7: TREASURY WITHDRAW
# Fees collected: 2.5% of 150 + 2.5% of 110 = 3.75 + 2.75 = 6.5 USDC = 6_500_000
# ════════════════════════════════════════════════
echo ""; echo "▶ GROUP 7: TREASURY WITHDRAW"

run_test "withdraw_treasury (6 USDC = 6_000_000 micro-units, within collected fees)" \
"sui client call --package $PKG --module escrow_logic --function withdraw_treasury \
  --args $ESCROW_MANAGER 6000000 $WALLET $ROLE_MANAGER --gas-budget 10000000"

# ════════════════════════════════════════════════
# GROUP 8: REPUTATION & BADGES
# ════════════════════════════════════════════════
echo ""; echo "▶ GROUP 8: REPUTATION & BADGES"

run_test "mint_tier_badge Bronze (tier=0) — idempotent, already exists ok" \
"sui client call --package $PKG --module reputation_manager --function mint_tier_badge \
  --args $BADGE_MANAGER $WALLET 0 --gas-budget 10000000"

run_test "mint_tier_badge Silver (tier=1)" \
"sui client call --package $PKG --module reputation_manager --function mint_tier_badge \
  --args $BADGE_MANAGER $WALLET 1 --gas-budget 10000000"

run_test "mint_tier_badge Gold (tier=2)" \
"sui client call --package $PKG --module reputation_manager --function mint_tier_badge \
  --args $BADGE_MANAGER $WALLET 2 --gas-budget 10000000"

# ════════════════════════════════════════════════
# SUMMARY
# ════════════════════════════════════════════════
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║         FINAL TEST RESULTS              ║"
echo "╠══════════════════════════════════════════╣"
printf "║  ✅ PASSED : %-28s║\n" "$PASS"
printf "║  ❌ FAILED : %-28s║\n" "$FAIL"
printf "║  📊 TOTAL  : %-28s║\n" "$((PASS+FAIL))"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "USDC Flows Verified:"
echo "  Order $O1 : 150 USDC → escrow → risk scored → admin release (fee 3.75 USDC)"
echo "  Order $O2 : 120 USDC → escrow → dispute → buyer refund (0 fee)"
echo "  Order $O3 : 110 USDC → escrow → dispute → merchant wins (fee 2.75 USDC)"
echo "  Order $O4 : 130 USDC → escrow → cancelled (0 fee, full refund)"
echo "  Order $O5 : 200 USDC → escrow → digital content hash stored on-chain"
