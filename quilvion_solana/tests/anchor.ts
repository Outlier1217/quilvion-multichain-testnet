import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import assert from "assert";
import * as web3 from "@solana/web3.js";
import type { CommerceCore } from "../target/types/commerce_core";

describe("CommerceCore - Full Test Suite", () => {
  // Configure the client to use the local cluster
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.CommerceCore as anchor.Program<CommerceCore>;
  

  const TOKEN_PROGRAM_ID = new web3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

  let platformPda:         web3.PublicKey;
  let escrowVaultPda:      web3.PublicKey;
  let usdcMint:            web3.PublicKey;
  let buyerTokenAccount:   web3.PublicKey;
  let merchantTokenAccount:web3.PublicKey;
  let treasuryTokenAccount:web3.PublicKey;
  let merchantWallet:      web3.Keypair;
  let treasuryWallet:      web3.Keypair;
  let botWallet:           web3.Keypair;
  let adminRolePda:        web3.PublicKey;
  let botRolePda:          web3.PublicKey;
  let merchantRolePda:     web3.PublicKey;
  let orderPda:            web3.PublicKey;
  let dailySpendPda:       web3.PublicKey;

  // ─── Helper: Raw token account banao (ATA nahi, simple keypair-based) ───
  async function createTokenAccount(
    mint: web3.PublicKey,
    owner: web3.PublicKey,
    payer: web3.Keypair
  ): Promise<web3.PublicKey> {
    const tokenAccountKp = new web3.Keypair();
    const rent = await program.provider.connection.getMinimumBalanceForRentExemption(165);

    // InitializeAccount instruction data = [1] (opcode 1)
    const initData = Buffer.alloc(1);
    initData.writeUInt8(1, 0);

    const tx = new web3.Transaction().add(
      // Step 1: Account create karo
      web3.SystemProgram.createAccount({
        fromPubkey:       payer.publicKey,
        newAccountPubkey: tokenAccountKp.publicKey,
        space:            165,
        lamports:         rent,
        programId:        TOKEN_PROGRAM_ID,
      }),
      // Step 2: Token account initialize karo
      new web3.TransactionInstruction({
        programId: TOKEN_PROGRAM_ID,
        keys: [
          { pubkey: tokenAccountKp.publicKey, isSigner: false, isWritable: true  },
          { pubkey: mint,                     isSigner: false, isWritable: false },
          { pubkey: owner,                    isSigner: false, isWritable: false },
          { pubkey: web3.SYSVAR_RENT_PUBKEY,  isSigner: false, isWritable: false },
        ],
        data: initData,
      })
    );

    await web3.sendAndConfirmTransaction(program.provider.connection, tx, [payer, tokenAccountKp]);
    return tokenAccountKp.publicKey;
  }

  // ─── Helper: Mint tokens ─────────────────────────────────────
  async function mintTokens(
    mint: web3.PublicKey,
    destination: web3.PublicKey,
    authority: web3.Keypair,
    amount: bigint
  ): Promise<void> {
    const data = Buffer.alloc(9);
    data.writeUInt8(7, 0); // MintTo opcode
    data.writeBigUInt64LE(amount, 1);

    const tx = new web3.Transaction().add(
      new web3.TransactionInstruction({
        programId: TOKEN_PROGRAM_ID,
        keys: [
          { pubkey: mint,               isSigner: false, isWritable: true  },
          { pubkey: destination,        isSigner: false, isWritable: true  },
          { pubkey: authority.publicKey, isSigner: true, isWritable: false },
        ],
        data,
      })
    );
    await web3.sendAndConfirmTransaction(program.provider.connection, tx, [authority]);
  }

  // ─── Helper: USDC Mint banao ─────────────────────────────────
  async function createUsdcMint(authority: web3.Keypair): Promise<web3.PublicKey> {
    const mintKp  = new web3.Keypair();
    const rent    = await program.provider.connection.getMinimumBalanceForRentExemption(82);

    // InitializeMint layout (82 bytes account):
    // [0] = instruction (0 = InitializeMint)
    // [1] = decimals (6)
    // [2..33] = mint authority pubkey
    // [34] = freeze authority option (1 = Some)
    // [35..66] = freeze authority pubkey
    const initData = Buffer.alloc(67);
    initData.writeUInt8(0, 0); // InitializeMint
    initData.writeUInt8(6, 1); // decimals = 6
    authority.publicKey.toBuffer().copy(initData, 2);
    initData.writeUInt8(1, 34);
    authority.publicKey.toBuffer().copy(initData, 35);

    const tx = new web3.Transaction().add(
      web3.SystemProgram.createAccount({
        fromPubkey:       authority.publicKey,
        newAccountPubkey: mintKp.publicKey,
        space:            82,
        lamports:         rent,
        programId:        TOKEN_PROGRAM_ID,
      }),
      new web3.TransactionInstruction({
        programId: TOKEN_PROGRAM_ID,
        keys: [
          { pubkey: mintKp.publicKey,       isSigner: false, isWritable: true  },
          { pubkey: web3.SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        ],
        data: initData,
      })
    );
    await web3.sendAndConfirmTransaction(program.provider.connection, tx, [authority, mintKp]);
    return mintKp.publicKey;
  }

  // ════════════════════════════════════════════════════════════
  before(async () => {
    merchantWallet = new web3.Keypair();
    treasuryWallet = new web3.Keypair();
    botWallet      = new web3.Keypair();

    // Airdrop SOL
    const airdrop = async (pk: web3.PublicKey, sol: number) => {
      const sig = await program.provider.connection.requestAirdrop(pk, sol * web3.LAMPORTS_PER_SOL);
      await program.provider.connection.confirmTransaction(sig);
    };
    await airdrop(program.provider.publicKey,     10);
    await airdrop(merchantWallet.publicKey, 2);
    await airdrop(treasuryWallet.publicKey, 1);
    await airdrop(botWallet.publicKey,      1);
    console.log("✅ SOL airdropped");

    // USDC Mint
    usdcMint = await createUsdcMint(program.provider.wallet.payer);
    console.log("✅ USDC Mint:", usdcMint.toString());

    // PDAs
    [platformPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("platform")], program.programId
    );
    [escrowVaultPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_vault")], program.programId
    );
    [adminRolePda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("role"), program.provider.publicKey.toBuffer()], program.programId
    );
    [botRolePda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("role"), botWallet.publicKey.toBuffer()], program.programId
    );
    [merchantRolePda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("role"), merchantWallet.publicKey.toBuffer()], program.programId
    );
    [dailySpendPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("daily"), program.provider.publicKey.toBuffer()], program.programId
    );
    console.log("✅ PDAs computed");
    console.log("   Platform    :", platformPda.toString());
    console.log("   EscrowVault :", escrowVaultPda.toString());

    // Token accounts (raw keypair-based, no ATA program needed)
    buyerTokenAccount    = await createTokenAccount(usdcMint, program.provider.publicKey,     program.provider.wallet.payer);
    merchantTokenAccount = await createTokenAccount(usdcMint, merchantWallet.publicKey, program.provider.wallet.payer);
    treasuryTokenAccount = await createTokenAccount(usdcMint, treasuryWallet.publicKey, program.provider.wallet.payer);
    console.log("✅ Token accounts created");
    console.log("   Buyer    :", buyerTokenAccount.toString());
    console.log("   Merchant :", merchantTokenAccount.toString());
    console.log("   Treasury :", treasuryTokenAccount.toString());

    // Mint 10,000 USDC to buyer
    await mintTokens(usdcMint, buyerTokenAccount, program.provider.wallet.payer, 10_000_000_000n);
    const bal = await program.provider.connection.getTokenAccountBalance(buyerTokenAccount);
    console.log("✅ Buyer balance:", bal.value.uiAmount, "USDC");
  });

  // ─── TEST 1 ──────────────────────────────────────────────────
// ─── TEST 1 ──────────────────────────────────────────────────
it("1. Initialize platform", async () => {
  // Check karo ki platform already exist karta hai
  const existing = await program.provider.connection.getAccountInfo(platformPda);
  
  if (existing) {
    // Already initialized hai — bas fetch karke verify karo
    const p = await program.account.platform.fetch(platformPda);
    console.log("✅ Platform already initialized (skipping init)");
    console.log("   Admin        :", p.admin.toString());
    console.log("   Fee BPS      :", p.feeBps);
    console.log("   Order Count  :", p.orderCount.toString());
    assert(p.admin.equals(program.provider.publicKey));
    assert(p.feeBps === 250);
  } else {
    // Fresh deploy — initialize karo
    const tx = await program.methods
      .initialize()
      .accounts({
        platform:      platformPda,
        treasury:      treasuryWallet.publicKey,
        authority:     program.provider.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();
    await program.provider.connection.confirmTransaction(tx);

    const p = await program.account.platform.fetch(platformPda);
    console.log("✅ Platform initialized fresh");
    console.log("   Admin        :", p.admin.toString());
    console.log("   Fee BPS      :", p.feeBps);
    console.log("   Order Count  :", p.orderCount.toString());
    assert(p.admin.equals(program.provider.publicKey));
    assert(p.feeBps === 250);
    assert(p.orderCount.toNumber() === 0);
  }
});
  // ─── TEST 1.5: Initialize Escrow Vault ──────────────────────
it("1.5. Initialize escrow vault (PDA token account)", async () => {
  const tx = await program.methods
    .initializeVault()
    .accounts({
      escrowVault:   escrowVaultPda,
      usdcMint:      usdcMint,
      authority:     program.provider.publicKey,
      tokenProgram:  TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
      rent:          web3.SYSVAR_RENT_PUBKEY,
    })
    .rpc();
  await program.provider.connection.confirmTransaction(tx);

  // Verify vault exists
  const vaultBal = await program.provider.connection.getTokenAccountBalance(escrowVaultPda);
  console.log("✅ Escrow vault initialized");
  console.log("   Vault balance:", vaultBal.value.uiAmount, "USDC");
  assert(vaultBal.value.uiAmount === 0);
});

  // ─── TEST 2,3,4: Roles ───────────────────────────────────────
  it("2. Grant ADMIN role", async () => {
    const tx = await program.methods
      .grantRole({ admin: {} })
      .accounts({
        platform: platformPda, roleAccount: adminRolePda,
        target: program.provider.publicKey, authority: program.provider.publicKey,
        systemProgram: web3.SystemProgram.programId,
      }).rpc();
    await program.provider.connection.confirmTransaction(tx);
    const r = await program.account.roleAccount.fetch(adminRolePda);
    console.log("✅ Admin role active:", r.active);
    assert(r.active === true);
  });

  it("3. Grant BOT role", async () => {
    const tx = await program.methods
      .grantRole({ bot: {} })
      .accounts({
        platform: platformPda, roleAccount: botRolePda,
        target: botWallet.publicKey, authority: program.provider.publicKey,
        systemProgram: web3.SystemProgram.programId,
      }).rpc();
    await program.provider.connection.confirmTransaction(tx);
    const r = await program.account.roleAccount.fetch(botRolePda);
    console.log("✅ BOT role active:", r.active);
    assert(r.active === true);
  });

  it("4. Grant MERCHANT role", async () => {
    const tx = await program.methods
      .grantRole({ merchant: {} })
      .accounts({
        platform: platformPda, roleAccount: merchantRolePda,
        target: merchantWallet.publicKey, authority: program.provider.publicKey,
        systemProgram: web3.SystemProgram.programId,
      }).rpc();
    await program.provider.connection.confirmTransaction(tx);
    const r = await program.account.roleAccount.fetch(merchantRolePda);
    console.log("✅ Merchant role active:", r.active);
    assert(r.active === true);
  });

  // ─── TEST 5: Create Order ────────────────────────────────────
  it("5. Create order — 100 USDC, no escrow", async () => {
    [orderPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("order"), new BN(0).toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    const tx = await program.methods
      .createOrder(new BN(1), merchantWallet.publicKey, new BN(100_000_000), true)
      .accounts({
        platform:      platformPda,
        order:         orderPda,
        dailySpend:    dailySpendPda,
        escrowVault:   escrowVaultPda,
        buyerToken:    buyerTokenAccount,
        usdcMint:      usdcMint,
        buyer:         program.provider.publicKey,
        tokenProgram:  TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
      }).rpc();
    await program.provider.connection.confirmTransaction(tx);

    const o = await program.account.order.fetch(orderPda);
    console.log("✅ Order created");
    console.log("   Amount      :", o.amount.toNumber() / 1e6, "USDC");
    console.log("   Fee         :", o.fee.toNumber() / 1e6, "USDC");
    console.log("   Merch Amt   :", o.merchantAmount.toNumber() / 1e6, "USDC");
    console.log("   Needs Escrow:", o.needsEscrow);
    console.log("   Status      :", JSON.stringify(o.status));

    assert(o.fee.toNumber() === 2_500_000);
    assert(o.merchantAmount.toNumber() === 97_500_000);
    assert(o.needsEscrow === false);
  });

  // ─── TEST 6: Risk Score ──────────────────────────────────────
  it("6. BOT sets risk score = 42", async () => {
    const tx = await program.methods
      .setRiskScore(42)
      .accounts({ roleAccount: botRolePda, order: orderPda, authority: botWallet.publicKey })
      .signers([botWallet])
      .rpc();
    await program.provider.connection.confirmTransaction(tx);

    const o = await program.account.order.fetch(orderPda);
    console.log("✅ Risk score:", o.riskScore);
    assert(o.riskScore === 42);
  });

  // ─── TEST 7: Deliver ─────────────────────────────────────────
  it("7. Merchant delivers digital product", async () => {
    const hash = Array.from(Buffer.alloc(32, 0xcd));
    const tx = await program.methods
      .deliverDigitalProduct(hash)
      .accounts({ roleAccount: merchantRolePda, order: orderPda, authority: merchantWallet.publicKey })
      .signers([merchantWallet])
      .rpc();
    await program.provider.connection.confirmTransaction(tx);

    const o = await program.account.order.fetch(orderPda);
    console.log("✅ Delivered, status:", JSON.stringify(o.status));
    assert(JSON.stringify(o.status) === JSON.stringify({ delivered: {} }));
  });

  // ─── TEST 8: Complete ────────────────────────────────────────
  it("8. Complete order → merchant gets 97.5, treasury gets 2.5", async () => {
    const tx = await program.methods
      .completeOrder()
      .accounts({
        order: orderPda, escrowVault: escrowVaultPda,
        merchantToken: merchantTokenAccount,
        treasuryToken: treasuryTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      }).rpc();
    await program.provider.connection.confirmTransaction(tx);

    const mBal = await program.provider.connection.getTokenAccountBalance(merchantTokenAccount);
    const tBal = await program.provider.connection.getTokenAccountBalance(treasuryTokenAccount);
    console.log("✅ Order completed");
    console.log("   Merchant :", mBal.value.uiAmount, "USDC");
    console.log("   Treasury :", tBal.value.uiAmount, "USDC");

    assert(Number(mBal.value.amount) === 97_500_000);
    assert(Number(tBal.value.amount) ===  2_500_000);
  });

  // ─── TEST 9+10: Dispute ──────────────────────────────────────
  it("9. Order #2 → raise dispute", async () => {
    [orderPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("order"), new BN(1).toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    await program.methods
      .createOrder(new BN(2), merchantWallet.publicKey, new BN(200_000_000), true)
      .accounts({
        platform: platformPda, order: orderPda, dailySpend: dailySpendPda,
        escrowVault: escrowVaultPda, buyerToken: buyerTokenAccount,
        usdcMint, buyer: program.provider.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID, systemProgram: web3.SystemProgram.programId,
      }).rpc();

    const tx = await program.methods.raiseDispute()
      .accounts({ platform: platformPda, order: orderPda, buyer: program.provider.publicKey })
      .rpc();
    await program.provider.connection.confirmTransaction(tx);

    const o = await program.account.order.fetch(orderPda);
    console.log("✅ Dispute raised:", JSON.stringify(o.status));
    assert(JSON.stringify(o.status) === JSON.stringify({ disputed: {} }));
  });

  it("10. Admin resolves → buyer refunded 200 USDC", async () => {
    const before = await program.provider.connection.getTokenAccountBalance(buyerTokenAccount);
    const tx = await program.methods
      .resolveDispute(true)
      .accounts({
        roleAccount: adminRolePda, order: orderPda, escrowVault: escrowVaultPda,
        buyerToken: buyerTokenAccount, merchantToken: merchantTokenAccount,
        treasuryToken: treasuryTokenAccount, authority: program.provider.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      }).rpc();
    await program.provider.connection.confirmTransaction(tx);

    const after    = await program.provider.connection.getTokenAccountBalance(buyerTokenAccount);
    const refunded = Number(after.value.amount) - Number(before.value.amount);
    console.log("✅ Buyer refunded:", refunded / 1e6, "USDC");
    assert(refunded === 200_000_000);
  });

  // ─── TEST 11: Cancel ─────────────────────────────────────────
  it("11. Order #3 → cancel → refund", async () => {
    [orderPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("order"), new BN(2).toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    await program.methods
      .createOrder(new BN(3), merchantWallet.publicKey, new BN(50_000_000), true)
      .accounts({
        platform: platformPda, order: orderPda, dailySpend: dailySpendPda,
        escrowVault: escrowVaultPda, buyerToken: buyerTokenAccount,
        usdcMint, buyer: program.provider.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID, systemProgram: web3.SystemProgram.programId,
      }).rpc();

    const tx = await program.methods.cancelOrder()
      .accounts({
        order: orderPda, escrowVault: escrowVaultPda,
        buyerToken: buyerTokenAccount, buyer: program.provider.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      }).rpc();
    await program.provider.connection.confirmTransaction(tx);

    const o = await program.account.order.fetch(orderPda);
    console.log("✅ Cancelled:", JSON.stringify(o.status));
    assert(JSON.stringify(o.status) === JSON.stringify({ cancelled: {} }));
  });

  // ─── TEST 12: Security ───────────────────────────────────────
  it("12. Unauthorized risk score → blocked", async () => {
    const fake = new web3.Keypair();
    await program.provider.connection.confirmTransaction(
      await program.provider.connection.requestAirdrop(fake.publicKey, web3.LAMPORTS_PER_SOL)
    );
    const [fakeRole] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("role"), fake.publicKey.toBuffer()], program.programId
    );
    const [o0] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("order"), new BN(0).toArrayLike(Buffer, "le", 8)], program.programId
    );
    try {
      await program.methods.setRiskScore(99)
        .accounts({ roleAccount: fakeRole, order: o0, authority: fake.publicKey })
        .signers([fake]).rpc();
      assert(false, "Should have failed!");
    } catch (_) {
      console.log("✅ Unauthorized access blocked correctly");
    }
  });

  // ─── FINAL SUMMARY ───────────────────────────────────────────
  it("13. Final summary", async () => {
    const b = await program.provider.connection.getTokenAccountBalance(buyerTokenAccount);
    const m = await program.provider.connection.getTokenAccountBalance(merchantTokenAccount);
    const t = await program.provider.connection.getTokenAccountBalance(treasuryTokenAccount);
    const p = await program.account.platform.fetch(platformPda);

    console.log("\n══════════════════════════════");
    console.log("  FINAL BALANCES");
    console.log("══════════════════════════════");
    console.log("  Buyer    :", b.value.uiAmount, "USDC");
    console.log("  Merchant :", m.value.uiAmount, "USDC");
    console.log("  Treasury :", t.value.uiAmount, "USDC");
    console.log("  Orders   :", p.orderCount.toString());
    console.log("══════════════════════════════");
    // Buyer started 10000, spent 100+200+50, got back 200+50 = net spent 100
    // So buyer = 9900, merchant = 97.5, treasury = 2.5
    assert(Number(b.value.amount) === 9_900_000_000);
    assert(Number(m.value.amount) ===    97_500_000);
    assert(Number(t.value.amount) ===     2_500_000);
  });
});