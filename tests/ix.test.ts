import assert from "node:assert/strict";
import { test } from "node:test";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { DISC, LOCAL_ONLY_PROGRAM_ID } from "../src/constants.js";
import {
  buildCheckGrantIx,
  buildCreateAccountIx,
  buildIssueGrantIx,
  buildReviseGrantIx,
  buildRevokeGrantIx,
} from "../src/core.js";
import { encodeGrantPolicyArgs } from "../src/encode.js";

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
