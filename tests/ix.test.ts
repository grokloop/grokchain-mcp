import assert from "node:assert/strict";
import { test } from "node:test";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  DISC,
  INTENTS_DISC,
  LOCAL_ONLY_INTENTS_PROGRAM_ID,
  LOCAL_ONLY_PROGRAM_ID,
  MAX_SPONSOR_LAMPORTS,
} from "../src/constants.js";
import { buildCallIx, buildDeployIx, buildInitPaymasterIx, buildInitSpendVaultIx, buildPayIx, buildSwapIx } from "../src/intents.js";
import { grantPda, grokAccountPda, paymasterPda, spendVaultPda } from "../src/pda.js";
import {
  buildCheckGrantIx,
  buildCreateAccountIx,
  buildIssueGrantIx,
  buildReviseGrantIx,
  buildRevokeGrantIx,
} from "../src/core.js";
import { encodeCallArgs, encodeDeployArgs, encodeGrantPolicyArgs, encodePayArgs, encodeSwapArgs } from "../src/encode.js";

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
