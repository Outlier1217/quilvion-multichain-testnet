use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("DFsnsGdMsQxwfzmm9m6xyVhbvteQT2VBcRNXf6pX5UCD");

pub const PLATFORM_FEE_BPS: u16 = 250;
pub const REFUND_WINDOW: i64 = 86400;

#[program]
pub mod commerce_core {
    use super::*;

    // ─── Init Platform ───────────────────────────────────────
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let platform = &mut ctx.accounts.platform;
        platform.admin             = ctx.accounts.authority.key();
        platform.order_count       = 0;
        platform.fee_bps           = PLATFORM_FEE_BPS;
        platform.refund_window     = REFUND_WINDOW;
        platform.admin_threshold   = 500_000_000;
        platform.daily_spend_limit = 10_000_000_000;
        platform.treasury          = ctx.accounts.treasury.key();
        Ok(())
    }

    // ─── Initialize Escrow Vault ─────────────────────────────
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        msg!("Escrow vault initialized: {}", ctx.accounts.escrow_vault.key());
        Ok(())
    }

    // ─── Role Management ─────────────────────────────────────
    pub fn grant_role(ctx: Context<ManageRole>, role: RoleType) -> Result<()> {
        require!(
            ctx.accounts.platform.admin == ctx.accounts.authority.key(),
            ErrorCode::Unauthorized
        );
        let r   = &mut ctx.accounts.role_account;
        r.wallet = ctx.accounts.target.key();
        r.role   = role;
        r.active = true;
        Ok(())
    }

    pub fn revoke_role(ctx: Context<ManageRole>, _role: RoleType) -> Result<()> {
        require!(
            ctx.accounts.platform.admin == ctx.accounts.authority.key(),
            ErrorCode::Unauthorized
        );
        ctx.accounts.role_account.active = false;
        Ok(())
    }

    // ─── Create Order ────────────────────────────────────────
    pub fn create_order(
        ctx: Context<CreateOrder>,
        product_id:           u64,
        merchant_wallet:      Pubkey,
        amount:               u64,
        is_verified_merchant: bool,
    ) -> Result<()> {
        let clock = Clock::get()?;

        // Daily spend check
        let daily = &mut ctx.accounts.daily_spend;
        let today = clock.unix_timestamp / 86400;
        if daily.day != today {
            daily.day   = today;
            daily.spent = 0;
        }
        require!(
            daily.spent + amount <= ctx.accounts.platform.daily_spend_limit,
            ErrorCode::DailyLimitExceeded
        );
        daily.spent += amount;

        let needs_escrow    = amount >= ctx.accounts.platform.admin_threshold;
        let fee             = (amount as u128 * ctx.accounts.platform.fee_bps as u128 / 10_000) as u64;
        let merchant_amount = amount - fee;
        let order_id        = ctx.accounts.platform.order_count;

        // Transfer USDC buyer → escrow vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.buyer_token.to_account_info(),
                    to:        ctx.accounts.escrow_vault.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            amount,
        )?;

        // Populate order
        let o              = &mut ctx.accounts.order;
        o.order_id         = order_id;
        o.buyer            = ctx.accounts.buyer.key();
        o.merchant         = merchant_wallet;
        o.amount           = amount;
        o.fee              = fee;
        o.merchant_amount  = merchant_amount;
        o.product_id       = product_id;
        o.product_type     = ProductType::Digital;
        o.status           = OrderStatus::Pending;
        o.needs_escrow     = needs_escrow;
        o.created_at       = clock.unix_timestamp;
        o.risk_score       = 0;
        o.content_hash     = [0u8; 32];
        o.is_verified_merchant = is_verified_merchant;

        ctx.accounts.platform.order_count += 1;

        emit!(OrderCreated {
            order_id,
            buyer:    ctx.accounts.buyer.key(),
            merchant: merchant_wallet,
            amount,
        });
        Ok(())
    }

    // ─── Deliver Digital Product ─────────────────────────────
    pub fn deliver_digital_product(
        ctx: Context<MerchantAction>,
        content_hash: [u8; 32],
    ) -> Result<()> {
        let role = &ctx.accounts.role_account;
        require!(role.active && role.role == RoleType::Merchant, ErrorCode::NotMerchant);
        let order = &mut ctx.accounts.order;
        require!(order.status == OrderStatus::Pending,         ErrorCode::InvalidOrderStatus);
        require!(order.product_type == ProductType::Digital,   ErrorCode::NotDigital);
        order.content_hash = content_hash;
        order.status       = OrderStatus::Delivered;
        Ok(())
    }

    // ─── Complete Order ──────────────────────────────────────
    pub fn complete_order(ctx: Context<CompleteOrder>) -> Result<()> {
        let order = &mut ctx.accounts.order;
        require!(
            order.status == OrderStatus::Delivered || order.status == OrderStatus::Pending,
            ErrorCode::InvalidOrderStatus
        );
        require!(!order.needs_escrow, ErrorCode::RequiresAdminApproval);
        order.status = OrderStatus::Completed;

        let merchant_amount = order.merchant_amount;
        let fee             = order.fee;
        let order_id        = order.order_id;
        let seeds           = &[b"escrow_vault".as_ref(), &[ctx.bumps.escrow_vault]];
        let signer          = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.escrow_vault.to_account_info(),
                    to:        ctx.accounts.merchant_token.to_account_info(),
                    authority: ctx.accounts.escrow_vault.to_account_info(),
                },
                signer,
            ),
            merchant_amount,
        )?;
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.escrow_vault.to_account_info(),
                    to:        ctx.accounts.treasury_token.to_account_info(),
                    authority: ctx.accounts.escrow_vault.to_account_info(),
                },
                signer,
            ),
            fee,
        )?;

        emit!(OrderCompleted { order_id });
        Ok(())
    }

    // ─── Release Escrow (admin) ──────────────────────────────
    pub fn release_escrow(ctx: Context<AdminAction>) -> Result<()> {
        require!(
            ctx.accounts.role_account.active && ctx.accounts.role_account.role == RoleType::Admin,
            ErrorCode::NotAdmin
        );
        let order = &mut ctx.accounts.order;
        require!(
            order.status == OrderStatus::Delivered || order.status == OrderStatus::Pending,
            ErrorCode::InvalidOrderStatus
        );
        order.status = OrderStatus::Completed;

        let merchant_amount = order.merchant_amount;
        let fee             = order.fee;
        let seeds           = &[b"escrow_vault".as_ref(), &[ctx.bumps.escrow_vault]];
        let signer          = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.escrow_vault.to_account_info(),
                    to:        ctx.accounts.merchant_token.to_account_info(),
                    authority: ctx.accounts.escrow_vault.to_account_info(),
                },
                signer,
            ),
            merchant_amount,
        )?;
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.escrow_vault.to_account_info(),
                    to:        ctx.accounts.treasury_token.to_account_info(),
                    authority: ctx.accounts.escrow_vault.to_account_info(),
                },
                signer,
            ),
            fee,
        )?;
        Ok(())
    }

    // ─── Cancel Order ────────────────────────────────────────
    pub fn cancel_order(ctx: Context<CancelOrder>) -> Result<()> {
        let order = &mut ctx.accounts.order;
        require!(order.buyer == ctx.accounts.buyer.key(), ErrorCode::Unauthorized);
        require!(order.status == OrderStatus::Pending,    ErrorCode::InvalidOrderStatus);
        order.status = OrderStatus::Cancelled;

        let amount = order.amount;
        let seeds  = &[b"escrow_vault".as_ref(), &[ctx.bumps.escrow_vault]];
        let signer = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.escrow_vault.to_account_info(),
                    to:        ctx.accounts.buyer_token.to_account_info(),
                    authority: ctx.accounts.escrow_vault.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;
        Ok(())
    }

    // ─── Raise Dispute ───────────────────────────────────────
    pub fn raise_dispute(ctx: Context<DisputeOrder>) -> Result<()> {
        let clock    = Clock::get()?;
        let order    = &mut ctx.accounts.order;
        let platform = &ctx.accounts.platform;

        require!(order.buyer == ctx.accounts.buyer.key(), ErrorCode::Unauthorized);
        require!(
            order.status == OrderStatus::Pending || order.status == OrderStatus::Delivered,
            ErrorCode::InvalidOrderStatus
        );
        require!(
            clock.unix_timestamp <= order.created_at + platform.refund_window,
            ErrorCode::RefundWindowExpired
        );
        order.status = OrderStatus::Disputed;
        emit!(OrderDisputed { order_id: order.order_id, buyer: ctx.accounts.buyer.key() });
        Ok(())
    }

    // ─── Resolve Dispute ─────────────────────────────────────
    pub fn resolve_dispute(ctx: Context<ResolveDispute>, favor_buyer: bool) -> Result<()> {
        require!(
            ctx.accounts.role_account.active && ctx.accounts.role_account.role == RoleType::Admin,
            ErrorCode::NotAdmin
        );
        let order = &mut ctx.accounts.order;
        require!(order.status == OrderStatus::Disputed, ErrorCode::InvalidOrderStatus);

        let seeds  = &[b"escrow_vault".as_ref(), &[ctx.bumps.escrow_vault]];
        let signer = &[&seeds[..]];

        if favor_buyer {
            order.status = OrderStatus::Refunded;
            let amount   = order.amount;
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from:      ctx.accounts.escrow_vault.to_account_info(),
                        to:        ctx.accounts.buyer_token.to_account_info(),
                        authority: ctx.accounts.escrow_vault.to_account_info(),
                    },
                    signer,
                ),
                amount,
            )?;
        } else {
            order.status        = OrderStatus::Completed;
            let merchant_amount = order.merchant_amount;
            let fee             = order.fee;
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from:      ctx.accounts.escrow_vault.to_account_info(),
                        to:        ctx.accounts.merchant_token.to_account_info(),
                        authority: ctx.accounts.escrow_vault.to_account_info(),
                    },
                    signer,
                ),
                merchant_amount,
            )?;
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from:      ctx.accounts.escrow_vault.to_account_info(),
                        to:        ctx.accounts.treasury_token.to_account_info(),
                        authority: ctx.accounts.escrow_vault.to_account_info(),
                    },
                    signer,
                ),
                fee,
            )?;
        }
        emit!(DisputeResolved { order_id: order.order_id, favor_buyer });
        Ok(())
    }

    // ─── Risk Score (BOT only) ───────────────────────────────
    pub fn set_risk_score(ctx: Context<BotAction>, score: u8) -> Result<()> {
        require!(
            ctx.accounts.role_account.active && ctx.accounts.role_account.role == RoleType::Bot,
            ErrorCode::NotBot
        );
        require!(score <= 100, ErrorCode::InvalidScore);
        ctx.accounts.order.risk_score = score;
        emit!(RiskScoreSet { order_id: ctx.accounts.order.order_id, score });
        Ok(())
    }

    pub fn get_order_risk_score(ctx: Context<ViewOrder>) -> Result<u8> {
        Ok(ctx.accounts.order.risk_score)
    }

    // ─── Treasury Withdrawal ─────────────────────────────────
    pub fn withdraw_treasury(ctx: Context<WithdrawTreasury>, amount: u64) -> Result<()> {
        require!(
            ctx.accounts.platform.admin == ctx.accounts.authority.key(),
            ErrorCode::Unauthorized
        );
        let seeds  = &[b"escrow_vault".as_ref(), &[ctx.bumps.escrow_vault]];
        let signer = &[&seeds[..]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.escrow_vault.to_account_info(),
                    to:        ctx.accounts.admin_token.to_account_info(),
                    authority: ctx.accounts.escrow_vault.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;
        Ok(())
    }
}

// ─── Account Structs ─────────────────────────────────────────

#[account]
pub struct Platform {
    pub admin:              Pubkey,
    pub order_count:        u64,
    pub fee_bps:            u16,
    pub refund_window:      i64,
    pub admin_threshold:    u64,
    pub daily_spend_limit:  u64,
    pub treasury:           Pubkey,
}

#[account]
pub struct Order {
    pub order_id:             u64,
    pub buyer:                Pubkey,
    pub merchant:             Pubkey,
    pub amount:               u64,
    pub fee:                  u64,
    pub merchant_amount:      u64,
    pub product_id:           u64,
    pub product_type:         ProductType,
    pub status:               OrderStatus,
    pub needs_escrow:         bool,
    pub created_at:           i64,
    pub risk_score:           u8,
    pub content_hash:         [u8; 32],
    pub is_verified_merchant: bool,
}

#[account]
pub struct RoleAccount {
    pub wallet: Pubkey,
    pub role:   RoleType,
    pub active: bool,
}

#[account]
pub struct DailySpend {
    pub wallet: Pubkey,
    pub day:    i64,
    pub spent:  u64,
}

// ─── Enums ───────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum OrderStatus {
    Pending, Delivered, Completed, Cancelled, Disputed, Refunded,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum ProductType { Digital }

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum RoleType { Admin, Bot, Merchant }

// ─── Contexts ────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init, payer = authority,
        space = 8 + 32 + 8 + 2 + 8 + 8 + 8 + 32,
        seeds = [b"platform"], bump
    )]
    pub platform:       Account<'info, Platform>,
    /// CHECK: treasury
    pub treasury:       AccountInfo<'info>,
    #[account(mut)]
    pub authority:      Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init, payer = authority,
        seeds = [b"escrow_vault"], bump,
        token::mint      = usdc_mint,
        token::authority = escrow_vault,
    )]
    pub escrow_vault:   Account<'info, TokenAccount>,
    /// CHECK: USDC mint
    pub usdc_mint:      AccountInfo<'info>,
    #[account(mut)]
    pub authority:      Signer<'info>,
    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent:           Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ManageRole<'info> {
    #[account(seeds = [b"platform"], bump)]
    pub platform: Account<'info, Platform>,
    #[account(
        init_if_needed, payer = authority,
        space = 8 + 32 + 1 + 1,
        seeds = [b"role", target.key().as_ref()], bump
    )]
    pub role_account:   Account<'info, RoleAccount>,
    /// CHECK: target
    pub target:         AccountInfo<'info>,
    #[account(mut)]
    pub authority:      Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(product_id: u64, merchant_wallet: Pubkey, amount: u64)]
pub struct CreateOrder<'info> {
    #[account(mut, seeds = [b"platform"], bump)]
    pub platform: Account<'info, Platform>,
    #[account(
        init, payer = buyer,
        space = 8 + 8 + 32 + 32 + 8 + 8 + 8 + 8 + 1 + 1 + 1 + 8 + 1 + 32 + 1,
        seeds = [b"order", platform.order_count.to_le_bytes().as_ref()], bump
    )]
    pub order: Account<'info, Order>,
    #[account(
        init_if_needed, payer = buyer,
        space = 8 + 32 + 8 + 8,
        seeds = [b"daily", buyer.key().as_ref()], bump
    )]
    pub daily_spend:    Account<'info, DailySpend>,
    #[account(
        mut,
        seeds = [b"escrow_vault"], bump,
        token::mint      = usdc_mint,
        token::authority = escrow_vault,
    )]
    pub escrow_vault:   Account<'info, TokenAccount>,
    #[account(mut)]
    pub buyer_token:    Account<'info, TokenAccount>,
    /// CHECK: USDC mint
    pub usdc_mint:      AccountInfo<'info>,
    #[account(mut)]
    pub buyer:          Signer<'info>,
    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MerchantAction<'info> {
    #[account(seeds = [b"role", authority.key().as_ref()], bump)]
    pub role_account: Account<'info, RoleAccount>,
    #[account(mut, seeds = [b"order", order.order_id.to_le_bytes().as_ref()], bump)]
    pub order:        Account<'info, Order>,
    pub authority:    Signer<'info>,
}

#[derive(Accounts)]
pub struct CompleteOrder<'info> {
    #[account(mut, seeds = [b"order", order.order_id.to_le_bytes().as_ref()], bump)]
    pub order:          Account<'info, Order>,
    #[account(mut, seeds = [b"escrow_vault"], bump)]
    pub escrow_vault:   Account<'info, TokenAccount>,
    #[account(mut)]
    pub merchant_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub treasury_token: Account<'info, TokenAccount>,
    pub token_program:  Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AdminAction<'info> {
    #[account(seeds = [b"role", authority.key().as_ref()], bump)]
    pub role_account:   Account<'info, RoleAccount>,
    #[account(mut, seeds = [b"order", order.order_id.to_le_bytes().as_ref()], bump)]
    pub order:          Account<'info, Order>,
    #[account(mut, seeds = [b"escrow_vault"], bump)]
    pub escrow_vault:   Account<'info, TokenAccount>,
    #[account(mut)]
    pub merchant_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub treasury_token: Account<'info, TokenAccount>,
    pub authority:      Signer<'info>,
    pub token_program:  Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelOrder<'info> {
    #[account(mut, seeds = [b"order", order.order_id.to_le_bytes().as_ref()], bump)]
    pub order:         Account<'info, Order>,
    #[account(mut, seeds = [b"escrow_vault"], bump)]
    pub escrow_vault:  Account<'info, TokenAccount>,
    #[account(mut)]
    pub buyer_token:   Account<'info, TokenAccount>,
    pub buyer:         Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct DisputeOrder<'info> {
    #[account(seeds = [b"platform"], bump)]
    pub platform: Account<'info, Platform>,
    #[account(mut, seeds = [b"order", order.order_id.to_le_bytes().as_ref()], bump)]
    pub order:    Account<'info, Order>,
    pub buyer:    Signer<'info>,
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(seeds = [b"role", authority.key().as_ref()], bump)]
    pub role_account:   Account<'info, RoleAccount>,
    #[account(mut, seeds = [b"order", order.order_id.to_le_bytes().as_ref()], bump)]
    pub order:          Account<'info, Order>,
    #[account(mut, seeds = [b"escrow_vault"], bump)]
    pub escrow_vault:   Account<'info, TokenAccount>,
    #[account(mut)]
    pub buyer_token:    Account<'info, TokenAccount>,
    #[account(mut)]
    pub merchant_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub treasury_token: Account<'info, TokenAccount>,
    pub authority:      Signer<'info>,
    pub token_program:  Program<'info, Token>,
}

#[derive(Accounts)]
pub struct BotAction<'info> {
    #[account(seeds = [b"role", authority.key().as_ref()], bump)]
    pub role_account: Account<'info, RoleAccount>,
    #[account(mut, seeds = [b"order", order.order_id.to_le_bytes().as_ref()], bump)]
    pub order:        Account<'info, Order>,
    pub authority:    Signer<'info>,
}

#[derive(Accounts)]
pub struct ViewOrder<'info> {
    #[account(seeds = [b"order", order.order_id.to_le_bytes().as_ref()], bump)]
    pub order: Account<'info, Order>,
}

#[derive(Accounts)]
pub struct WithdrawTreasury<'info> {
    #[account(seeds = [b"platform"], bump)]
    pub platform:      Account<'info, Platform>,
    #[account(mut, seeds = [b"escrow_vault"], bump)]
    pub escrow_vault:  Account<'info, TokenAccount>,
    #[account(mut)]
    pub admin_token:   Account<'info, TokenAccount>,
    pub authority:     Signer<'info>,
    pub token_program: Program<'info, Token>,
}

// ─── Events ──────────────────────────────────────────────────

#[event]
pub struct OrderCreated {
    pub order_id: u64,
    pub buyer:    Pubkey,
    pub merchant: Pubkey,
    pub amount:   u64,
}
#[event]
pub struct OrderCompleted  { pub order_id: u64 }
#[event]
pub struct OrderDisputed   { pub order_id: u64, pub buyer: Pubkey }
#[event]
pub struct DisputeResolved { pub order_id: u64, pub favor_buyer: bool }
#[event]
pub struct RiskScoreSet    { pub order_id: u64, pub score: u8 }

// ─── Errors ──────────────────────────────────────────────────

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized")]            Unauthorized,
    #[msg("Not an admin")]            NotAdmin,
    #[msg("Not a bot")]               NotBot,
    #[msg("Not a merchant")]          NotMerchant,
    #[msg("Invalid order status")]    InvalidOrderStatus,
    #[msg("Requires admin approval")] RequiresAdminApproval,
    #[msg("Refund window expired")]   RefundWindowExpired,
    #[msg("Daily limit exceeded")]    DailyLimitExceeded,
    #[msg("Not a digital product")]   NotDigital,
    #[msg("Score must be 0-100")]     InvalidScore,
}