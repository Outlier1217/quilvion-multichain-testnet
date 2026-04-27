import BN from "bn.js";
import assert from "assert";
import * as web3 from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import type { CommerceCore } from "../target/types/commerce_core";
describe("commerce_core", () => {
  // Configure the client to use the local cluster
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.CommerceCore as anchor.Program<CommerceCore>;
  

  function strBytes(s) {
    return anchor.utils.bytes.utf8.encode(s);
  }

  const merchantSeed = "test-merchant-v1";
  const merchantSecret = new Uint8Array(32).fill(0);
  for (let i = 0; i < merchantSeed.length; i++) {
    merchantSecret[i] = merchantSeed.charCodeAt(i);
  }
  const merchantKp = web3.Keypair.fromSeed(merchantSecret);
  const botKp      = new web3.Keypair();
  const treasuryKp = new web3.Keypair();
  const product_id = new BN(9999);

  const [configPda] = web3.PublicKey.findProgramAddressSync(
    [strBytes("platform_config")],
    program.programId
  );
  const [buyerRepPda] = web3.PublicKey.findProgramAddressSync(
    [strBytes("buyer_rep"), program.provider.publicKey.toBytes()],
    program.programId
  );
  const [merchantRepPda] = web3.PublicKey.findProgramAddressSync(
    [strBytes("merchant_rep"), merchantKp.publicKey.toBytes()],
    program.programId
  );

  // Proper confirm helper
  async function sendAndConfirm(tx) {
    const { blockhash, lastValidBlockHeight } =
      await program.provider.connection.getLatestBlockhash("confirmed");
    await program.provider.connection.confirmTransaction(
      { signature: tx, blockhash, lastValidBlockHeight },
      "confirmed"
    );
    return tx;
  }

  async function airdropAndWait(pubkey, lamports) {
    const bal = await program.provider.connection.getBalance(pubkey, "confirmed");
    if (bal >= lamports) return;
    const sig = await program.provider.connection.requestAirdrop(pubkey, lamports);
    await sendAndConfirm(sig);
    console.log(`Airdrop done: ${pubkey.toString().slice(0,8)}...`);
  }

  // ── 1. initialize_config ─────────────────────────────────────────
  it("initialize_config", async () => {
    let config;
    try {
      config = await program.account.platformConfig.fetch(configPda);
      console.log("Config exists — fee bps:", config.platformFeeBps);
    } catch {
      const tx = await program.methods
        .initializeConfig(
          new BN(1_000_000_000),
          new BN(500_000_000),
          250,
          new BN(86400)
        )
        .accounts({
          admin:         program.provider.publicKey,
          bot:           botKp.publicKey,
          treasury:      treasuryKp.publicKey,
          config:        configPda,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();
      await sendAndConfirm(tx);
      config = await program.account.platformConfig.fetch(configPda);
    }
    assert.ok(config.admin.equals(program.provider.publicKey));
    console.log("Config ready ✓");
  });

  // ── 2. update_config ─────────────────────────────────────────────
  it("update_config", async () => {
    const tx = await program.methods
      .updateConfig(
        new BN(2_000_000_000),
        new BN(500_000_000),
        300,
        new BN(172800)
      )
      .accounts({
        admin:  program.provider.publicKey,
        config: configPda,
      })
      .rpc();
    await sendAndConfirm(tx);

    const config = await program.account.platformConfig.fetch(configPda);
    assert.equal(config.platformFeeBps, 300);
    console.log("Config updated ✓ fee:", config.platformFeeBps);
  });

  // ── 3. initialize_buyer_rep ──────────────────────────────────────
  it("initialize_buyer_rep", async () => {
    let rep;
    try {
      rep = await program.account.buyerReputation.fetch(buyerRepPda);
      console.log("Buyer rep exists — XP:", rep.totalXp.toNumber(), "Tier:", rep.currentTier);
    } catch {
      const tx = await program.methods
        .initializeBuyerRep()
        .accounts({
          buyer:         program.provider.publicKey,
          buyerRep:      buyerRepPda,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();
      await sendAndConfirm(tx);
      rep = await program.account.buyerReputation.fetch(buyerRepPda);
    }
    assert.ok(rep.wallet.equals(program.provider.publicKey));
    console.log("Buyer rep ready ✓");
  });

  // ── 4. initialize_merchant_rep ───────────────────────────────────
  it("initialize_merchant_rep", async () => {
    await airdropAndWait(merchantKp.publicKey, web3.LAMPORTS_PER_SOL);

    let rep;
    try {
      rep = await program.account.merchantReputation.fetch(merchantRepPda);
      console.log("Merchant rep exists — score:", rep.score.toNumber());
    } catch {
      const tx = await program.methods
        .initializeMerchantRep()
        .accounts({
          merchant:      merchantKp.publicKey,
          merchantRep:   merchantRepPda,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([merchantKp])
        .rpc();
      await sendAndConfirm(tx);
      rep = await program.account.merchantReputation.fetch(merchantRepPda);
    }
    assert.ok(rep.score.toNumber() >= 500);
    console.log("Merchant rep ready ✓ score:", rep.score.toNumber());
  });

  // ── 5. award_xp ──────────────────────────────────────────────────
  it("award_xp", async () => {
    const repBefore = await program.account.buyerReputation.fetch(buyerRepPda);
    const xpBefore  = repBefore.totalXp.toNumber();
    const xpToAdd   = 50;
    console.log("XP before:", xpBefore);

    const tx = await program.methods
      .awardXp(product_id, new BN(xpToAdd))
      .accounts({
        admin:       program.provider.publicKey,
        config:      configPda,
        buyerWallet: program.provider.publicKey,
        buyerRep:    buyerRepPda,
      })
      .rpc();

    // Confirm karo pehle, phir fetch karo
    await sendAndConfirm(tx);
    console.log("award_xp tx confirmed:", tx);

    const repAfter = await program.account.buyerReputation.fetch(buyerRepPda);
    console.log("XP after:", repAfter.totalXp.toNumber());

    assert.equal(
      repAfter.totalXp.toNumber(),
      xpBefore + xpToAdd,
      `Expected ${xpBefore + xpToAdd}, got ${repAfter.totalXp.toNumber()}`
    );
    console.log("XP incremented ✓ Total:", repAfter.totalXp.toNumber());
  });

  // ── 6. mint_tier_badge ───────────────────────────────────────────
  it("mint_tier_badge", async () => {
    const rep  = await program.account.buyerReputation.fetch(buyerRepPda);
    const tier = rep.currentTier;
    console.log("Current tier:", tier, "Badges:", rep.hasBadge);

    if (tier === 0) {
      console.log("Bronze — badge nahi milti, skip");
      return;
    }
    if (rep.hasBadge[tier]) {
      console.log(`Tier ${tier} badge already minted ✓`);
      return;
    }

    const tx = await program.methods
      .mintTierBadge()
      .accounts({
        buyer:    program.provider.publicKey,
        buyerRep: buyerRepPda,
      })
      .rpc();
    await sendAndConfirm(tx);

    const repAfter = await program.account.buyerReputation.fetch(buyerRepPda);
    assert.equal(repAfter.hasBadge[tier], true);
    console.log(`Tier ${tier} badge minted ✓`);
  });

  // ── 7. update_merchant_score ─────────────────────────────────────
  it("update_merchant_score", async () => {
    const repBefore    = await program.account.merchantReputation.fetch(merchantRepPda);
    const scoreBefore  = repBefore.score.toNumber();
    const ordersBefore = repBefore.totalOrders.toNumber();
    console.log("Score before:", scoreBefore, "| Orders before:", ordersBefore);

    const tx = await program.methods
      .updateMerchantScore(product_id, false)
      .accounts({
        admin:          program.provider.publicKey,
        config:         configPda,
        merchantWallet: merchantKp.publicKey,
        merchantRep:    merchantRepPda,
      })
      .rpc();

    await sendAndConfirm(tx);
    console.log("update_merchant_score tx confirmed:", tx);

    const repAfter = await program.account.merchantReputation.fetch(merchantRepPda);
    console.log("Score after:", repAfter.score.toNumber(), "| Orders after:", repAfter.totalOrders.toNumber());

    assert.equal(
      repAfter.score.toNumber(),
      Math.min(scoreBefore + 10, 1000),
      `Score expected ${Math.min(scoreBefore + 10, 1000)}, got ${repAfter.score.toNumber()}`
    );
    assert.equal(
      repAfter.totalOrders.toNumber(),
      ordersBefore + 1,
      `Orders expected ${ordersBefore + 1}, got ${repAfter.totalOrders.toNumber()}`
    );
    console.log("Merchant score updated ✓");
  });

});