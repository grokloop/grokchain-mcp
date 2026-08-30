import assert from "node:assert/strict";
import { test } from "node:test";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  DISC,
  INTENTS_DISC,
  LOCAL_ONLY_INTENTS_PROGRAM_ID,
  LOCAL_ONLY_PROGRAM_ID,
  MAX_SPONSOR_LAMPORTS,
  PUMP_AMM_PROGRAM_ID,
  PUMP_DISC,
  PUMP_PROGRAM_ID,
} from "../src/constants.js";
import { buildCallIx, buildDeployIx, buildInitPaymasterIx, buildInitSpendVaultIx, buildPayIx, buildPumpAmmBuyIx, buildPumpAmmSellIx, buildPumpBuyIx, buildPumpSellIx, buildSwapIx, deriveIntentsAddrs } from "../src/intents.js";
import { grantPda, grokAccountPda, paymasterPda, pumpTraderPda, spendVaultPda } from "../src/pda.js";
import {
  buildCheckGrantIx,
  buildCreateAccountIx,
  buildIssueGrantIx,
  buildReviseGrantIx,
  buildRevokeGrantIx,
} from "../src/core.js";
import { encodeCallArgs, encodeDeployArgs, encodeGrantPolicyArgs, encodePayArgs, encodePumpAmmBuyArgs, encodePumpAmmSellArgs, encodePumpBuyArgs, encodePumpBuyV2Inner, encodePumpSellArgs, encodeSwapArgs } from "../src/encode.js";

const PROGRAM = new PublicKey(LOCAL_ONLY_PROGRAM_ID);
const ROOT = new PublicKey("11111111111111111111111111111111");
const AGENT = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

test("instruction discriminators match the CORE wire", () => {
  assert.deepEqual(Array.from(DISC.create_account), [0x63, 0x14, 0x82, 0x77, 0xc4, 0xeb, 0x83, 0x95]);
  assert.deepEqual(Array.from(DISC.issue_grant), [0x41, 0xbe, 0x63, 0x4b, 0x47, 0x46, 0x14, 0x6b]);
  assert.deepEqual(Array.from(DISC.revise_grant), [0x05, 0xe1, 0x47, 0x7f, 0xcd, 0xf6, 0xea, 0x3b]);
  assert.deepEqual(Array.from(DISC.revoke_grant), [0x86, 0xb4, 0x39, 0x27, 0x98, 0x07, 0x9a, 0x62]);
  assert.deepEqual(Array.from(DISC.check_grant), [0xdf, 0xac, 0x83, 0x8c, 0x0f, 0x85, 0xd1, 0xfa]);
});

test("create_account and revoke_grant are discriminator-only", () => {
  const created = buildCreateAccountIx({ programId: PROGRAM, root: ROOT });
  assert.equal(created.ix.data.length, 8);
  assert.deepEqual(Array.from(created.ix.data), Array.from(DISC.create_account));
  assert.equal(created.ix.keys.length, 3);
  assert.equal(created.ix.keys[0]!.isSigner, true);
  assert.equal(created.ix.keys[0]!.isWritable, true);
  assert.equal(created.ix.keys[1]!.isWritable, true);
  assert.equal(created.ix.keys[2]!.pubkey.equals(SystemProgram.programId), true);

  const revoked = buildRevokeGrantIx({ programId: PROGRAM, root: ROOT, agent: AGENT });
  assert.equal(revoked.ix.data.length, 8);
  assert.deepEqual(Array.from(revoked.ix.data), Array.from(DISC.revoke_grant));
  assert.equal(revoked.ix.keys.length, 3);
  assert.equal(revoked.ix.keys[0]!.isSigner, true);
  assert.equal(revoked.ix.keys[0]!.isWritable, false);
  assert.equal(revoked.ix.keys[2]!.isWritable, true);
});

test("GrantPolicyArgs borsh: u64 + vec + i64 + bool + [u8;32]", () => {
  const encoded = encodeGrantPolicyArgs({
    spendCapLamports: 1000,
    allowedPrograms: [SystemProgram.programId],
    expiresAtUnix: 2_000_000_000,
    sponsorEligible: true,
    label: "agent-a",
  });
  assert.equal(encoded.readBigUInt64LE(0), 1000n);
  assert.equal(encoded.readUInt32LE(8), 1);
  assert.equal(
    new PublicKey(encoded.subarray(12, 44)).toBase58(),
    SystemProgram.programId.toBase58(),
  );
  assert.equal(encoded.readBigInt64LE(44), 2_000_000_000n);
  assert.equal(encoded[52], 1);
  assert.equal(encoded.subarray(53, 60).toString("utf8"), "agent-a");
  assert.equal(encoded.length, 8 + 4 + 32 + 8 + 1 + 32);
});

test("issue_grant and revise_grant prefix policy with their discs", () => {
  const policy = {
    spendCapLamports: 0,
    allowedPrograms: [] as PublicKey[],
    expiresAtUnix: 2_000_000_000,
    sponsorEligible: false,
    label: "",
  };
  const issued = buildIssueGrantIx({ programId: PROGRAM, root: ROOT, agent: AGENT, policy });
  const revised = buildReviseGrantIx({ programId: PROGRAM, root: ROOT, agent: AGENT, policy });
  assert.deepEqual(Array.from(issued.ix.data.subarray(0, 8)), Array.from(DISC.issue_grant));
  assert.deepEqual(Array.from(revised.ix.data.subarray(0, 8)), Array.from(DISC.revise_grant));
  assert.deepEqual(
    Buffer.from(issued.ix.data.subarray(8)),
    encodeGrantPolicyArgs(policy),
  );
  assert.equal(issued.ix.keys.length, 5);
  assert.equal(issued.ix.keys[2]!.pubkey.equals(AGENT), true);
  assert.equal(issued.ix.keys[2]!.isSigner, false);
  assert.equal(revised.ix.keys.length, 3);
});

test("check_grant is disc + u64 amount; agent is signer", () => {
  const built = buildCheckGrantIx({
    programId: PROGRAM,
    root: ROOT,
    agent: AGENT,
    targetProgram: SystemProgram.programId,
    amountLamports: 600,
  });
  assert.equal(built.ix.data.length, 16);
  assert.deepEqual(Array.from(built.ix.data.subarray(0, 8)), Array.from(DISC.check_grant));
  assert.equal(built.ix.data.readBigUInt64LE(8), 600n);
  assert.equal(built.ix.keys.length, 4);
  assert.equal(built.ix.keys[2]!.isSigner, true);
  assert.equal(built.ix.keys[2]!.pubkey.equals(AGENT), true);
  assert.equal(built.ix.keys[3]!.pubkey.equals(SystemProgram.programId), true);
});

const INTENTS = new PublicKey(LOCAL_ONLY_INTENTS_PROGRAM_ID);

test("pay discriminator and PayArgs encoding are disc + u64 + u64", () => {
  assert.deepEqual(Array.from(INTENTS_DISC.pay), [119, 18, 216, 65, 192, 117, 122, 220]);
  const args = encodePayArgs({ amountLamports: 500, sponsorLamports: 1_000_000 });
  assert.equal(args.length, 16);
  assert.equal(args.readBigUInt64LE(0), 500n);
  assert.equal(args.readBigUInt64LE(8), 1_000_000n);

  const built = buildPayIx({
    coreProgramId: PROGRAM,
    intentsProgramId: INTENTS,
    root: ROOT,
    agent: AGENT,
    recipient: SystemProgram.programId,
    amountLamports: 500,
    sponsorLamports: 0,
  });
  assert.equal(built.ix.programId.toBase58(), LOCAL_ONLY_INTENTS_PROGRAM_ID);
  assert.equal(built.ix.data.length, 24);
  assert.deepEqual(Array.from(built.ix.data.subarray(0, 8)), Array.from(INTENTS_DISC.pay));
  assert.equal(built.ix.data.readBigUInt64LE(8), 500n);
  assert.equal(built.ix.data.readBigUInt64LE(16), 0n);
  assert.equal(built.ix.keys.length, 10);
  assert.equal(built.ix.keys[0]!.pubkey.equals(AGENT), true);
  assert.equal(built.ix.keys[0]!.isSigner, true);
  assert.equal(built.ix.keys[0]!.isWritable, false);
  assert.equal(built.ix.keys[6]!.isWritable, true);
  assert.equal(built.ix.keys[8]!.pubkey.equals(INTENTS), true);
  assert.equal(built.ix.keys[9]!.pubkey.equals(INTENTS), true);
  assert.equal(built.ix.keys[9]!.isSigner, false);
  assert.notEqual(built.ix.programId.toBase58(), SystemProgram.programId.toBase58());
});

test("pay with sponsor>0 requires paymaster + relayer fee_payer signer", () => {
  const relayer = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
  const built = buildPayIx({
    coreProgramId: PROGRAM,
    intentsProgramId: INTENTS,
    root: ROOT,
    agent: AGENT,
    recipient: SystemProgram.programId,
    amountLamports: 1,
    sponsorLamports: MAX_SPONSOR_LAMPORTS,
    feePayer: relayer,
  });
  const [account] = grokAccountPda(PROGRAM, ROOT);
  const [pm] = paymasterPda(INTENTS, account);
  const [grant] = grantPda(PROGRAM, account, AGENT);
  const [vault] = spendVaultPda(INTENTS, account);
  assert.equal(built.ix.keys[2]!.pubkey.equals(grant), true);
  assert.equal(built.ix.keys[2]!.isWritable, true);
  assert.equal(built.ix.keys[3]!.pubkey.equals(PROGRAM), true);
  assert.equal(built.ix.keys[4]!.pubkey.equals(INTENTS), true);
  assert.equal(built.ix.keys[5]!.pubkey.equals(vault), true);
  assert.equal(built.ix.keys[8]!.pubkey.equals(pm), true);
  assert.equal(built.ix.keys[8]!.isWritable, true);
  assert.equal(built.ix.keys[9]!.pubkey.equals(relayer), true);
  assert.equal(built.ix.keys[9]!.isSigner, true);
  assert.equal(built.ix.keys[9]!.isWritable, true);
  assert.equal(built.ix.data.readBigUInt64LE(16), BigInt(MAX_SPONSOR_LAMPORTS));
});

test("vault init seeds and discriminators match spec", () => {
  assert.deepEqual(Array.from(INTENTS_DISC.init_spend_vault), [241, 173, 7, 179, 120, 124, 213, 61]);
  assert.deepEqual(Array.from(INTENTS_DISC.init_paymaster), [23, 62, 252, 40, 178, 70, 114, 54]);
  const vault = buildInitSpendVaultIx({
    coreProgramId: PROGRAM,
    intentsProgramId: INTENTS,
    root: ROOT,
  });
  assert.equal(vault.ix.data.length, 8);
  assert.equal(vault.ix.keys.length, 4);
  assert.equal(vault.ix.keys[0]!.isSigner, true);
  assert.equal(vault.ix.keys[0]!.isWritable, true);
  assert.equal(vault.ix.keys[2]!.isWritable, true);
  assert.equal(vault.ix.programId.equals(INTENTS), true);

  const relayer = AGENT;
  const pm = buildInitPaymasterIx({
    coreProgramId: PROGRAM,
    intentsProgramId: INTENTS,
    root: ROOT,
    relayer,
  });
  assert.equal(pm.ix.data.length, 40);
  assert.deepEqual(Array.from(pm.ix.data.subarray(0, 8)), Array.from(INTENTS_DISC.init_paymaster));
  assert.equal(new PublicKey(pm.ix.data.subarray(8, 40)).toBase58(), relayer.toBase58());
});


test("swap discriminator and SwapArgs are disc + 3 u64s; same mouth as pay", () => {
  assert.deepEqual(Array.from(INTENTS_DISC.swap), [248, 198, 158, 145, 225, 117, 135, 200]);
  const args = encodeSwapArgs({ amountInLamports: 100, minOutLamports: 90, sponsorLamports: 0 });
  assert.equal(args.length, 24);
  assert.equal(args.readBigUInt64LE(0), 100n);
  assert.equal(args.readBigUInt64LE(8), 90n);
  assert.equal(args.readBigUInt64LE(16), 0n);

  const built = buildSwapIx({
    coreProgramId: PROGRAM,
    intentsProgramId: INTENTS,
    root: ROOT,
    agent: AGENT,
    outDestination: SystemProgram.programId,
    amountInLamports: 100,
    minOutLamports: 90,
    sponsorLamports: 0,
  });
  assert.equal(built.ix.data.length, 32);
  assert.deepEqual(Array.from(built.ix.data.subarray(0, 8)), Array.from(INTENTS_DISC.swap));
  assert.equal(built.ix.keys.length, 10);
  assert.equal(built.ix.keys[0]!.pubkey.equals(AGENT), true);
  assert.equal(built.ix.keys[0]!.isSigner, true);
  assert.equal(built.ix.keys[0]!.isWritable, false);
  assert.equal(built.ix.keys[6]!.isWritable, true);
});

test("deploy discriminator is disc + u64 + pubkey; spend_vault not writable", () => {
  assert.deepEqual(Array.from(INTENTS_DISC.deploy), [67, 36, 143, 118, 36, 164, 92, 217]);
  const args = encodeDeployArgs({ sponsorLamports: 0, programId: SystemProgram.programId });
  assert.equal(args.length, 40);
  const built = buildDeployIx({
    coreProgramId: PROGRAM,
    intentsProgramId: INTENTS,
    root: ROOT,
    agent: AGENT,
    programId: SystemProgram.programId,
    sponsorLamports: 0,
  });
  assert.equal(built.ix.data.length, 48);
  assert.deepEqual(Array.from(built.ix.data.subarray(0, 8)), Array.from(INTENTS_DISC.deploy));
  assert.equal(built.ix.keys.length, 9);
  assert.equal(built.ix.keys[0]!.isSigner, true);
  assert.equal(built.ix.keys[0]!.isWritable, false);
  assert.equal(built.ix.keys[5]!.isWritable, false);
});

test("call discriminator is disc + 2 u64s + pubkey; amount 0 still builds", () => {
  assert.deepEqual(Array.from(INTENTS_DISC.call), [181, 94, 56, 161, 194, 221, 200, 3]);
  const args = encodeCallArgs({
    amountLamports: 0,
    sponsorLamports: 0,
    targetProgram: SystemProgram.programId,
  });
  assert.equal(args.length, 48);
  const built = buildCallIx({
    coreProgramId: PROGRAM,
    intentsProgramId: INTENTS,
    root: ROOT,
    agent: AGENT,
    recipient: SystemProgram.programId,
    targetProgram: SystemProgram.programId,
    amountLamports: 0,
    sponsorLamports: 0,
  });
  assert.equal(built.ix.data.length, 56);
  assert.deepEqual(Array.from(built.ix.data.subarray(0, 8)), Array.from(INTENTS_DISC.call));
  assert.equal(built.ix.data.readBigUInt64LE(8), 0n);
  assert.equal(built.ix.keys.length, 11);
  assert.equal(built.ix.keys[0]!.isSigner, true);
  assert.equal(built.ix.keys[0]!.isWritable, false);
  assert.equal(built.ix.keys[8]!.pubkey.equals(SystemProgram.programId), true);
});

test("official pump discs match sha256(global:buy_v2/sell_v2)[:8]", () => {
  assert.deepEqual(Array.from(PUMP_DISC.buy_v2), [0xb8, 0x17, 0xee, 0x61, 0x67, 0xc5, 0xd3, 0x3d]);
  assert.deepEqual(Array.from(PUMP_DISC.sell_v2), [0x5d, 0xf6, 0x82, 0x3c, 0xe7, 0xe9, 0x40, 0xb2]);
  const inner = encodePumpBuyV2Inner(1_000_000, 10_000_000);
  assert.equal(inner.length, 24);
  assert.deepEqual(Array.from(inner.subarray(0, 8)), Array.from(PUMP_DISC.buy_v2));
  assert.notEqual(inner.length, 0);
});

test("pump_buy discriminator and args; user must be trader; target != pump fails", () => {
  assert.deepEqual(Array.from(INTENTS_DISC.pump_buy), [82, 225, 119, 231, 78, 29, 45, 70]);
  assert.deepEqual(Array.from(INTENTS_DISC.pump_sell), [93, 88, 60, 34, 91, 18, 86, 197]);
  const args = encodePumpBuyArgs({ amount: 10, maxSolCost: 100, sponsorLamports: 0 });
  assert.equal(args.length, 24);
  const sellArgs = encodePumpSellArgs({ amount: 10, minSolOutput: 1, sponsorLamports: 0 });
  assert.equal(sellArgs.length, 24);

  const [grokAccount] = grokAccountPda(PROGRAM, ROOT);
  const [spendVault] = spendVaultPda(INTENTS, grokAccount);
  const [pumpTrader] = pumpTraderPda(INTENTS, grokAccount);
  const pump = new PublicKey(PUMP_PROGRAM_ID);
  const remaining = Array.from({ length: 27 }, (_, i) => ({
    pubkey: i === 13 ? pumpTrader : i === 26 ? pump : new PublicKey("11111111111111111111111111111111"),
    isSigner: false,
    isWritable: i === 13,
  }));


  const vaultAsUser = remaining.map((a, i) => (i === 13 ? { ...a, pubkey: spendVault } : a));
  assert.throws(
    () =>
      buildPumpBuyIx({
        coreProgramId: PROGRAM,
        intentsProgramId: INTENTS,
        root: ROOT,
        agent: AGENT,
        amount: 10,
        maxSolCost: 100,
        sponsorLamports: 0,
        remainingAccounts: vaultAsUser,
      }),
    /SpendVault|trader/,
  );

  const built = buildPumpBuyIx({
    coreProgramId: PROGRAM,
    intentsProgramId: INTENTS,
    root: ROOT,
    agent: AGENT,
    amount: 10,
    maxSolCost: 100,
    sponsorLamports: 0,
    remainingAccounts: remaining,
  });
  assert.equal(built.ix.data.length, 32);
  assert.deepEqual(Array.from(built.ix.data.subarray(0, 8)), Array.from(INTENTS_DISC.pump_buy));
  assert.equal(built.ix.keys[0]!.pubkey.equals(AGENT), true);
  assert.equal(built.ix.keys[0]!.isSigner, true);
  assert.equal(built.ix.keys[0]!.isWritable, false);

  // The named accounts ARE the PumpTrade struct, in its order, and there are
  // exactly ten of them before remaining_accounts begins. This used to assert
  // only that pump_program sat at index 8, which held because the builder
  // wrongly inserted the pump-trader PDA at index 6 — the trader belongs in
  // remaining_accounts alone. That off-by-one put the trader where the program
  // expected system_program, and every pump ix failed with InvalidProgramId
  // (3008) on chain while the narrow assertion still passed. Pin the whole
  // mouth so a shift cannot hide again.
  const addrs = deriveIntentsAddrs({
    coreProgramId: PROGRAM,
    intentsProgramId: INTENTS,
    root: ROOT,
    agent: AGENT,
  });
  const mouth = built.ix.keys.slice(0, 10).map((k) => k.pubkey.toBase58());
  assert.deepEqual(mouth, [
    AGENT.toBase58(),
    addrs.grokAccount.toBase58(),
    addrs.grant.toBase58(),
    PROGRAM.toBase58(),
    INTENTS.toBase58(),
    addrs.spendVault.toBase58(),
    SystemProgram.programId.toBase58(),
    pump.toBase58(),
    // sponsor_lamports is 0 here, so the optional paymaster is None — Anchor
    // marks an absent optional account with the program id, not the PDA.
    INTENTS.toBase58(),
    built.ix.keys[9]!.pubkey.toBase58(),
  ]);
  assert.notEqual(
    built.ix.keys[8]!.pubkey.toBase58(),
    addrs.paymaster.toBase58(),
    "an unsponsored call must not claim the paymaster account",
  );
  assert.equal(
    mouth.includes(addrs.pumpTrader.toBase58()),
    false,
    "the pump-trader PDA reaches the program through remaining_accounts only",
  );
  assert.equal(built.ix.keys[7]!.pubkey.equals(pump), true);

  const badUser = remaining.map((a, i) => (i === 13 ? { ...a, pubkey: AGENT } : a));
  assert.throws(
    () =>
      buildPumpBuyIx({
        coreProgramId: PROGRAM,
        intentsProgramId: INTENTS,
        root: ROOT,
        agent: AGENT,
        amount: 10,
        maxSolCost: 100,
        sponsorLamports: 0,
        remainingAccounts: badUser,
      }),
    /user/,
  );

  const badProg = remaining.map((a, i) => (i === 26 ? { ...a, pubkey: SystemProgram.programId } : a));
  assert.throws(
    () =>
      buildPumpBuyIx({
        coreProgramId: PROGRAM,
        intentsProgramId: INTENTS,
        root: ROOT,
        agent: AGENT,
        amount: 10,
        maxSolCost: 100,
        sponsorLamports: 0,
        remainingAccounts: badProg,
      }),
    /pump\.fun/,
  );

  const sellRemaining = Array.from({ length: 26 }, (_, i) => ({
    pubkey: i === 13 ? pumpTrader : i === 25 ? pump : new PublicKey("11111111111111111111111111111111"),
    isSigner: false,
    isWritable: i === 13,
  }));
  const sold = buildPumpSellIx({
    coreProgramId: PROGRAM,
    intentsProgramId: INTENTS,
    root: ROOT,
    agent: AGENT,
    amount: 10,
    minSolOutput: 1,
    sponsorLamports: 0,
    remainingAccounts: sellRemaining,
  });
  assert.deepEqual(Array.from(sold.ix.data.subarray(0, 8)), Array.from(INTENTS_DISC.pump_sell));
});

test("pump_amm_buy/sell discriminators, remaining counts, trader is remaining[1]", () => {
  assert.deepEqual(Array.from(INTENTS_DISC.pump_amm_buy), [129, 59, 179, 195, 110, 135, 61, 2]);
  assert.deepEqual(Array.from(INTENTS_DISC.pump_amm_sell), [238, 234, 142, 38, 107, 206, 76, 195]);
  const buyArgs = encodePumpAmmBuyArgs({
    spendableQuoteIn: 100_000_000,
    minBaseAmountOut: 1,
    maxSolCost: 100_000_000,
    sponsorLamports: 0,
  });
  assert.equal(buyArgs.length, 32);
  const sellArgs = encodePumpAmmSellArgs({
    baseAmountIn: 1_000,
    minQuoteAmountOut: 1,
    sponsorLamports: 0,
  });
  assert.equal(sellArgs.length, 24);

  const [grokAccount] = grokAccountPda(PROGRAM, ROOT);
  const [spendVault] = spendVaultPda(INTENTS, grokAccount);
  const [pumpTrader] = pumpTraderPda(INTENTS, grokAccount);
  const amm = new PublicKey(PUMP_AMM_PROGRAM_ID);

  const buyRemaining = Array.from({ length: 26 }, (_, i) => ({
    pubkey: i === 1 ? pumpTrader : i === 16 ? amm : new PublicKey("11111111111111111111111111111111"),
    isSigner: false,
    isWritable: i === 1,
  }));
  const built = buildPumpAmmBuyIx({
    coreProgramId: PROGRAM,
    intentsProgramId: INTENTS,
    root: ROOT,
    agent: AGENT,
    spendableQuoteIn: 100_000_000,
    minBaseAmountOut: 1,
    maxSolCost: 100_000_000,
    sponsorLamports: 0,
    remainingAccounts: buyRemaining,
  });
  assert.equal(built.ix.data.length, 40);
  assert.deepEqual(Array.from(built.ix.data.subarray(0, 8)), Array.from(INTENTS_DISC.pump_amm_buy));
  assert.equal(built.ix.keys[0]!.pubkey.equals(AGENT), true);
  assert.equal(built.ix.keys[0]!.isSigner, true);
  assert.equal(built.ix.keys[7]!.pubkey.equals(amm), true);
  assert.equal(built.ix.keys.length, 10 + 26);

  const vaultAsUser = buyRemaining.map((a, i) => (i === 1 ? { ...a, pubkey: spendVault } : a));
  assert.throws(
    () =>
      buildPumpAmmBuyIx({
        coreProgramId: PROGRAM,
        intentsProgramId: INTENTS,
        root: ROOT,
        agent: AGENT,
        spendableQuoteIn: 1,
        minBaseAmountOut: 0,
        maxSolCost: 1,
        sponsorLamports: 0,
        remainingAccounts: vaultAsUser,
      }),
    /SpendVault|trader/,
  );

  const sellRemaining = Array.from({ length: 24 }, (_, i) => ({
    pubkey: i === 1 ? pumpTrader : i === 16 ? amm : new PublicKey("11111111111111111111111111111111"),
    isSigner: false,
    isWritable: i === 1,
  }));
  const sold = buildPumpAmmSellIx({
    coreProgramId: PROGRAM,
    intentsProgramId: INTENTS,
    root: ROOT,
    agent: AGENT,
    baseAmountIn: 1_000,
    minQuoteAmountOut: 1,
    sponsorLamports: 0,
    remainingAccounts: sellRemaining,
  });
  assert.deepEqual(Array.from(sold.ix.data.subarray(0, 8)), Array.from(INTENTS_DISC.pump_amm_sell));
  assert.equal(sold.ix.data.length, 32);

  assert.throws(
    () =>
      buildPumpAmmSellIx({
        coreProgramId: PROGRAM,
        intentsProgramId: INTENTS,
        root: ROOT,
        agent: AGENT,
        baseAmountIn: 1_000,
        minQuoteAmountOut: 1,
        sponsorLamports: 0,
        remainingAccounts: buyRemaining,
      }),
    /24|volume|buy/,
  );
});

test("token_buy and token_sell discriminators match sha256 global: names", () => {
  assert.deepEqual(Array.from(INTENTS_DISC.token_buy), [116, 167, 118, 40, 127, 96, 55, 234]);
  assert.deepEqual(Array.from(INTENTS_DISC.token_sell), [154, 76, 173, 221, 122, 208, 158, 103]);
});

test("token trade args borsh and build ix remaining from Jupiter-shaped list", async () => {
  const { encodeTokenTradeArgs } = await import("../src/encode.js");
  const { buildTokenBuyIx, buildTokenSellIx, deriveIntentsAddrs } = await import("../src/intents.js");
  const { JUPITER_V6_PROGRAM_ID, USDC_MINT, WSOL_MINT } = await import("../src/constants.js");
  const inputMint = new PublicKey(WSOL_MINT);
  const outputMint = new PublicKey(USDC_MINT);
  const jupData = Buffer.concat([Buffer.alloc(8, 1), Buffer.from(Uint8Array.from([0x40, 0x42, 0x0f, 0, 0, 0, 0, 0]))]); // 1_000_000
  const encoded = encodeTokenTradeArgs({
    inAmount: 1_000_000,
    minOut: 1,
    sponsorLamports: 0,
    inputMint,
    outputMint,
    wrapSol: true,
    jupiterData: jupData,
  });
  assert.equal(encoded.readBigUInt64LE(0), 1_000_000n);
  assert.equal(encoded.readBigUInt64LE(8), 1n);
  assert.equal(encoded.readBigUInt64LE(16), 0n);
  assert.equal(encoded[88], 1); // wrap_sol after 3*u64 + 2*pubkey
  assert.equal(encoded.readUInt32LE(89), jupData.length);
  const INTENTS = new PublicKey("AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2");
  const addrs = deriveIntentsAddrs({ coreProgramId: PROGRAM, intentsProgramId: INTENTS, root: ROOT, agent: AGENT });
  const remaining = [
    { pubkey: addrs.pumpTrader, isSigner: true, isWritable: true },
    { pubkey: new PublicKey(JUPITER_V6_PROGRAM_ID), isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  const buy = buildTokenBuyIx({
    coreProgramId: PROGRAM,
    intentsProgramId: INTENTS,
    root: ROOT,
    agent: AGENT,
    inAmount: 1_000_000,
    minOut: 1,
    sponsorLamports: 0,
    inputMint,
    outputMint,
    wrapSol: true,
    jupiterData: jupData,
    remainingAccounts: remaining,
  });
  assert.deepEqual(Array.from(buy.ix.data.subarray(0, 8)), Array.from(INTENTS_DISC.token_buy));
  assert.equal(buy.ix.keys.some((k) => k.pubkey.equals(addrs.pumpTrader)), true);
  assert.equal(buy.ix.keys.some((k) => k.pubkey.toBase58() === JUPITER_V6_PROGRAM_ID), true);
  const sell = buildTokenSellIx({
    coreProgramId: PROGRAM,
    intentsProgramId: INTENTS,
    root: ROOT,
    agent: AGENT,
    inAmount: 1_000_000,
    minOut: 1,
    sponsorLamports: 0,
    inputMint: outputMint,
    outputMint: inputMint,
    wrapSol: false,
    jupiterData: jupData,
    remainingAccounts: remaining,
  });
  assert.deepEqual(Array.from(sell.ix.data.subarray(0, 8)), Array.from(INTENTS_DISC.token_sell));
});
