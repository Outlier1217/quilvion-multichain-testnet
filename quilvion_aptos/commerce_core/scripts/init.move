script {
    use commerce_core::commerce_core;
    use commerce_core::config_manager;
    use commerce_core::escrow_logic;
    use commerce_core::roles;
    use commerce_core::reputation_manager;

    fun init_module(account: &signer) {
        commerce_core::init(account);
        config_manager::init(account);
        escrow_logic::init(account);
        roles::init(account);
        reputation_manager::init(account);
    }
}