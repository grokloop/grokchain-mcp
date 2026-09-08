import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { Keypair, PublicKey } from "@solana/web3.js";
import { INTENTS_DISC, SEED_SUB_GRANT } from "../src/constants.js";
import { grokAccountPda } from "../src/pda.js";
import {
  MAX_SUB_DEPTH,
  buildIssueSubGrantIx,
  buildRevokeSubGrantIx,
  decodeSubGrant,
  subGrantPda,
} from "../src/subgrant.js";

const CORE = new PublicKey("44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd");
const INTENTS = new PublicKey("3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw");

test("discriminators are sha256(global:<name>)[..8]", () => {
  // Anchor derives these from the instruction NAME, so a rename silently breaks
  // every client. Pinning them here means the rename fails loudly instead.
  const disc = (n: string) => createHash("sha256").update(`global:${n}`).digest().subarray(0, 8);
  assert.deepEqual(INTENTS_DISC.issue_sub_grant, disc("issue_sub_grant"));
  assert.deepEqual(INTENTS_DISC.revise_sub_grant, disc("revise_sub_grant"));
  assert.deepEqual(INTENTS_DISC.revoke_sub_grant, disc("revoke_sub_grant"));
});

test("the PDA is seeded by grokAccount and agent, under INTENTS", () => {
  const root = Keypair.generate().publicKey;
  const agent = Keypair.generate().publicKey;
  const [grokAccount] = grokAccountPda(CORE, root);
  const [pda] = subGrantPda(INTENTS, grokAccount, agent);
  const [expected] = PublicKey.findProgramAddressSync(
    [SEED_SUB_GRANT, grokAccount.toBuffer(), agent.toBuffer()],
    INTENTS,
  );
  assert.equal(pda.toBase58(), expected.toBase58());

  // Under INTENTS, not CORE. Sub-grants are this program's state; deriving them
  // under CORE would point at an account that can never exist.
  const [wrong] = PublicKey.findProgramAddressSync(
    [SEED_SUB_GRANT, grokAccount.toBuffer(), agent.toBuffer()],
    CORE,
  );
  assert.notEqual(pda.toBase58(), wrong.toBase58());
});

test("a different agent gets a different sub-grant", () => {
  const root = Keypair.generate().publicKey;
  const [grokAccount] = grokAccountPda(CORE, root);
  const a = subGrantPda(INTENTS, grokAccount, Keypair.generate().publicKey)[0];
  const b = subGrantPda(INTENTS, grokAccount, Keypair.generate().publicKey)[0];
  assert.notEqual(a.toBase58(), b.toBase58());
});

test("first-level delegation carries no parent; deeper levels do", () => {
  const root = Keypair.generate().publicKey;
  const coreAgent = Keypair.generate().publicKey;
  const child = Keypair.generate().publicKey;
  const grandchild = Keypair.generate().publicKey;
  const payer = Keypair.generate().publicKey;
  const common = {
    coreProgramId: CORE,
    intentsProgramId: INTENTS,
    root,
    payer,
    coreAgent,
    cap: 1_000_000n,
    expiresAtUnix: Math.floor(Date.now() / 1000) + 86400,
  };

  // The CORE agent delegating: no parent sub-grant exists above it.
  const first = buildIssueSubGrantIx({ ...common, issuer: coreAgent, agent: child });
  assert.equal(first.parent, null);

  // The child delegating onward: its own sub-grant is the parent.
  const second = buildIssueSubGrantIx({ ...common, issuer: child, agent: grandchild });
  assert.notEqual(second.parent, null);
  const [grokAccount] = grokAccountPda(CORE, root);
  assert.equal(second.parent!.toBase58(), subGrantPda(INTENTS, grokAccount, child)[0].toBase58());
});

test("an absent parent is encoded as the program id, not by omitting the slot", () => {
  // Anchor represents an absent Option<Account> with the program id in place.
  // Dropping the slot instead would shift every account after it and the program
  // would read the wrong thing — silently, since the types still line up.
  const root = Keypair.generate().publicKey;
  const coreAgent = Keypair.generate().publicKey;
  const withParent = buildIssueSubGrantIx({
    coreProgramId: CORE, intentsProgramId: INTENTS, root,
    issuer: Keypair.generate().publicKey, payer: Keypair.generate().publicKey,
    coreAgent, agent: Keypair.generate().publicKey,
    cap: 1n, expiresAtUnix: 1,
  });
  const without = buildIssueSubGrantIx({
    coreProgramId: CORE, intentsProgramId: INTENTS, root,
    issuer: coreAgent, payer: Keypair.generate().publicKey,
    coreAgent, agent: Keypair.generate().publicKey,
    cap: 1n, expiresAtUnix: 1,
  });
  assert.equal(withParent.ix.keys.length, without.ix.keys.length, "same account count either way");
  assert.equal(without.ix.keys[4]!.pubkey.toBase58(), INTENTS.toBase58());
  assert.notEqual(withParent.ix.keys[4]!.pubkey.toBase58(), INTENTS.toBase58());
});

test("the issuer signs but never pays", () => {
  // An agent holds no SOL. If the builder made it the rent payer the instruction
  // would be unusable by exactly the party it exists for.
  const issuer = Keypair.generate().publicKey;
  const payer = Keypair.generate().publicKey;
  const { ix } = buildIssueSubGrantIx({
    coreProgramId: CORE, intentsProgramId: INTENTS,
    root: Keypair.generate().publicKey, issuer, payer,
    coreAgent: issuer, agent: Keypair.generate().publicKey,
    cap: 1n, expiresAtUnix: 1,
  });
  const issuerMeta = ix.keys.find((k) => k.pubkey.equals(issuer))!;
  const payerMeta = ix.keys.find((k) => k.pubkey.equals(payer))!;
  assert.equal(issuerMeta.isSigner, true);
  assert.equal(issuerMeta.isWritable, false, "the issuer's account is never debited");
  assert.equal(payerMeta.isSigner, true);
  assert.equal(payerMeta.isWritable, true);
});

test("revoke writes exactly one account", () => {
  // The cascade is a property of validation. If this ever needed to touch
  // descendants it would be unbounded, and an unbounded revoke can half-finish.
  const { ix } = buildRevokeSubGrantIx({
    coreProgramId: CORE, intentsProgramId: INTENTS,
    root: Keypair.generate().publicKey,
    authority: Keypair.generate().publicKey,
    agent: Keypair.generate().publicKey,
  });
  assert.equal(ix.keys.filter((k) => k.isWritable).length, 1);
  assert.equal(ix.data.length, 8, "no arguments — it always kills the whole subtree");
});

test("decoding reports a root sub-grant's parent as null, not the zero address", () => {
  // The program uses the default pubkey as the sentinel for "hangs off the CORE
  // grant". Surfacing that as an address would imply a parent that cannot exist.
  const buf = Buffer.alloc(8 + 32 * 4 + 8 + 8 + 8 + 1 + 1 + 4 + 1);
  createHash("sha256").update("account:SubGrant").digest().copy(buf, 0, 0, 8);
  let o = 8;
  const gk = Keypair.generate().publicKey;
  gk.toBuffer().copy(buf, o); o += 32;          // grok_account
  o += 32;                                       // parent stays all-zero
  Keypair.generate().publicKey.toBuffer().copy(buf, o); o += 32; // issuer
  const agent = Keypair.generate().publicKey;
  agent.toBuffer().copy(buf, o); o += 32;
  buf.writeBigUInt64LE(1_000_000n, o); o += 8;   // cap
  buf.writeBigUInt64LE(250_000n, o); o += 8;     // spent
  buf.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000) + 3600), o); o += 8;
  buf[o] = 0; o += 1;                            // revoked
  buf[o] = 1; o += 1;                            // depth
  buf.writeUInt32LE(1, o);

  const d = decodeSubGrant(Keypair.generate().publicKey, buf);
  assert.equal(d.parent, null);
  assert.equal(d.depth, 1);
  assert.equal(d.remaining, "750000");
  assert.equal(d.usable, true);
});

test("decoding reports why a sub-grant is unusable, not just that it is", () => {
  const make = (mut: (b: Buffer, off: { cap: number; spent: number; exp: number; rev: number }) => void) => {
    const buf = Buffer.alloc(8 + 32 * 4 + 8 + 8 + 8 + 1 + 1 + 4 + 1);
    createHash("sha256").update("account:SubGrant").digest().copy(buf, 0, 0, 8);
    const base = 8 + 32 * 4;
    const off = { cap: base, spent: base + 8, exp: base + 16, rev: base + 24 };
    buf.writeBigUInt64LE(1_000_000n, off.cap);
    buf.writeBigUInt64LE(0n, off.spent);
    buf.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000) + 3600), off.exp);
    mut(buf, off);
    return decodeSubGrant(Keypair.generate().publicKey, buf);
  };

  assert.equal(make((b, o) => b.fill(1, o.rev, o.rev + 1)).usable, false, "revoked");
  assert.equal(
    make((b, o) => b.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000) - 60), o.exp)).usable,
    false,
    "expired",
  );
  assert.equal(
    make((b, o) => b.writeBigUInt64LE(1_000_000n, o.spent)).usable,
    false,
    "cap reached",
  );
});

test("MAX_SUB_DEPTH matches the program", () => {
  // Every spend walks the chain, so this is a compute bound rather than taste.
  // If the program raises it and the client does not, valid chains get refused
  // here before they ever reach the chain that would have accepted them.
  assert.equal(MAX_SUB_DEPTH, 3);
});

test("a non-SubGrant account is refused rather than misread", () => {
  const buf = Buffer.alloc(200);
  buf.write("not a sub-grant", 0);
  assert.throws(
    () => decodeSubGrant(Keypair.generate().publicKey, buf),
    /is not a SubGrant account/,
  );
});
