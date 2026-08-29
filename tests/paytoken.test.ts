import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  INTENTS_DISC,
  SEED_MERCHANTS,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  USDC_MINT,
} from "../src/constants.js";
import {
  buildInitMerchantRegistryIx,
  buildMerchantIx,
  buildPayTokenIx,
  decodeMerchantRegistry,
  encodePayTokenArgs,
  merchantRegistryPda,
} from "../src/paytoken.js";
import { ataFor } from "../src/pump_amm_accounts.js";
import { payTokenTool } from "../src/tools/pay_token.js";

const CORE = new PublicKey("44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd");
const INTENTS = new PublicKey("3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw");
const ROOT = Keypair.generate().publicKey;
const AGENT = Keypair.generate().publicKey;

const base = () => ({
  coreProgramId: CORE,
  intentsProgramId: INTENTS,
  root: ROOT,
  agent: AGENT,
  mint: new PublicKey(USDC_MINT),
  destinationOwner: Keypair.generate().publicKey,
  amount: 1_000_000,
  decimals: 6,
});

test("new discriminators are the sha256 global: prefixes and shadow nothing", async () => {
  const { createHash } = await import("node:crypto");
  const disc = (n: string) =>
    [...createHash("sha256").update(`global:${n}`).digest().subarray(0, 8)];
  assert.deepEqual([...INTENTS_DISC.pay_token], disc("pay_token"));
  assert.deepEqual([...INTENTS_DISC.init_merchant_registry], disc("init_merchant_registry"));
  assert.deepEqual([...INTENTS_DISC.add_merchant], disc("add_merchant"));
  assert.deepEqual([...INTENTS_DISC.remove_merchant], disc("remove_merchant"));
  assert.notDeepEqual([...INTENTS_DISC.pay_token], [...INTENTS_DISC.pay]);
  assert.notDeepEqual([...INTENTS_DISC.pay_token], [...INTENTS_DISC.token_buy]);
});

test("PayTokenArgs encodes u64 amount + u8 decimals + u64 sponsor", () => {
  const b = encodePayTokenArgs({ amount: 50_000_000n, decimals: 6, sponsorLamports: 0n });
  assert.equal(b.length, 8 + 1 + 8);
  assert.equal(b.readBigUInt64LE(0), 50_000_000n, "50 USDC in raw units");
  assert.equal(b[8], 6);
  assert.equal(b.readBigUInt64LE(9), 0n);
});

test("the allowlist PDA is per GrokAccount", () => {
  const grok = Keypair.generate().publicKey;
  const [pda] = merchantRegistryPda(INTENTS, grok);
  assert.deepEqual(
    pda,
    PublicKey.findProgramAddressSync([SEED_MERCHANTS, grok.toBuffer()], INTENTS)[0],
  );
  const [other] = merchantRegistryPda(INTENTS, Keypair.generate().publicKey);
  assert.notEqual(pda.toBase58(), other.toBase58());
});

test("the payee ATA is derived from their WALLET, not taken from the caller", () => {
  const b = base();
  const built = buildPayTokenIx(b);
  const tok = new PublicKey(TOKEN_PROGRAM_ID);
  assert.equal(
    built.destination.toBase58(),
    ataFor(b.destinationOwner, b.mint, tok).toBase58(),
  );
  assert.equal(built.source.toBase58(), ataFor(built.pumpTrader, b.mint, tok).toBase58());
  assert.notEqual(built.source.toBase58(), built.destination.toBase58());
});

test("the agent signs but is never writable, and the trader is not an outer signer", () => {
  const built = buildPayTokenIx(base());
  const keys = built.ix.keys;
  assert.equal(keys[0]!.pubkey.toBase58(), AGENT.toBase58());
  assert.equal(keys[0]!.isSigner, true);
  assert.equal(keys[0]!.isWritable, false, "agent must never be a fee payer");
  // the trader's signature comes from invoke_signed inside the program
  assert.equal(keys.find((k) => k.pubkey.equals(built.pumpTrader))?.isSigner, false);
  assert.equal(built.ix.programId.toBase58(), INTENTS.toBase58());
  assert.deepEqual([...built.ix.data.subarray(0, 8)], [...INTENTS_DISC.pay_token]);
});

test("optional slots never shift the account list", () => {
  const b = base();
  const withRef = buildPayTokenIx({ ...b, reference: Keypair.generate().publicKey });
  const without = buildPayTokenIx(b);
  assert.equal(withRef.ix.keys.length, without.ix.keys.length);
  // a reference must never be able to authorise anything
  const ref = withRef.ix.keys[12]!;
  assert.equal(ref.isSigner, false);
  assert.equal(ref.isWritable, false);
});

test("a Token-2022 mint derives a different payee account than a classic one", () => {
  const b = base();
  const classic = buildPayTokenIx(b);
  const t22 = buildPayTokenIx({
    ...b,
    tokenProgram: new PublicKey(TOKEN_2022_PROGRAM_ID),
  });
  assert.notEqual(classic.destination.toBase58(), t22.destination.toBase58());
});

test("registry admin is root-signed and the agent appears nowhere in it", () => {
  const init = buildInitMerchantRegistryIx({
    coreProgramId: CORE,
    intentsProgramId: INTENTS,
    root: ROOT,
    mint: new PublicKey(USDC_MINT),
  });
  assert.equal(init.ix.keys[0]!.isSigner, true);
  assert.equal(init.ix.data.length, 8 + 32);

  const merchant = Keypair.generate().publicKey;
  const add = buildMerchantIx({
    coreProgramId: CORE, intentsProgramId: INTENTS, root: ROOT, merchant,
  });
  const rm = buildMerchantIx({
    coreProgramId: CORE, intentsProgramId: INTENTS, root: ROOT, merchant, remove: true,
  });
  assert.deepEqual([...add.ix.data.subarray(0, 8)], [...INTENTS_DISC.add_merchant]);
  assert.deepEqual([...rm.ix.data.subarray(0, 8)], [...INTENTS_DISC.remove_merchant]);
  assert.deepEqual(add.ix.data.subarray(8), merchant.toBuffer());
  assert.ok(!add.ix.keys.some((k) => k.pubkey.equals(AGENT)), "admin never involves the agent");
});

test("registry decode reads the payee list and refuses truncated data", () => {
  const grok = Keypair.generate().publicKey;
  const root = Keypair.generate().publicKey;
  const m1 = Keypair.generate().publicKey;
  const m2 = Keypair.generate().publicKey;
  const buf = Buffer.alloc(109 + 64);
  grok.toBuffer().copy(buf, 8);
  root.toBuffer().copy(buf, 40);
  new PublicKey(USDC_MINT).toBuffer().copy(buf, 72);
  buf.writeUInt32LE(2, 105);
  m1.toBuffer().copy(buf, 109);
  m2.toBuffer().copy(buf, 141);

  const reg = decodeMerchantRegistry(buf)!;
  assert.equal(reg.mint, USDC_MINT);
  assert.deepEqual(reg.merchants, [m1.toBase58(), m2.toBase58()]);
  // a truncated list must not decode to a shorter allowlist than it claims
  assert.equal(decodeMerchantRegistry(buf.subarray(0, 120)), undefined);
  assert.equal(decodeMerchantRegistry(Buffer.alloc(10)), undefined);
});

test("pay_token refuses a missing payee or zero amount before any network call", async () => {
  const noPayee = await payTokenTool({ amount: 1_000_000 });
  assert.equal(noPayee.status, "error");
  assert.equal(noPayee.code, "PayeeRequired");

  const zero = await payTokenTool({ to: ROOT.toBase58(), amount: 0 });
  assert.equal(zero.status, "error");
  assert.equal(zero.code, "ZeroAmount");
});

test("pay_token never accepts secret-named fields", async () => {
  const r = await payTokenTool({
    to: ROOT.toBase58(),
    amount: 1,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...({ privateKey: "nope" } as any),
  });
  assert.equal(r.status, "error");
  assert.equal(r.code, "SecretFieldRejected");
});
