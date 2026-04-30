#!/bin/bash
# ============================================================
# Quilvion Full Test Suite v2 — Fixed order IDs & coin mgmt
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

# Helper: mint fresh USDC and return coin object ID
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
        echo "$result" | grep -E "Error|error|abort|Failed|code [0-9]" | head -3
        FAIL=$((FAIL+1))
        return 1
    fi
}

echo "╔══════════════════════════════════════════╗"
echo "║   QUILVION CONTRACT TEST SUITE v2        ║"
echo "╚══════════════════════════════════════════╝"

# Previous tests created orders 1,2,3,4 — start from order 5
# Orders so far: 1(autocomplete), 2(escrowed→released), 3(disputed), 4(cancelled attempt)
# Next order will be 5

# ─── GROUP 1: CONFIG TESTS (already pass, verify again) ──────────────────────

run_test "ConfigManager: set_platform_fee (250 bps = 2.5%)" \
"sui client call --package $PKG --module config_manager --function set_platform_fee \
  --args $CONFIG_MANAGER 250 $ROLE_MANAGER --gas-budget 10000000"

run_test "ConfigManager: set_admin_approval_threshold (100 USDC)" \
"sui client call --package $PKG --module config_manager --function set_admin_approval_threshold \
  --args $CONFIG_MANAGER 100000000 $ROLE_MANAGER --gas-budget 10000000"

run_test "ConfigManager: set_daily_spend_limit (5000 USDC)" \
"sui client call --package $PKG --module config_manager --function set_daily_spend_limit \
  --args $CONFIG_MANAGER 5000000000 $ROLE_MANAGER --gas-budget 10000000"

run_test "ConfigManager: set_refund_window (7 days)" \
"sui client call --package $PKG --module config_manager --function set_refund_window \
  --args $CONFIG_MANAGER 604800 $ROLE_MANAGER --gas-budget 10000000"

# ─── GROUP 2: ROLES ───────────────────────────────────────────────────────────

run_test "Roles: grant MERCHANT_ROLE (already granted — expect ERoleAlreadyGranted abort)" \
"sui client call --package $PKG --module access_control --function grant_role \
  --args $ROLE_MANAGER $WALLET '[77,69,82,67,72,65,78,84,95,82,79,76,69]' --gas-budget 10000000"

# ─── GROUP 3: ESCROW ORDER — large (>100 USDC threshold) → stays in escrow ───

echo ""
echo "🔧 Minting 150 USDC for escrow test..."
COIN_ESCROW=$(mint_usdc 150000000)
echo "   Coin: $COIN_ESCROW"

# Order 5 — 150 USDC, goes to escrow (above 100 USDC threshold)
run_test "CommerceCore: create_order ORDER-5 (150 USDC → escrow)" \
"sui client call --package $PKG --module commerce_core --function create_order \
  --args $COMMERCE_CORE $ESCROW_MANAGER $CONFIG_MANAGER $REP_MANAGER $ROLE_MANAGER \
         10 $WALLET 0 $COIN_ESCROW $CLOCK --gas-budget 50000000"

# Set risk score on order 5
run_test "CommerceCore: set_risk_score ORDER-5 (score=15, low risk)" \
"sui client call --package $PKG --module commerce_core --function set_risk_score \
  --args $COMMERCE_CORE $ROLE_MANAGER 5 15 --gas-budget 10000000"

# Admin release escrow order 5
run_test "CommerceCore: release_escrow ORDER-5 (admin, fee deducted)" \
"sui client call --package $PKG --module commerce_core --function release_escrow \
  --args $COMMERCE_CORE $ESCROW_MANAGER $REP_MANAGER $CONFIG_MANAGER $ROLE_MANAGER \
         5 $CLOCK --gas-budget 50000000"

# ─── GROUP 4: DISPUTE FLOW (order 6) ─────────────────────────────────────────

echo ""
echo "🔧 Minting 120 USDC for dispute test..."
COIN_DISPUTE=$(mint_usdc 120000000)
echo "   Coin: $COIN_DISPUTE"

# Order 6 — 120 USDC, goes to escrow
run_test "CommerceCore: create_order ORDER-6 (120 USDC → escrow for dispute)" \
"sui client call --package $PKG --module commerce_core --function create_order \
  --args $COMMERCE_CORE $ESCROW_MANAGER $CONFIG_MANAGER $REP_MANAGER $ROLE_MANAGER \
         11 $WALLET 0 $COIN_DISPUTE $CLOCK --gas-budget 50000000"

# Raise dispute on order 6
run_test "CommerceCore: raise_dispute ORDER-6" \
"sui client call --package $PKG --module commerce_core --function raise_dispute \
  --args $COMMERCE_CORE $CONFIG_MANAGER 6 $CLOCK --gas-budget 10000000"

# Resolve dispute — favor buyer (full refund)
run_test "CommerceCore: resolve_dispute ORDER-6 (favor buyer → full USDC refund)" \
"sui client call --package $PKG --module commerce_core --function resolve_dispute \
  --args $COMMERCE_CORE $ESCROW_MANAGER $REP_MANAGER $CONFIG_MANAGER $ROLE_MANAGER \
         6 true $CLOCK --gas-budget 50000000"

# ─── GROUP 5: DISPUTE — favor merchant (order 7) ─────────────────────────────

echo ""
echo "🔧 Minting 110 USDC for dispute-merchant-wins test..."
COIN_DISP2=$(mint_usdc 110000000)
echo "   Coin: $COIN_DISP2"

run_test "CommerceCore: create_order ORDER-7 (110 USDC → escrow)" \
"sui client call --package $PKG --module commerce_core --function create_order \
  --args $COMMERCE_CORE $ESCROW_MANAGER $CONFIG_MANAGER $REP_MANAGER $ROLE_MANAGER \
         12 $WALLET 0 $COIN_DISP2 $CLOCK --gas-budget 50000000"

run_test "CommerceCore: raise_dispute ORDER-7" \
"sui client call --package $PKG --module commerce_core --function raise_dispute \
  --args $COMMERCE_CORE $CONFIG_MANAGER 7 $CLOCK --gas-budget 10000000"

run_test "CommerceCore: resolve_dispute ORDER-7 (favor merchant → fee deducted, merchant paid)" \
"sui client call --package $PKG --module commerce_core --function resolve_dispute \
  --args $COMMERCE_CORE $ESCROW_MANAGER $REP_MANAGER $CONFIG_MANAGER $ROLE_MANAGER \
         7 false $CLOCK --gas-budget 50000000"

# ─── GROUP 6: CANCEL ORDER (order 8) ─────────────────────────────────────────

echo ""
echo "🔧 Minting 130 USDC for cancel test..."
COIN_CANCEL=$(mint_usdc 130000000)
echo "   Coin: $COIN_CANCEL"

run_test "CommerceCore: create_order ORDER-8 (130 USDC → escrow for cancel)" \
"sui client call --package $PKG --module commerce_core --function create_order \
  --args $COMMERCE_CORE $ESCROW_MANAGER $CONFIG_MANAGER $REP_MANAGER $ROLE_MANAGER \
         13 $WALLET 0 $COIN_CANCEL $CLOCK --gas-budget 50000000"

run_test "CommerceCore: cancel_order ORDER-8 (buyer refund)" \
"sui client call --package $PKG --module commerce_core --function cancel_order \
  --args $COMMERCE_CORE $ESCROW_MANAGER $ROLE_MANAGER 8 --gas-budget 10000000"

# ─── GROUP 7: DIGITAL DELIVERY (order 9) ─────────────────────────────────────

echo ""
echo "🔧 Minting 200 USDC for digital delivery test..."
COIN_DIG=$(mint_usdc 200000000)
echo "   Coin: $COIN_DIG"

run_test "CommerceCore: create_order ORDER-9 (200 USDC → escrow for delivery)" \
"sui client call --package $PKG --module commerce_core --function create_order \
  --args $COMMERCE_CORE $ESCROW_MANAGER $CONFIG_MANAGER $REP_MANAGER $ROLE_MANAGER \
         14 $WALLET 0 $COIN_DIG $CLOCK --gas-budget 50000000"

# Deliver digital product — content hash = "QmABC123" in bytes
run_test "CommerceCore: deliver_digital_product ORDER-9 (IPFS hash stored)" \
"sui client call --package $PKG --module commerce_core --function deliver_digital_product \
  --args $COMMERCE_CORE $ROLE_MANAGER 9 '[81,109,65,66,67,49,50,51]' --gas-budget 10000000"

# ─── GROUP 8: AUTO-COMPLETE (order 10) small digital ─────────────────────────

echo ""
echo "🔧 Minting 50 USDC for auto-complete test..."
COIN_AUTO=$(mint_usdc 50000000)
echo "   Coin: $COIN_AUTO"

run_test "CommerceCore: create_order ORDER-10 (50 USDC digital → AUTO-COMPLETE)" \
"sui client call --package $PKG --module commerce_core --function create_order \
  --args $COMMERCE_CORE $ESCROW_MANAGER $CONFIG_MANAGER $REP_MANAGER $ROLE_MANAGER \
         15 $WALLET 0 $COIN_AUTO $CLOCK --gas-budget 50000000"

# ─── GROUP 9: REPUTATION & BADGES ────────────────────────────────────────────

run_test "ReputationManager: mint_tier_badge Silver (tier=1)" \
"sui client call --package $PKG --module reputation_manager --function mint_tier_badge \
  --args $BADGE_MANAGER $WALLET 1 --gas-budget 10000000"

run_test "ReputationManager: mint_tier_badge Gold (tier=2)" \
"sui client call --package $PKG --module reputation_manager --function mint_tier_badge \
  --args $BADGE_MANAGER $WALLET 2 --gas-budget 10000000"

# ─── GROUP 10: TREASURY WITHDRAW ─────────────────────────────────────────────
# Fees accumulated from: order 5 release, order 7 dispute-merchant-wins
# 2.5% of 150 USDC = 3.75 USDC = 3750000 micro-units
# 2.5% of 110 USDC = 2.75 USDC = 2750000 micro-units
# Total ~6500000 micro-units in treasury — withdraw 5000000 (5 USDC)

run_test "EscrowLogic: withdraw_treasury (5 USDC fees to admin)" \
"sui client call --package $PKG --module escrow_logic --function withdraw_treasury \
  --args $ESCROW_MANAGER 5000000 $WALLET $ROLE_MANAGER --gas-budget 10000000"

# ─── SUMMARY ──────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║         TEST RESULTS SUMMARY v2         ║"
echo "╠══════════════════════════════════════════╣"
printf "║  ✅ PASSED : %-28s║\n" "$PASS"
printf "║  ❌ FAILED : %-28s║\n" "$FAIL"
printf "║  📊 TOTAL  : %-28s║\n" "$((PASS+FAIL))"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Order IDs used: 5,6,7,8,9,10"
echo "USDC flows tested:"
echo "  Order 5: 150 USDC → escrow → admin release (fee 2.5% deducted)"
echo "  Order 6: 120 USDC → escrow → dispute → buyer refund (full)"
echo "  Order 7: 110 USDC → escrow → dispute → merchant wins (fee deducted)"
echo "  Order 8: 130 USDC → escrow → cancelled (full refund)"
echo "  Order 9: 200 USDC → escrow → digital delivery recorded"
echo "  Order 10: 50 USDC → auto-completed (below 100 USDC threshold)"
