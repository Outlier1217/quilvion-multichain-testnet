use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("8YPzbK3t3vgJkV2dPo33wDDhyaV3oghtUn9RbQf2aSDx");

// ============================================================
// ERRORS
// ============================================================

#[error_code]
pub enum CommerceError {
    #[msg("Order already completed or cancelled")]
    InvalidOrderStatus,
    #[msg("Refund window has expired, cannot raise dispute")]
    RefundWindowExpired,
    #[msg("Daily spend limit exceeded for this wallet")]
    DailyLimitExceeded,
    #[msg("Unauthorized: you don't have the required role")]
    Unauthorized,
    #[msg("Risk score must be between 0 and 100")]
    InvalidRiskScore,
    #[msg("Order is not in disputed state")]
    NotDisputed,
    #[msg("Platform fee bps cannot exceed 10000")]
    InvalidFee,
    #[msg("Insufficient treasury balance")]
    InsufficientTreasury,
    #[msg("Order not in escrowed state")]
    NotEscrowed,
    #[msg("Order not in pending state")]
    NotPending,
    #[msg("Merchant not verified for this order")]
    MerchantNotVerified,
    #[msg("XP not enough for badge mint")]
    InsufficientXP,
    #[msg("Badge already minted for this tier")]
    BadgeAlreadyMinted,
}

// ============================================================
// STATE — Order
// ============================================================

#[account]
pub struct Order {
    pub order_id: u64,
    pub buyer: Pubkey,
    pub merchant: Pubkey,
    pub amount: u64,            // net amount (after fee) in USDC lamports
    pub platform_fee: u64,      // fee collected
    pub status: OrderStatus,
    pub product_id: u64,
    pub risk_score: u8,         // 0-100, set by BOT_ROLE
    pub content_hash: [u8; 32], // IPFS/content hash for digital delivery
    pub created_at: i64,
    pub is_verified_merchant: bool,
    pub is_escrowed: bool,
    pub bump: u8,
}

impl Order {
    // 8 discriminator + all fields
    pub const LEN: usize = 8 + 8 + 32 + 32 + 8 + 8 + 1 + 8 + 1 + 32 + 8 + 1 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum OrderStatus {
    Pending,
    Escrowed,
    Completed,
    Cancelled,
    Disputed,
    Resolved,
}

// ============================================================
// STATE — PlatformConfig
// ============================================================

#[account]
pub struct PlatformConfig {
    pub admin: Pubkey,
    pub bot: Pubkey,
    pub daily_spend_limit: u64,         // per-wallet daily USDC cap (lamports)
    pub admin_approval_threshold: u64,  // above this → escrow + admin review
    pub platform_fee_bps: u16,          // e.g. 250 = 2.5%
    pub refund_window: i64,             // seconds within which dispute can be raised
    pub treasury: Pubkey,               // where platform fees go
    pub bump: u8,
}

impl PlatformConfig {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 8 + 2 + 8 + 32 + 1;
    pub const SEED: &'static [u8] = b"platform_config";
}

// ============================================================
// STATE — EscrowAccount
// ============================================================

#[account]
pub struct EscrowAccount {
    pub order_id: u64,
    pub buyer: Pubkey,
    pub merchant: Pubkey,
    pub amount: u64,
    pub locked: bool,
    pub bump: u8,
}

impl EscrowAccount {
    pub const LEN: usize = 8 + 8 + 32 + 32 + 8 + 1 + 1;
}

// ============================================================
// STATE — DailySpend
// ============================================================

#[account]
pub struct DailySpend {
    pub wallet: Pubkey,
    pub amount_spent: u64,
    pub day_timestamp: i64, // start of the day (unix midnight)
    pub bump: u8,
}

impl DailySpend {
    pub const LEN: usize = 8 + 32 + 8 + 8 + 1;
}

// ============================================================
// STATE — BuyerReputation
// ============================================================

#[account]
pub struct BuyerReputation {
    pub wallet: Pubkey,
    pub total_xp: u64,
    pub current_tier: u8, // 0 = Bronze, 1 = Silver, 2 = Gold
    pub has_badge: [bool; 3],
    pub bump: u8,
}

impl BuyerReputation {
    pub const LEN: usize = 8 + 32 + 8 + 1 + 3 + 1;
    pub const XP_SILVER: u64 = 100;
    pub const XP_GOLD: u64 = 500;
}

// ============================================================
// STATE — MerchantReputation
// ============================================================

#[account]
pub struct MerchantReputation {
    pub wallet: Pubkey,
    pub total_orders: u64,
    pub disputes_raised: u64,
    pub score: u64,          // 0–1000 aggregate, starts at 500
    pub has_badge: [bool; 3],
    pub bump: u8,
}

impl MerchantReputation {
    pub const LEN: usize = 8 + 32 + 8 + 8 + 8 + 3 + 1;
}

// ============================================================
// EVENTS
// ============================================================

#[event]
pub struct OrderCreated {
    pub order_id: u64,
    pub buyer: Pubkey,
    pub merchant: Pubkey,
    pub amount: u64,
}

#[event]
pub struct OrderCompleted {
    pub order_id: u64,
}

#[event]
pub struct OrderCancelled {
    pub order_id: u64,
}

#[event]
pub struct OrderDisputed {
    pub order_id: u64,
    pub buyer: Pubkey,
}

#[event]
pub struct DisputeResolved {
    pub order_id: u64,
    pub favor_buyer: bool,
}

#[event]
pub struct RiskScoreSet {
    pub order_id: u64,
    pub score: u8,
}

#[event]
pub struct XPAwarded {
    pub buyer: Pubkey,
    pub amount: u64,
}

#[event]
pub struct TierUpgraded {
    pub buyer: Pubkey,
    pub tier: u8,
}

#[event]
pub struct TierBadgeMinted {
    pub wallet: Pubkey,
    pub tier: u8,
}

#[event]
pub struct DigitalProductDelivered {
    pub order_id: u64,
    pub content_hash: [u8; 32],
}

// ============================================================
// PROGRAM
// ============================================================

#[program]
pub mod commerce_core {
    use super::*;

    // ----------------------------------------------------------
    // ConfigManager: initialize_config
    // Call karo ek baar — admin se. Sets all platform params.
    // ----------------------------------------------------------
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        daily_spend_limit: u64,
        admin_approval_threshold: u64,
        platform_fee_bps: u16,
        refund_window: i64,
    ) -> Result<()> {
        require!(platform_fee_bps <= 10000, CommerceError::InvalidFee);
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.bot = ctx.accounts.bot.key();
        config.treasury = ctx.accounts.treasury.key();
        config.daily_spend_limit = daily_spend_limit;
        config.admin_approval_threshold = admin_approval_threshold;
        config.platform_fee_bps = platform_fee_bps;
        config.refund_window = refund_window;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    // ----------------------------------------------------------
    // ConfigManager: update_config
    // Admin update kare anytime.
    // ----------------------------------------------------------
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        daily_spend_limit: u64,
        admin_approval_threshold: u64,
        platform_fee_bps: u16,
        refund_window: i64,
    ) -> Result<()> {
        require!(platform_fee_bps <= 10000, CommerceError::InvalidFee);
        require!(
            ctx.accounts.admin.key() == ctx.accounts.config.admin,
            CommerceError::Unauthorized
        );
        let config = &mut ctx.accounts.config;
        config.daily_spend_limit = daily_spend_limit;
        config.admin_approval_threshold = admin_approval_threshold;
        config.platform_fee_bps = platform_fee_bps;
        config.refund_window = refund_window;
        Ok(())
    }

    // ----------------------------------------------------------
    // CommerceCore: create_order
    // Buyer order banata hai. USDC transfer hota hai.
    // Agar amount > threshold → escrow. Warna → direct merchant.
    // ----------------------------------------------------------
    pub fn create_order(
        ctx: Context<CreateOrder>,
        product_id: u64,
        amount: u64,
        is_verified_merchant: bool,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        let clock = Clock::get()?;

        // Platform fee nikalo
        let fee = (amount as u128)
            .checked_mul(config.platform_fee_bps as u128)
            .unwrap()
            .checked_div(10000)
            .unwrap() as u64;
        let net_amount = amount.checked_sub(fee).unwrap();

        // Daily spend check + reset if new day
        let daily = &mut ctx.accounts.daily_spend;
        let today_start = clock.unix_timestamp / 86400 * 86400;
        if daily.day_timestamp < today_start {
            daily.amount_spent = 0;
            daily.day_timestamp = today_start;
            daily.wallet = ctx.accounts.buyer.key();
        }
        let new_spent = daily.amount_spent.checked_add(amount).unwrap();
        require!(new_spent <= config.daily_spend_limit, CommerceError::DailyLimitExceeded);
        daily.amount_spent = new_spent;

        // Order initialize
        let order = &mut ctx.accounts.order;
        order.order_id = product_id;
        order.buyer = ctx.accounts.buyer.key();
        order.merchant = ctx.accounts.merchant_wallet.key();
        order.amount = net_amount;
        order.platform_fee = fee;
        order.product_id = product_id;
        order.risk_score = 0;
        order.content_hash = [0u8; 32];
        order.created_at = clock.unix_timestamp;
        order.is_verified_merchant = is_verified_merchant;
        order.bump = ctx.bumps.order;

        if amount > config.admin_approval_threshold {
            // ESCROW PATH: buyer → escrow token account
            order.status = OrderStatus::Escrowed;
            order.is_escrowed = true;

            let escrow_acc = &mut ctx.accounts.escrow_account;
            escrow_acc.order_id = product_id;
            escrow_acc.buyer = ctx.accounts.buyer.key();
            escrow_acc.merchant = ctx.accounts.merchant_wallet.key();
            escrow_acc.amount = net_amount;
            escrow_acc.locked = true;
            escrow_acc.bump = ctx.bumps.escrow_account;

            // Transfer full amount to escrow token account
            let cpi_accounts = Transfer {
                from: ctx.accounts.buyer_token_account.to_account_info(),
                to: ctx.accounts.escrow_token_account.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            };
            token::transfer(
                CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
                amount,
            )?;
        } else {
            // DIRECT PATH: buyer → merchant (net) + treasury (fee)
            order.status = OrderStatus::Pending;
            order.is_escrowed = false;

            // Net to merchant
            let cpi_merchant = Transfer {
                from: ctx.accounts.buyer_token_account.to_account_info(),
                to: ctx.accounts.merchant_token_account.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            };
            token::transfer(
                CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_merchant),
                net_amount,
            )?;

            // Fee to treasury
            if fee > 0 {
                let cpi_fee = Transfer {
                    from: ctx.accounts.buyer_token_account.to_account_info(),
                    to: ctx.accounts.treasury_token_account.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                };
                token::transfer(
                    CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_fee),
                    fee,
                )?;
            }
        }

        emit!(OrderCreated {
            order_id: product_id,
            buyer: ctx.accounts.buyer.key(),
            merchant: ctx.accounts.merchant_wallet.key(),
            amount,
        });

        Ok(())
    }

    // ----------------------------------------------------------
    // CommerceCore: complete_order
    // Auto-complete: direct path ke orders ke liye.
    // Status Pending → Completed.
    // ----------------------------------------------------------
    pub fn complete_order(ctx: Context<CompleteOrder>) -> Result<()> {
        let order = &mut ctx.accounts.order;
        require!(order.status == OrderStatus::Pending, CommerceError::NotPending);
        order.status = OrderStatus::Completed;
        emit!(OrderCompleted { order_id: order.order_id });
        Ok(())
    }

    // ----------------------------------------------------------
    // CommerceCore: deliver_digital_product
    // Merchant IPFS/content hash set karta hai.
    // ----------------------------------------------------------
    pub fn deliver_digital_product(
        ctx: Context<DeliverDigital>,
        content_hash: [u8; 32],
    ) -> Result<()> {
        let order = &mut ctx.accounts.order;
        require!(
            order.status == OrderStatus::Pending || order.status == OrderStatus::Escrowed,
            CommerceError::InvalidOrderStatus
        );
        require!(
            ctx.accounts.merchant.key() == order.merchant,
            CommerceError::Unauthorized
        );
        order.content_hash = content_hash;
        emit!(DigitalProductDelivered {
            order_id: order.order_id,
            content_hash,
        });
        Ok(())
    }

    // ----------------------------------------------------------
    // CommerceCore: release_escrow
    // Admin escrowed funds ko merchant ko release karta hai.
    // ----------------------------------------------------------
    pub fn release_escrow(ctx: Context<ReleaseEscrow>) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(
            ctx.accounts.admin.key() == config.admin,
            CommerceError::Unauthorized
        );

        let order = &mut ctx.accounts.order;
        require!(order.status == OrderStatus::Escrowed, CommerceError::NotEscrowed);
        order.status = OrderStatus::Completed;

        let escrow = &mut ctx.accounts.escrow_account;
        escrow.locked = false;

        let net = escrow.amount;
        let fee = order.platform_fee;

        // Escrow → merchant (net amount)
        let seeds = &[
            b"escrow",
            order.buyer.as_ref(),
            &order.product_id.to_le_bytes(),
            &[escrow.bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_merchant = Transfer {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.merchant_token_account.to_account_info(),
            authority: ctx.accounts.escrow_account.to_account_info(),
        };
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_merchant,
                signer,
            ),
            net,
        )?;

        // Escrow → treasury (fee)
        if fee > 0 {
            let cpi_fee = Transfer {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                to: ctx.accounts.treasury_token_account.to_account_info(),
                authority: ctx.accounts.escrow_account.to_account_info(),
            };
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    cpi_fee,
                    signer,
                ),
                fee,
            )?;
        }

        emit!(OrderCompleted { order_id: order.order_id });
        Ok(())
    }

    // ----------------------------------------------------------
    // CommerceCore: cancel_order
    // Buyer cancel kare fulfillment se pehle. Refund buyer ko.
    // ----------------------------------------------------------
    pub fn cancel_order(ctx: Context<CancelOrder>) -> Result<()> {
        let order = &mut ctx.accounts.order;
        require!(
            order.status == OrderStatus::Pending || order.status == OrderStatus::Escrowed,
            CommerceError::InvalidOrderStatus
        );
        require!(
            ctx.accounts.buyer.key() == order.buyer,
            CommerceError::Unauthorized
        );

        order.status = OrderStatus::Cancelled;

        // Agar escrowed tha → refund buyer
        if order.is_escrowed {
            let escrow = &mut ctx.accounts.escrow_account;
            escrow.locked = false;

            let total_refund = escrow.amount + order.platform_fee;
            let seeds = &[
                b"escrow",
                order.buyer.as_ref(),
                &order.product_id.to_le_bytes(),
                &[escrow.bump],
            ];
            let signer = &[&seeds[..]];

            let cpi_refund = Transfer {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                to: ctx.accounts.buyer_token_account.to_account_info(),
                authority: ctx.accounts.escrow_account.to_account_info(),
            };
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    cpi_refund,
                    signer,
                ),
                total_refund,
            )?;
        }

        emit!(OrderCancelled { order_id: order.order_id });
        Ok(())
    }

    // ----------------------------------------------------------
    // CommerceCore: raise_dispute
    // Buyer refund window ke andar dispute raise kare.
    // ----------------------------------------------------------
    pub fn raise_dispute(ctx: Context<RaiseDispute>) -> Result<()> {
        let order = &mut ctx.accounts.order;
        let config = &ctx.accounts.config;
        let clock = Clock::get()?;

        require!(
            ctx.accounts.buyer.key() == order.buyer,
            CommerceError::Unauthorized
        );
        require!(
            order.status == OrderStatus::Pending
                || order.status == OrderStatus::Escrowed
                || order.status == OrderStatus::Completed,
            CommerceError::InvalidOrderStatus
        );

        let elapsed = clock.unix_timestamp - order.created_at;
        require!(elapsed <= config.refund_window, CommerceError::RefundWindowExpired);

        order.status = OrderStatus::Disputed;

        emit!(OrderDisputed {
            order_id: order.order_id,
            buyer: ctx.accounts.buyer.key(),
        });
        Ok(())
    }

    // ----------------------------------------------------------
    // CommerceCore: resolve_dispute
    // Admin resolve kare — favor_buyer=true → refund, false → merchant ko.
    // ----------------------------------------------------------
    pub fn resolve_dispute(ctx: Context<ResolveDispute>, favor_buyer: bool) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(
            ctx.accounts.admin.key() == config.admin,
            CommerceError::Unauthorized
        );

        let order = &mut ctx.accounts.order;
        require!(order.status == OrderStatus::Disputed, CommerceError::NotDisputed);
        order.status = OrderStatus::Resolved;

        if order.is_escrowed {
            // ✅ Extract all values BEFORE taking any borrow on escrow_account
            let escrow_bump = ctx.accounts.escrow_account.bump;
            let escrow_amount = ctx.accounts.escrow_account.amount;
            let total = escrow_amount + order.platform_fee;
            let platform_fee = order.platform_fee;
            let product_id = order.product_id;
            let buyer_key = order.buyer;

            // ✅ Now mutate — borrow is scoped and drops before CPIs
            ctx.accounts.escrow_account.locked = false;

            let seeds = &[
                b"escrow",
                buyer_key.as_ref(),
                &product_id.to_le_bytes(),
                &[escrow_bump],
            ];
            let signer = &[&seeds[..]];

            if favor_buyer {
                let cpi = Transfer {
                    from: ctx.accounts.escrow_token_account.to_account_info(),
                    to: ctx.accounts.buyer_token_account.to_account_info(),
                    authority: ctx.accounts.escrow_account.to_account_info(), // ✅ no conflict now
                };
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        cpi,
                        signer,
                    ),
                    total,
                )?;
            } else {
                let cpi_m = Transfer {
                    from: ctx.accounts.escrow_token_account.to_account_info(),
                    to: ctx.accounts.merchant_token_account.to_account_info(),
                    authority: ctx.accounts.escrow_account.to_account_info(),
                };
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        cpi_m,
                        signer,
                    ),
                    escrow_amount, // ✅ using copied value, not `escrow.amount`
                )?;
                if platform_fee > 0 {
                    let cpi_f = Transfer {
                        from: ctx.accounts.escrow_token_account.to_account_info(),
                        to: ctx.accounts.treasury_token_account.to_account_info(),
                        authority: ctx.accounts.escrow_account.to_account_info(),
                    };
                    token::transfer(
                        CpiContext::new_with_signer(
                            ctx.accounts.token_program.to_account_info(),
                            cpi_f,
                            signer,
                        ),
                        platform_fee, // ✅ using copied value, not `order.platform_fee`
                    )?;
                }
            }
        }

        emit!(DisputeResolved {
            order_id: ctx.accounts.order.order_id,
            favor_buyer,
        });
        Ok(())
    }
    // ----------------------------------------------------------
    // CommerceCore: set_risk_score
    // Sirf BOT_ROLE (config.bot) call kar sakta hai.
    // ----------------------------------------------------------
    pub fn set_risk_score(ctx: Context<SetRiskScore>, score: u8) -> Result<()> {
        require!(score <= 100, CommerceError::InvalidRiskScore);
        require!(
            ctx.accounts.bot.key() == ctx.accounts.config.bot,
            CommerceError::Unauthorized
        );
        let order = &mut ctx.accounts.order;
        order.risk_score = score;
        emit!(RiskScoreSet {
            order_id: order.order_id,
            score,
        });
        Ok(())
    }

    // ----------------------------------------------------------
    // CommerceCore: withdraw_treasury
    // Admin treasury se fee collect kare.
    // ----------------------------------------------------------
    pub fn withdraw_treasury(ctx: Context<WithdrawTreasury>, amount: u64) -> Result<()> {
        require!(
            ctx.accounts.admin.key() == ctx.accounts.config.admin,
            CommerceError::Unauthorized
        );
        require!(
            ctx.accounts.treasury_token_account.amount >= amount,
            CommerceError::InsufficientTreasury
        );
        let cpi = Transfer {
            from: ctx.accounts.treasury_token_account.to_account_info(),
            to: ctx.accounts.admin_token_account.to_account_info(),
            authority: ctx.accounts.admin.to_account_info(),
        };
        token::transfer(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi),
            amount,
        )?;
        Ok(())
    }

    // ----------------------------------------------------------
    // ReputationManager: initialize_buyer_rep
    // Buyer pehli baar apna reputation account banaye.
    // ----------------------------------------------------------
    pub fn initialize_buyer_rep(ctx: Context<InitBuyerRep>) -> Result<()> {
        let rep = &mut ctx.accounts.buyer_rep;
        rep.wallet = ctx.accounts.buyer.key();
        rep.total_xp = 0;
        rep.current_tier = 0;
        rep.has_badge = [false; 3];
        rep.bump = ctx.bumps.buyer_rep;
        Ok(())
    }

    // ----------------------------------------------------------
    // ReputationManager: award_xp
    // CommerceCore settle hone ke baad call karo.
    // Admin/bot call kare (off-chain trigger).
    // ----------------------------------------------------------
    pub fn award_xp(ctx: Context<AwardXp>, _order_id: u64, xp_amount: u64) -> Result<()> {
        require!(
            ctx.accounts.admin.key() == ctx.accounts.config.admin,
            CommerceError::Unauthorized
        );

        let rep = &mut ctx.accounts.buyer_rep;
        rep.total_xp = rep.total_xp.saturating_add(xp_amount);

        // Tier check
        let new_tier = if rep.total_xp >= BuyerReputation::XP_GOLD {
            2u8
        } else if rep.total_xp >= BuyerReputation::XP_SILVER {
            1u8
        } else {
            0u8
        };

        if new_tier > rep.current_tier {
            rep.current_tier = new_tier;
            emit!(TierUpgraded {
                buyer: rep.wallet,
                tier: new_tier,
            });
        }

        emit!(XPAwarded {
            buyer: rep.wallet,
            amount: xp_amount,
        });
        Ok(())
    }

    // ----------------------------------------------------------
    // ReputationManager: initialize_merchant_rep
    // Merchant pehli baar apna reputation account banaye.
    // ----------------------------------------------------------
    pub fn initialize_merchant_rep(ctx: Context<InitMerchantRep>) -> Result<()> {
        let rep = &mut ctx.accounts.merchant_rep;
        rep.wallet = ctx.accounts.merchant.key();
        rep.total_orders = 0;
        rep.disputes_raised = 0;
        rep.score = 500; // neutral start
        rep.has_badge = [false; 3];
        rep.bump = ctx.bumps.merchant_rep;
        Ok(())
    }

    // ----------------------------------------------------------
    // ReputationManager: update_merchant_score
    // Settled order ke baad call karo.
    // ----------------------------------------------------------
    pub fn update_merchant_score(
        ctx: Context<UpdateMerchantScore>,
        _order_id: u64,
        dispute_raised: bool,
    ) -> Result<()> {
        require!(
            ctx.accounts.admin.key() == ctx.accounts.config.admin,
            CommerceError::Unauthorized
        );

        let rep = &mut ctx.accounts.merchant_rep;
        rep.total_orders = rep.total_orders.saturating_add(1);

        if dispute_raised {
            rep.disputes_raised = rep.disputes_raised.saturating_add(1);
            rep.score = rep.score.saturating_sub(20);
        } else {
            rep.score = rep.score.saturating_add(10).min(1000);
        }

        Ok(())
    }

    // ----------------------------------------------------------
    // ReputationManager: mint_tier_badge
    // Tier upgrade pe ek baar badge mint hoga.
    // ----------------------------------------------------------
    pub fn mint_tier_badge(ctx: Context<MintBadge>) -> Result<()> {
        let rep = &mut ctx.accounts.buyer_rep;
        let tier = rep.current_tier as usize;

        require!(tier > 0, CommerceError::InsufficientXP);
        require!(!rep.has_badge[tier], CommerceError::BadgeAlreadyMinted);

        rep.has_badge[tier] = true;

        emit!(TierBadgeMinted {
            wallet: rep.wallet,
            tier: rep.current_tier,
        });
        Ok(())
    }
}

// ============================================================
// ACCOUNT CONTEXTS
// ============================================================

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: bot wallet pubkey
    pub bot: AccountInfo<'info>,
    /// CHECK: treasury wallet pubkey
    pub treasury: AccountInfo<'info>,
    #[account(
        init,
        payer = admin,
        space = PlatformConfig::LEN,
        seeds = [PlatformConfig::SEED],
        bump
    )]
    pub config: Account<'info, PlatformConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [PlatformConfig::SEED],
        bump = config.bump
    )]
    pub config: Account<'info, PlatformConfig>,
}

#[derive(Accounts)]
#[instruction(product_id: u64)]
pub struct CreateOrder<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: merchant pubkey passed from frontend
    pub merchant_wallet: AccountInfo<'info>,
    #[account(
        init,
        payer = buyer,
        space = Order::LEN,
        seeds = [b"order", buyer.key().as_ref(), &product_id.to_le_bytes()],
        bump
    )]
    pub order: Account<'info, Order>,
    #[account(
        init_if_needed,
        payer = buyer,
        space = EscrowAccount::LEN,
        seeds = [b"escrow", buyer.key().as_ref(), &product_id.to_le_bytes()],
        bump
    )]
    pub escrow_account: Account<'info, EscrowAccount>,
    #[account(
        init_if_needed,
        payer = buyer,
        space = DailySpend::LEN,
        seeds = [b"daily_spend", buyer.key().as_ref()],
        bump
    )]
    pub daily_spend: Account<'info, DailySpend>,
    #[account(seeds = [PlatformConfig::SEED], bump = config.bump)]
    pub config: Account<'info, PlatformConfig>,
    #[account(mut)]
    pub buyer_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub merchant_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub escrow_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub treasury_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CompleteOrder<'info> {
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"order", buyer.key().as_ref(), &order.product_id.to_le_bytes()],
        bump = order.bump,
        has_one = buyer
    )]
    pub order: Account<'info, Order>,
}

#[derive(Accounts)]
pub struct DeliverDigital<'info> {
    pub merchant: Signer<'info>,
    #[account(
        mut,
        seeds = [b"order", order.buyer.as_ref(), &order.product_id.to_le_bytes()],
        bump = order.bump
    )]
    pub order: Account<'info, Order>,
}

#[derive(Accounts)]
pub struct ReleaseEscrow<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [PlatformConfig::SEED], bump = config.bump)]
    pub config: Account<'info, PlatformConfig>,
    #[account(
        mut,
        seeds = [b"order", order.buyer.as_ref(), &order.product_id.to_le_bytes()],
        bump = order.bump
    )]
    pub order: Account<'info, Order>,
    #[account(
        mut,
        seeds = [b"escrow", order.buyer.as_ref(), &order.product_id.to_le_bytes()],
        bump = escrow_account.bump
    )]
    pub escrow_account: Account<'info, EscrowAccount>,
    #[account(mut)]
    pub escrow_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub merchant_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub treasury_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelOrder<'info> {
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"order", buyer.key().as_ref(), &order.product_id.to_le_bytes()],
        bump = order.bump,
        has_one = buyer
    )]
    pub order: Account<'info, Order>,
    #[account(
        mut,
        seeds = [b"escrow", buyer.key().as_ref(), &order.product_id.to_le_bytes()],
        bump = escrow_account.bump
    )]
    pub escrow_account: Account<'info, EscrowAccount>,
    #[account(mut)]
    pub escrow_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub buyer_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RaiseDispute<'info> {
    pub buyer: Signer<'info>,
    #[account(seeds = [PlatformConfig::SEED], bump = config.bump)]
    pub config: Account<'info, PlatformConfig>,
    #[account(
        mut,
        seeds = [b"order", buyer.key().as_ref(), &order.product_id.to_le_bytes()],
        bump = order.bump,
        has_one = buyer
    )]
    pub order: Account<'info, Order>,
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [PlatformConfig::SEED], bump = config.bump)]
    pub config: Account<'info, PlatformConfig>,
    #[account(
        mut,
        seeds = [b"order", order.buyer.as_ref(), &order.product_id.to_le_bytes()],
        bump = order.bump
    )]
    pub order: Account<'info, Order>,
    #[account(
        mut,
        seeds = [b"escrow", order.buyer.as_ref(), &order.product_id.to_le_bytes()],
        bump = escrow_account.bump
    )]
    pub escrow_account: Account<'info, EscrowAccount>,
    #[account(mut)]
    pub escrow_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub buyer_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub merchant_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub treasury_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SetRiskScore<'info> {
    pub bot: Signer<'info>,
    #[account(seeds = [PlatformConfig::SEED], bump = config.bump)]
    pub config: Account<'info, PlatformConfig>,
    #[account(
        mut,
        seeds = [b"order", order.buyer.as_ref(), &order.product_id.to_le_bytes()],
        bump = order.bump
    )]
    pub order: Account<'info, Order>,
}

#[derive(Accounts)]
pub struct WithdrawTreasury<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [PlatformConfig::SEED], bump = config.bump)]
    pub config: Account<'info, PlatformConfig>,
    #[account(mut)]
    pub treasury_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub admin_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct InitBuyerRep<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        init,
        payer = buyer,
        space = BuyerReputation::LEN,
        seeds = [b"buyer_rep", buyer.key().as_ref()],
        bump
    )]
    pub buyer_rep: Account<'info, BuyerReputation>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AwardXp<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [PlatformConfig::SEED], bump = config.bump)]
    pub config: Account<'info, PlatformConfig>,
    /// CHECK: buyer wallet whose XP to award
    pub buyer_wallet: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [b"buyer_rep", buyer_wallet.key().as_ref()],
        bump = buyer_rep.bump
    )]
    pub buyer_rep: Account<'info, BuyerReputation>,
}

#[derive(Accounts)]
pub struct InitMerchantRep<'info> {
    #[account(mut)]
    pub merchant: Signer<'info>,
    #[account(
        init,
        payer = merchant,
        space = MerchantReputation::LEN,
        seeds = [b"merchant_rep", merchant.key().as_ref()],
        bump
    )]
    pub merchant_rep: Account<'info, MerchantReputation>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateMerchantScore<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [PlatformConfig::SEED], bump = config.bump)]
    pub config: Account<'info, PlatformConfig>,
    /// CHECK: merchant wallet whose score to update
    pub merchant_wallet: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [b"merchant_rep", merchant_wallet.key().as_ref()],
        bump = merchant_rep.bump
    )]
    pub merchant_rep: Account<'info, MerchantReputation>,
}

#[derive(Accounts)]
pub struct MintBadge<'info> {
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"buyer_rep", buyer.key().as_ref()],
        bump = buyer_rep.bump,
        constraint = buyer_rep.wallet == buyer.key() @ CommerceError::Unauthorized
    )]
    pub buyer_rep: Account<'info, BuyerReputation>,
}