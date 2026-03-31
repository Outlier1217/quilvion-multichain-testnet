module commerce::config {

    struct Config has store {
        daily_limit: u64,
        admin_threshold: u64,
        fee_bps: u64,
        refund_window: u64,
        risk_threshold: u64
    }

    public fun new(): Config {
        Config {
            daily_limit: 1000_000000,
            admin_threshold: 1000_000000,
            fee_bps: 184,
            refund_window: 86400,
            risk_threshold: 70
        }
    }

    public fun get_daily_limit(c: &Config): u64 {
        c.daily_limit
    }

    public fun get_fee(c: &Config): u64 {
        c.fee_bps
    }
}