module commerce_core::roles {
    use std::signer;
    use aptos_std::table;

    // ─── Error Codes ──────────────────────────────────────────────────────────
    const E_NOT_SUPER_ADMIN: u64 = 1;
    const E_NOT_ADMIN: u64       = 2;
    const E_NOT_BOT: u64         = 3;
    const E_NOT_MERCHANT: u64    = 4;
    const E_ALREADY_HAS_ROLE: u64 = 5;

    // ─── Roles Struct ─────────────────────────────────────────────────────────
    struct Roles has key {
        super_admin: address,
        admins:      table::Table<address, bool>,
        bots:        table::Table<address, bool>,
        merchants:   table::Table<address, bool>,
    }

    // ─── Init ─────────────────────────────────────────────────────────────────
    public fun init(account: &signer) {
        move_to(account, Roles {
            super_admin: signer::address_of(account),
            admins:      table::new(),
            bots:        table::new(),
            merchants:   table::new(),
        });
    }

    // ─── Assert Helpers ───────────────────────────────────────────────────────
    public fun assert_super_admin(addr: address) acquires Roles {
        assert!(addr == borrow_global<Roles>(@commerce_core).super_admin, E_NOT_SUPER_ADMIN);
    }

    public fun assert_admin(addr: address) acquires Roles {
        let roles = borrow_global<Roles>(@commerce_core);
        assert!(
            addr == roles.super_admin || table::contains(&roles.admins, addr),
            E_NOT_ADMIN
        );
    }

    public fun assert_bot(addr: address) acquires Roles {
        assert!(table::contains(&borrow_global<Roles>(@commerce_core).bots, addr), E_NOT_BOT);
    }

    public fun assert_merchant(addr: address) acquires Roles {
        assert!(
            table::contains(&borrow_global<Roles>(@commerce_core).merchants, addr),
            E_NOT_MERCHANT
        );
    }

    // ─── Role Check Views ─────────────────────────────────────────────────────
    public fun has_admin_role(addr: address): bool acquires Roles {
        let roles = borrow_global<Roles>(@commerce_core);
        addr == roles.super_admin || table::contains(&roles.admins, addr)
    }

    public fun has_bot_role(addr: address): bool acquires Roles {
        table::contains(&borrow_global<Roles>(@commerce_core).bots, addr)
    }

    public fun has_merchant_role(addr: address): bool acquires Roles {
        table::contains(&borrow_global<Roles>(@commerce_core).merchants, addr)
    }

    // ─── Grant Roles (super_admin only) ───────────────────────────────────────
    public fun grant_admin_role(account: &signer, new_admin: address) acquires Roles {
        assert_super_admin(signer::address_of(account));
        let roles = borrow_global_mut<Roles>(@commerce_core);
        assert!(!table::contains(&roles.admins, new_admin), E_ALREADY_HAS_ROLE);
        table::add(&mut roles.admins, new_admin, true);
    }

    public fun grant_bot_role(account: &signer, new_bot: address) acquires Roles {
        assert_super_admin(signer::address_of(account));
        let roles = borrow_global_mut<Roles>(@commerce_core);
        assert!(!table::contains(&roles.bots, new_bot), E_ALREADY_HAS_ROLE);
        table::add(&mut roles.bots, new_bot, true);
    }

    public fun grant_merchant_role(account: &signer, new_merchant: address) acquires Roles {
        assert_super_admin(signer::address_of(account));
        let roles = borrow_global_mut<Roles>(@commerce_core);
        assert!(!table::contains(&roles.merchants, new_merchant), E_ALREADY_HAS_ROLE);
        table::add(&mut roles.merchants, new_merchant, true);
    }

    // ─── Revoke Roles (super_admin only) ──────────────────────────────────────
    public fun revoke_admin_role(account: &signer, admin: address) acquires Roles {
        assert_super_admin(signer::address_of(account));
        table::remove(&mut borrow_global_mut<Roles>(@commerce_core).admins, admin);
    }

    public fun revoke_bot_role(account: &signer, bot: address) acquires Roles {
        assert_super_admin(signer::address_of(account));
        table::remove(&mut borrow_global_mut<Roles>(@commerce_core).bots, bot);
    }

    public fun revoke_merchant_role(account: &signer, merchant: address) acquires Roles {
        assert_super_admin(signer::address_of(account));
        table::remove(&mut borrow_global_mut<Roles>(@commerce_core).merchants, merchant);
    }
}
