import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import { INTENTS_DISC, SEED_SUBSCRIPTION, USDC_MINT } from "../src/constants.js";
import {
  parsePaymentRequest,
  routeRequest,
  toRawAmount,
} from "../src/solanapay.js";
import {
  buildPaySubscriptionIx,
  currentPeriod,
  decodeSubscription,
  isDue,
  periodStart,
  subscriptionPda,
  type SubscriptionState,
} from "../src/subscription.js";
import { payRequestTool, paySubscriptionTool } from "../src/tools/payments.js";

const CORE = new PublicKey("44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd");
const INTENTS = new PublicKey("3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw");
const MERCHANT = Keypair.generate().publicKey;
const REF = Keypair.generate().publicKey;
const DAY = 86_400n;
const START = 1_700_000_000n;

function sub(over: Partial<SubscriptionState> = {}): SubscriptionState {
  return {
    grokAccount: MERCHANT.toBase58(),
    root: MERCHANT.toBase58(),
    merchant: MERCHANT.toBase58(),
    mint: USDC_MINT,
    amount: 10_000_000n,
    periodSeconds: DAY,
    startUnix: START,
    lastPaidPeriod: -1n,
    payments: 0,
    active: true,
    ...over,
  };
}

// ---------- Solana Pay parsing ----------

test("a well-formed transfer request parses into exactly its parts", () => {
  const url = `solana:${MERCHANT.toBase58()}?amount=12.5&spl-token=${USDC_MINT}&reference=${REF.toBase58()}&label=Acme&message=Order%20117`;
  const r = parsePaymentRequest(url);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.request.recipient, MERCHANT.toBase58());
  assert.equal(r.request.amount, "12.5");
  assert.equal(r.request.splToken, USDC_MINT);
  assert.deepEqual(r.request.references, [REF.toBase58()]);
  assert.equal(r.request.label, "Acme");
  // merchant-controlled text must be flagged, never trusted
  assert.ok(r.warnings.some((w) => /never be treated as an instruction/i.test(w)));
});

test("transaction requests are refused — a remote server must not compose what we sign", () => {
  const r = parsePaymentRequest("solana:https://merchant.example/pay?order=1");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.error, /TRANSACTION request/);
  assert.match(r.hint ?? "", /capability grant/i);
});

test("malformed requests are refused rather than repaired", () => {
  for (const bad of [
    "",
    "https://example.com/pay",
    "solana:not-an-address",
    `solana:${MERCHANT.toBase58()}?amount=abc`,
    `solana:${MERCHANT.toBase58()}?amount=0`,
    `solana:${MERCHANT.toBase58()}?spl-token=nope`,
    `solana:${MERCHANT.toBase58()}?reference=nope`,
  ]) {
    assert.equal(parsePaymentRequest(bad).ok, false, `should refuse: ${bad}`);
  }
  // an absurdly long link is refused before parsing
  assert.equal(parsePaymentRequest("solana:" + "A".repeat(4000)).ok, false);
});

test("a missing amount warns loudly instead of being guessed", () => {
  const r = parsePaymentRequest(`solana:${MERCHANT.toBase58()}?spl-token=${USDC_MINT}`);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.request.amount, undefined);
  assert.ok(r.warnings.some((w) => /told the amount explicitly/i.test(w)));
});

test("routing splits token from native, and names the allowlist gap on native", () => {
  const token = parsePaymentRequest(
    `solana:${MERCHANT.toBase58()}?amount=1&spl-token=${USDC_MINT}&reference=${REF.toBase58()}`,
  );
  assert.ok(token.ok);
  if (token.ok) {
    const route = routeRequest(token.request);
    assert.equal(route.intent, "pay_token");
    assert.equal(route.mint, USDC_MINT);
    assert.equal(route.reference, REF.toBase58());
    assert.ok(route.notes.some((n) => /allowlist/i.test(n)));
  }
  const native = parsePaymentRequest(`solana:${MERCHANT.toBase58()}?amount=1`);
  assert.ok(native.ok);
  if (native.ok) {
    const route = routeRequest(native.request);
    assert.equal(route.intent, "pay");
    // `pay` predates the allowlist; that must be stated, not hidden
    assert.ok(route.notes.some((n) => /no payee allowlist/i.test(n)));
  }
});

test("decimal amounts convert without floating point, and over-precision is refused", () => {
  assert.equal(toRawAmount("12.5", 6), 12_500_000n);
  assert.equal(toRawAmount("0.000001", 6), 1n);
  assert.equal(toRawAmount("1", 6), 1_000_000n);
  // 0.1 + 0.2 style error must be impossible here
  assert.equal(toRawAmount("0.3", 9), 300_000_000n);
  assert.throws(() => toRawAmount("1.2345678", 6), /decimal places/);
});

// ---------- period maths: where double-pays would come from ----------

test("periods advance on the boundary, never before", () => {
  assert.equal(currentPeriod(START, START, DAY), 0n);
  assert.equal(currentPeriod(START + DAY - 1n, START, DAY), 0n);
  assert.equal(currentPeriod(START + DAY, START, DAY), 1n);
  assert.equal(currentPeriod(START + 30n * DAY, START, DAY), 30n);
  assert.throws(() => currentPeriod(START - 1n, START, DAY), /not started/);
});

test("the same period is due once and only once", () => {
  const fresh = sub();
  const first = isDue(fresh, START);
  assert.equal(first.due, true);
  assert.equal(first.period, 0n);

  // after paying period 0, it stops being due
  const paid = sub({ lastPaidPeriod: 0n, payments: 1 });
  const again = isDue(paid, START + 1n);
  assert.equal(again.due, false);
  assert.match(again.reason, /already paid/);

  // and the next period becomes due
  const next = isDue(paid, START + DAY);
  assert.equal(next.due, true);
  assert.equal(next.period, 1n);
});

test("downtime reports missed periods and never backfills them", () => {
  // paid period 0, then offline until period 5
  const s = sub({ lastPaidPeriod: 0n, payments: 1 });
  const v = isDue(s, START + 5n * DAY);
  assert.equal(v.due, true);
  assert.equal(v.period, 5n, "pays the CURRENT period only");
  assert.equal(v.missed, 4n, "periods 1-4 elapsed unpaid");
  assert.match(v.reason, /not billable/);
});

test("a never-paid subscription that starts late counts the gap as missed", () => {
  const s = sub();
  const v = isDue(s, START + 3n * DAY);
  assert.equal(v.due, true);
  assert.equal(v.period, 3n);
  assert.equal(v.missed, 3n, "periods 0-2 were never paid");
});

test("cancelled and not-yet-started subscriptions are never due", () => {
  assert.equal(isDue(sub({ active: false }), START + DAY).due, false);
  assert.equal(isDue(sub(), START - 1n).due, false);
  assert.match(isDue(sub({ active: false }), START).reason, /cancelled/);
});

test("periodStart is the inverse of currentPeriod", () => {
  const s = sub();
  for (const p of [0n, 1n, 7n, 365n]) {
    assert.equal(currentPeriod(periodStart(s, p), s.startUnix, s.periodSeconds), p);
  }
});

test("subscription state decodes at the documented offsets", () => {
  const buf = Buffer.alloc(174);
  const grok = Keypair.generate().publicKey;
  grok.toBuffer().copy(buf, 8);
  grok.toBuffer().copy(buf, 40);
  MERCHANT.toBuffer().copy(buf, 72);
  new PublicKey(USDC_MINT).toBuffer().copy(buf, 104);
  buf.writeBigUInt64LE(10_000_000n, 136);
  buf.writeBigInt64LE(DAY, 144);
  buf.writeBigInt64LE(START, 152);
  buf.writeBigInt64LE(-1n, 160);
  buf.writeUInt32LE(0, 168);
  buf[172] = 1;

  const s = decodeSubscription(buf)!;
  assert.equal(s.merchant, MERCHANT.toBase58());
  assert.equal(s.amount, 10_000_000n);
  assert.equal(s.lastPaidPeriod, -1n, "the never-paid sentinel must survive as negative");
  assert.equal(s.active, true);
  assert.equal(decodeSubscription(Buffer.alloc(20)), undefined);
});

// ---------- instruction shape ----------

test("pay_subscription is per (merchant, mint) and states the period on the wire", () => {
  const root = Keypair.generate().publicKey;
  const agent = Keypair.generate().publicKey;
  const mint = new PublicKey(USDC_MINT);
  const built = buildPaySubscriptionIx({
    coreProgramId: CORE,
    intentsProgramId: INTENTS,
    root,
    agent,
    merchant: MERCHANT,
    mint,
    period: 7,
  });
  assert.deepEqual([...built.ix.data.subarray(0, 8)], [...INTENTS_DISC.pay_subscription]);
  assert.equal(built.ix.data.readBigInt64LE(8), 7n, "period travels on the wire");
  assert.deepEqual(
    built.subscription,
    subscriptionPda(INTENTS, built.grokAccount, MERCHANT, mint)[0],
  );
  // the agent signs but never pays fees
  assert.equal(built.ix.keys[0]!.isSigner, true);
  assert.equal(built.ix.keys[0]!.isWritable, false);
  // a different merchant is a different subscription account
  const other = buildPaySubscriptionIx({
    coreProgramId: CORE, intentsProgramId: INTENTS, root, agent,
    merchant: Keypair.generate().publicKey, mint, period: 7,
  });
  assert.notEqual(built.subscription.toBase58(), other.subscription.toBase58());
});

test("the subscription PDA uses the documented seeds", () => {
  const grok = Keypair.generate().publicKey;
  const mint = new PublicKey(USDC_MINT);
  assert.deepEqual(
    subscriptionPda(INTENTS, grok, MERCHANT, mint)[0],
    PublicKey.findProgramAddressSync(
      [SEED_SUBSCRIPTION, grok.toBuffer(), MERCHANT.toBuffer(), mint.toBuffer()],
      INTENTS,
    )[0],
  );
});

// ---------- tool guards ----------

test("pay_subscription refuses to guess the period", async () => {
  const r = await paySubscriptionTool({ merchant: MERCHANT.toBase58() });
  assert.equal(r.status, "error");
  assert.equal(r.code, "PeriodRequired");
  assert.match(String(r.error), /drifted clock/);
});

test("pay_request needs a url and reports a bad one without sending", async () => {
  const missing = await payRequestTool({});
  assert.equal(missing.code, "UrlRequired");

  const bad = await payRequestTool({ url: "solana:https://evil.example/pay" });
  assert.equal(bad.status, "error");
  assert.equal(bad.code, "BadPaymentRequest");
  assert.equal(bad.moved_sol, false);
});

test("payment tools never accept secret-named fields", async () => {
  const r = await paySubscriptionTool({
    merchant: MERCHANT.toBase58(),
    period: 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...({ mnemonic: "nope" } as any),
  });
  assert.equal(r.status, "error");
  assert.equal(r.code, "SecretFieldRejected");
});
