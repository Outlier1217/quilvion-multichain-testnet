#[test_only]
module quilvion::basic_tests {
    use sui::test_scenario;
    use sui::test_utils;
    use sui::clock;
    
    #[test]
    fun test_basic() {
        // Basic test to verify setup
        let ctx = &mut test_scenario::begin(@0xA);
        let clock = clock::clock_for_testing(ctx);
        
        assert!(1 == 1, 0);
        
        test_scenario::end(ctx);
    }
}