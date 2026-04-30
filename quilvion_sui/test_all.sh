#!/bin/bash
# ============================================================
# Quilvion Full Test Suite — Local Network
# ============================================================

PKG="0x71cb5a24592aa9f73c8833773357b5f4c367526d11e5ff8e67e0865dd4055d3d"
WALLET="0x5ae3c435809e3bb32c22284ab148eac5403bdf09d44c49d2ebd0405bd95707a4"

# Shared objects
COMMERCE_CORE="0x618f8390607769e10b7adb0eed821cb65bd6196c30b732ada5125f0e30ca3cc1"
ESCROW_MANAGER="0x825cfd97894b735da0945989945c63a9df5e2aec82da756920aa3cec3ea0842a"
CONFIG_MANAGER="0xb8311b66f98369cda8ab1dc6fa3e577fa1915c2160a831fbc50ba39071cc630f"
ROLE_MANAGER="0xda833ef14c69c263f334721d475cb801bba8c41124095064797c5291b89770fc"
REP_MANAGER="0x787c7e67eb82ecbed9a853b59bc3fa5968eae2032ac10bab25a59d69c042b040"
BADGE_MANAGER="0x66e46d53dc27d1a3427659bd341074da627861b1bee120a5a0cccb7025311435"
TREASURY_CAP="0xaebad5a6ff994abed4f15120c74cde216a1adae82cfe1408fa75b8757f873a23"
USDC_COIN="0x5f1ed8c7202b4733491dc0025270410c5c8f223f29252cb10b21832aaa01967f"
CLOCK="0x0000000000000000000000000000000000000000000000000000000000000006"

PASS=0
FAIL=0

run_test() {
    local name="$1"
    local cmd="$2"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🧪 TEST: $name"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    result=$(eval "$cmd" 2>&1)
    if echo "$result" | grep -q "Status: Success"; then
        echo "✅ PASS"
        PASS=$((PASS+1))
    else
        echo "❌ FAIL"
        echo "$result" | grep -E "Error|error|abort|Failed" | head -5
        FAIL=$((FAIL+1))
    fi
}

echo "╔══════════════════════════════════════════╗"
echo "║   QUILVION CONTRACT TEST SUITE           ║"
echo "╚══════════════════════════════════════════╝"

# ── TEST 1: Mint more USDC ────────────────────────────────────
run_test "Mint Mock USDC (50 USDC)" \
"sui client call \
  --package $PKG --module usdc --function mint \
  --args $TREASURY_CAP 50000000 $WALLET \
  --gas-budget 10000000"

# Get fresh USDC coin after mint
sleep 1
USDC_COIN2=$(sui client objects --json 2>/dev/null | \
  python3 -c "
import json,sys
data=json.load(sys.stdin)
coins=[o['data']['objectId'] for o in data if '${PKG}::usdc::USDC' in str(o)]
print(coins[0] if coins else '')
" 2>/dev/null || echo "$USDC_COIN")

echo "USDC Coin for tests: $USDC_COIN2"

# ── TEST 2: Config — set platform fee ────────────────────────
run_test "ConfigManager: set_platform_fee (300 bps = 3%)" \
"sui client call \
  --package $PKG --module config_manager --function set_platform_fee \
  --args $CONFIG_MANAGER 300 $ROLE_MANAGER \
  --gas-budget 10000000"

# ── TEST 3: Config — set daily spend limit ───────────────────
run_test "ConfigManager: set_daily_spend_limit (2000 USDC)" \
"sui client call \
  --package $PKG --module config_manager --function set_daily_spend_limit \
  --args $CONFIG_MANAGER 2000000000 $ROLE_MANAGER \
  --gas-budget 10000000"

# ── TEST 4: Config — set refund window ───────────────────────
run_test "ConfigManager: set_refund_window (3 days)" \
"sui client call \
  --package $PKG --module config_manager --function set_refund_window \
  --args $CONFIG_MANAGER 259200 $ROLE_MANAGER \
  --gas-budget 10000000"

# ── TEST 5: Config — set admin threshold ─────────────────────
run_test "ConfigManager: set_admin_approval_threshold (100 USDC)" \
"sui client call \
  --package $PKG --module config_manager --function set_admin_approval_threshold \
  --args $CONFIG_MANAGER 100000000 $ROLE_MANAGER \
  --gas-budget 10000000"

# ── TEST 6: Roles — grant MERCHANT_ROLE to self ──────────────
run_test "Roles: grant_role MERCHANT_ROLE to self" \
"sui client call \
  --package $PKG --module access_control --function grant_role \
  --args $ROLE_MANAGER $WALLET \"[77,69,82,67,72,65,78,84,95,82,79,76,69]\" \
  --gas-budget 10000000"

# ── TEST 7: Roles — grant BOT_ROLE to self ───────────────────
run_test "Roles: grant_role BOT_ROLE to self" \
"sui client call \
  --package $PKG --module access_control --function grant_role \
  --args $ROLE_MANAGER $WALLET \"[66,79,84,95,82,79,76,69]\" \
  --gas-budget 10000000"

# ── TEST 8: Roles — grant ADMIN_ROLE to self ─────────────────
run_test "Roles: grant_role ADMIN_ROLE to self" \
"sui client call \
  --package $PKG --module access_control --function grant_role \
  --args $ROLE_MANAGER $WALLET \"[65,68,77,73,78,95,82,79,76,69]\" \
  --gas-budget 10000000"

# ── TEST 9: Create order (small digital — auto-complete) ──────
run_test "CommerceCore: create_order (5 USDC digital — auto-complete)" \
"sui client call \
  --package $PKG --module commerce_core --function create_order \
  --args $COMMERCE_CORE $ESCROW_MANAGER $CONFIG_MANAGER $REP_MANAGER $ROLE_MANAGER \
         1 $WALLET 0 $USDC_COIN2 $CLOCK \
  --gas-budget 50000000"

# Mint fresh USDC for next tests
sui client call \
  --package $PKG --module usdc --function mint \
  --args $TREASURY_CAP 20000000 $WALLET \
  --gas-budget 10000000 > /dev/null 2>&1

sleep 1
USDC_COIN3=$(sui client objects --json 2>/dev/null | \
  python3 -c "
import json,sys
data=json.load(sys.stdin)
coins=[o['data']['objectId'] for o in data if '${PKG}::usdc::USDC' in str(o)]
print(coins[-1] if coins else '')
" 2>/dev/null)

# ── TEST 10: Create order (large — goes to escrow) ────────────
run_test "CommerceCore: create_order (20 USDC — goes to escrow)" \
"sui client call \
  --package $PKG --module commerce_core --function create_order \
  --args $COMMERCE_CORE $ESCROW_MANAGER $CONFIG_MANAGER $REP_MANAGER $ROLE_MANAGER \
         2 $WALLET 0 $USDC_COIN3 $CLOCK \
  --gas-budget 50000000"

# ── TEST 11: Set risk score (BOT_ROLE) ────────────────────────
run_test "CommerceCore: set_risk_score (order 2, score=25)" \
"sui client call \
  --package $PKG --module commerce_core --function set_risk_score \
  --args $COMMERCE_CORE $ROLE_MANAGER 2 25 \
  --gas-budget 10000000"

# ── TEST 12: Release escrow (admin) ───────────────────────────
run_test "CommerceCore: release_escrow (order 2, admin)" \
"sui client call \
  --package $PKG --module commerce_core --function release_escrow \
  --args $COMMERCE_CORE $ESCROW_MANAGER $REP_MANAGER $CONFIG_MANAGER $ROLE_MANAGER \
         2 $CLOCK \
  --gas-budget 50000000"

# Mint USDC for dispute test
sui client call \
  --package $PKG --module usdc --function mint \
  --args $TREASURY_CAP 15000000 $WALLET \
  --gas-budget 10000000 > /dev/null 2>&1

sleep 1
USDC_COIN4=$(sui client objects --json 2>/dev/null | \
  python3 -c "
import json,sys
data=json.load(sys.stdin)
coins=[o['data']['objectId'] for o in data if '${PKG}::usdc::USDC' in str(o)]
print(coins[-1] if coins else '')
" 2>/dev/null)

# ── TEST 13: Create order for dispute test ────────────────────
run_test "CommerceCore: create_order (15 USDC for dispute test)" \
"sui client call \
  --package $PKG --module commerce_core --function create_order \
  --args $COMMERCE_CORE $ESCROW_MANAGER $CONFIG_MANAGER $REP_MANAGER $ROLE_MANAGER \
         3 $WALLET 0 $USDC_COIN4 $CLOCK \
  --gas-budget 50000000"

# ── TEST 14: Raise dispute ────────────────────────────────────
run_test "CommerceCore: raise_dispute (order 3)" \
"sui client call \
  --package $PKG --module commerce_core --function raise_dispute \
  --args $COMMERCE_CORE $CONFIG_MANAGER 3 $CLOCK \
  --gas-budget 10000000"

# ── TEST 15: Resolve dispute favor buyer ──────────────────────
run_test "CommerceCore: resolve_dispute (order 3, favor buyer=true)" \
"sui client call \
  --package $PKG --module commerce_core --function resolve_dispute \
  --args $COMMERCE_CORE $ESCROW_MANAGER $REP_MANAGER $CONFIG_MANAGER $ROLE_MANAGER \
         3 true $CLOCK \
  --gas-budget 50000000"

# Mint USDC for cancel test
sui client call \
  --package $PKG --module usdc --function mint \
  --args $TREASURY_CAP 8000000 $WALLET \
  --gas-budget 10000000 > /dev/null 2>&1

sleep 1
USDC_COIN5=$(sui client objects --json 2>/dev/null | \
  python3 -c "
import json,sys
data=json.load(sys.stdin)
coins=[o['data']['objectId'] for o in data if '${PKG}::usdc::USDC' in str(o)]
print(coins[-1] if coins else '')
" 2>/dev/null)

# ── TEST 16: Create order for cancel test ─────────────────────
run_test "CommerceCore: create_order (8 USDC for cancel test)" \
"sui client call \
  --package $PKG --module commerce_core --function create_order \
  --args $COMMERCE_CORE $ESCROW_MANAGER $CONFIG_MANAGER $REP_MANAGER $ROLE_MANAGER \
         4 $WALLET 0 $USDC_COIN5 $CLOCK \
  --gas-budget 50000000"

# ── TEST 17: Cancel order ─────────────────────────────────────
run_test "CommerceCore: cancel_order (order 4)" \
"sui client call \
  --package $PKG --module commerce_core --function cancel_order \
  --args $COMMERCE_CORE $ESCROW_MANAGER $ROLE_MANAGER 4 \
  --gas-budget 10000000"

# ── TEST 18: Deliver digital product ─────────────────────────
# Need a fresh pending order first
sui client call \
  --package $PKG --module usdc --function mint \
  --args $TREASURY_CAP 200000000 $WALLET \
  --gas-budget 10000000 > /dev/null 2>&1

sleep 1
USDC_COIN6=$(sui client objects --json 2>/dev/null | \
  python3 -c "
import json,sys
data=json.load(sys.stdin)
coins=[o['data']['objectId'] for o in data if '${PKG}::usdc::USDC' in str(o)]
print(coins[-1] if coins else '')
" 2>/dev/null)

run_test "CommerceCore: create_order (200 USDC large, escrow)" \
"sui client call \
  --package $PKG --module commerce_core --function create_order \
  --args $COMMERCE_CORE $ESCROW_MANAGER $CONFIG_MANAGER $REP_MANAGER $ROLE_MANAGER \
         5 $WALLET 0 $USDC_COIN6 $CLOCK \
  --gas-budget 50000000"

run_test "CommerceCore: deliver_digital_product (order 5)" \
"sui client call \
  --package $PKG --module commerce_core --function deliver_digital_product \
  --args $COMMERCE_CORE $ROLE_MANAGER 5 \"[81,109,86,98,99,49,50,51]\" \
  --gas-budget 10000000"

# ── TEST 19: Mint tier badge ──────────────────────────────────
run_test "ReputationManager: mint_tier_badge (Bronze=0)" \
"sui client call \
  --package $PKG --module reputation_manager --function mint_tier_badge \
  --args $BADGE_MANAGER $WALLET 0 \
  --gas-budget 10000000"

# ── TEST 20: Withdraw treasury ────────────────────────────────
run_test "EscrowLogic: withdraw_treasury (fee collected so far)" \
"sui client call \
  --package $PKG --module escrow_logic --function withdraw_treasury \
  --args $ESCROW_MANAGER 1 $WALLET $ROLE_MANAGER \
  --gas-budget 10000000"

# ── SUMMARY ───────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║           TEST RESULTS SUMMARY          ║"
echo "╠══════════════════════════════════════════╣"
echo "║  ✅ PASSED : $PASS                            ║"
echo "║  ❌ FAILED : $FAIL                            ║"
echo "║  📊 TOTAL  : $((PASS+FAIL))                         ║"
echo "╚══════════════════════════════════════════╝"
