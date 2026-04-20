module quilvion::roles {
    use sui::table::{Self, Table};

    // Role constants stored as vector<u8> directly — no string::bytes() needed
    const ROLE_DEFAULT_ADMIN: vector<u8> = b"DEFAULT_ADMIN_ROLE";
    const ROLE_ADMIN: vector<u8> = b"ADMIN_ROLE";
    const ROLE_BOT: vector<u8> = b"BOT_ROLE";
    const ROLE_MERCHANT: vector<u8> = b"MERCHANT_ROLE";

    // Error codes
    const ENotAuthorized: u64 = 1;
    const ERoleAlreadyGranted: u64 = 2;
    const ERoleNotGranted: u64 = 3;

    // `public required on all structs in Move 2024
    public struct RoleManager has key {
        id: UID,
        roles: Table<address, vector<vector<u8>>>,
    }

    // `init` must NOT be `public`
    fun init(ctx: &mut TxContext) {
        let mut role_manager = RoleManager {
            id: object::new(ctx),
            roles: table::new(ctx),
        };

        // Grant DEFAULT_ADMIN_ROLE to creator
        let mut roles_vec: vector<vector<u8>> = vector::empty();
        vector::push_back(&mut roles_vec, ROLE_DEFAULT_ADMIN);
        table::add(&mut role_manager.roles, tx_context::sender(ctx), roles_vec);

        transfer::share_object(role_manager);
    }

    // Grant role to an address (DEFAULT_ADMIN only)
    public fun grant_role(
        role_manager: &mut RoleManager,
        account: address,
        role: vector<u8>,
        ctx: &TxContext,
    ) {
        assert!(has_role(role_manager, tx_context::sender(ctx), ROLE_DEFAULT_ADMIN), ENotAuthorized);
        assert!(!has_role(role_manager, account, role), ERoleAlreadyGranted);

        if (!table::contains(&role_manager.roles, account)) {
            let mut roles_vec: vector<vector<u8>> = vector::empty();
            vector::push_back(&mut roles_vec, role);
            table::add(&mut role_manager.roles, account, roles_vec);
        } else {
            let roles_vec = table::borrow_mut(&mut role_manager.roles, account);
            vector::push_back(roles_vec, role);
        };
    }

    // Revoke role from an address (DEFAULT_ADMIN only)
    public fun revoke_role(
        role_manager: &mut RoleManager,
        account: address,
        role: vector<u8>,
        ctx: &TxContext,
    ) {
        assert!(has_role(role_manager, tx_context::sender(ctx), ROLE_DEFAULT_ADMIN), ENotAuthorized);
        assert!(has_role(role_manager, account, role), ERoleNotGranted);

        let roles_vec = table::borrow_mut(&mut role_manager.roles, account);
        let len = vector::length(roles_vec);
        let mut i = 0;
        while (i < len) {
            if (*vector::borrow(roles_vec, i) == role) {
                vector::remove(roles_vec, i);
                break
            };
            i = i + 1;
        };

        if (vector::length(roles_vec) == 0) {
            table::remove(&mut role_manager.roles, account);
        };
    }

    // Check if address has a specific role
    public fun has_role(role_manager: &RoleManager, account: address, role: vector<u8>): bool {
        if (!table::contains(&role_manager.roles, account)) {
            return false
        };
        let roles_vec = table::borrow(&role_manager.roles, account);
        let len = vector::length(roles_vec);
        let mut i = 0;
        while (i < len) {
            if (*vector::borrow(roles_vec, i) == role) {
                return true
            };
            i = i + 1;
        };
        false
    }

    // Helper functions for specific roles
    public fun is_admin(role_manager: &RoleManager, account: address): bool {
        has_role(role_manager, account, ROLE_ADMIN) ||
        has_role(role_manager, account, ROLE_DEFAULT_ADMIN)
    }

    public fun is_bot(role_manager: &RoleManager, account: address): bool {
        has_role(role_manager, account, ROLE_BOT)
    }

    public fun is_merchant(role_manager: &RoleManager, account: address): bool {
        has_role(role_manager, account, ROLE_MERCHANT)
    }
}
