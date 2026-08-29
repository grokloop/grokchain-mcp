/**
 * End-to-end: a bot buying something, with no wallet of its own.
 *
 * The unit tests prove each piece. This proves they compose into the actual
 * journey — merchant link in, signed instruction out — and that the guarantees
 * survive the whole walk rather than only holding in isolation.
 *
 * Nothing here touches the network. Every address is derived, so the assertions
 * are about structure, which is exactly where a payment bug would hide.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import { INTENTS_DISC, TOKEN_PROGRAM_ID, USDC_MINT } from "../src/constants.js";
import { deriveIntentsAddrs } from "../src/intents.js";
import { buildPayTokenIx, merchantRegistryPda } from "../src/paytoken.js";
import { ataFor } from "../src/pump_amm_accounts.js";
import { parsePaymentRequest, routeRequest, toRawAmount } from "../src/solanapay.js";
import {
  buildCreateSubscriptionIx,
  buildPaySubscriptionIx,
  isDue,
  subscriptionPda,
  type SubscriptionState,
} from "../src/subscription.js";

const CORE = new PublicKey("44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd");
const INTENTS = new PublicKey("3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw");
const USDC = new PublicKey(USDC_MINT);
const TOK = new PublicKey(TOKEN_PROGRAM_ID);

// The human's wallet. The only key that can fund, allowlist, or withdraw.
const ROOT = Keypair.generate().publicKey;
// The bot's identity. Signs intents; holds nothing.
const AGENT = Keypair.generate().publicKey;
// Pays fees so the agent never needs a lamport.
const RELAYER = Keypair.generate().publicKey;
// A shop.
const MERCHANT = Keypair.generate().publicKey;

test("a bot buys a $12.50 item from a checkout link without holding a wallet", () => {
  // 1. The shop hands over a Solana Pay link. This is untrusted input.
  const invoice = Keypair.generate().publicKey;
  const link =
    `solana:${MERCHANT.toBase58()}?amount=12.5&spl-token=${USDC_MINT}` +
    `&reference=${invoice.toBase58()}&label=Acme%20Store&message=Order%20117`;

  const parsed = parsePaymentRequest(link);
  assert.ok(parsed.ok, "the link parses");
  if (!parsed.ok) return;

  // 2. Routing decides the intent. A token request must reach the allowlisted path.
  const route = routeRequest(parsed.request);
  assert.equal(route.intent, "pay_token");
  assert.equal(route.recipient, MERCHANT.toBase58());
  assert.equal(route.reference, invoice.toBase58());

  // 3. The decimal amount becomes raw units with no floating point anywhere.
  const amount = toRawAmount(parsed.request.amount!, 6);
  assert.equal(amount, 12_500_000n);

  // 4. Build the payment.
  const built = buildPayTokenIx({
    coreProgramId: CORE,
    intentsProgramId: INTENTS,
    root: ROOT,
    agent: AGENT,
    mint: USDC,
    destinationOwner: new PublicKey(route.recipient),
    amount,
    decimals: 6,
    reference: new PublicKey(route.reference!),
    feePayer: RELAYER,
  });

  // --- the guarantees that matter, asserted on the built instruction ---

  // The bot has no wallet: it signs, and is never writable, so it can never be
  // the fee payer and never a lamport source.
  const agentMeta = built.ix.keys[0]!;
  assert.equal(agentMeta.pubkey.toBase58(), AGENT.toBase58());
  assert.equal(agentMeta.isSigner, true);
  assert.equal(agentMeta.isWritable, false);

  // The relayer is the only writable signer — it pays the fee.
  const relayerMeta = built.ix.keys.find((k) => k.pubkey.equals(RELAYER))!;
  assert.equal(relayerMeta.isSigner, true);
  assert.equal(relayerMeta.isWritable, true);

  // Money leaves custody the bot cannot withdraw from...
  assert.equal(built.source.toBase58(), ataFor(built.pumpTrader, USDC, TOK).toBase58());
  // ...and lands on an account derived from the MERCHANT'S OWN wallet, so a
  // malicious link cannot name a token account belonging to someone else.
  assert.equal(built.destination.toBase58(), ataFor(MERCHANT, USDC, TOK).toBase58());

  // The allowlist the program will check is this vault's, not one the caller chose.
  assert.deepEqual(
    built.merchantRegistry,
    merchantRegistryPda(INTENTS, built.grokAccount)[0],
  );

  // The invoice reference rides along read-only: it identifies, never authorises.
  const refMeta = built.ix.keys.find((k) => k.pubkey.equals(invoice))!;
  assert.equal(refMeta.isSigner, false);
  assert.equal(refMeta.isWritable, false);

  // It is a pay_token, aimed at INTENTS, carrying the exact amount.
  assert.equal(built.ix.programId.toBase58(), INTENTS.toBase58());
  assert.deepEqual([...built.ix.data.subarray(0, 8)], [...INTENTS_DISC.pay_token]);
  assert.equal(built.ix.data.readBigUInt64LE(8), 12_500_000n);
  assert.equal(built.ix.data[16], 6, "decimals travel for TransferChecked");
});

test("a hostile link cannot redirect the money", () => {
  const attacker = Keypair.generate().publicKey;

  // A page claiming to be the shop, but naming its own address.
  const evil = parsePaymentRequest(
    `solana:${attacker.toBase58()}?amount=999&spl-token=${USDC_MINT}&label=Acme%20Store`,
  );
  assert.ok(evil.ok);
  if (!evil.ok) return;

  // The label is a lie and the parser says so rather than trusting it.
  assert.equal(evil.request.label, "Acme Store");
  assert.ok(evil.warnings.some((w) => /never be treated as an instruction/i.test(w)));

  // Routing still points at the attacker - the parser does not launder intent.
  // What stops the payment is the on-chain allowlist, which only the root edits,
  // and which this address is not on.
  assert.equal(routeRequest(evil.request).recipient, attacker.toBase58());

  // And a transaction request - "let our server build what you sign" - is refused
  // outright, since that is precisely what a capability grant exists to prevent.
  const remote = parsePaymentRequest("solana:https://acme.example/pay?order=117");
  assert.equal(remote.ok, false);
});

test("a monthly subscription bills once per period and cannot be double-charged", () => {
  const DAY = 86_400n;
  const MONTH = 30n * DAY;
  const START = 1_700_000_000n;

  // The human sets it up. The bot cannot create or widen this.
  const created = buildCreateSubscriptionIx({
    coreProgramId: CORE,
    intentsProgramId: INTENTS,
    root: ROOT,
    merchant: MERCHANT,
    mint: USDC,
    amount: 9_990_000, // $9.99
    periodSeconds: MONTH,
    startUnix: START,
  });
  assert.equal(created.ix.keys[0]!.isSigner, true, "root signs the setup");
  assert.ok(!created.ix.keys.some((k) => k.pubkey.equals(AGENT)), "the agent is absent");

  const sub: SubscriptionState = {
    grokAccount: created.grokAccount.toBase58(),
    root: ROOT.toBase58(),
    merchant: MERCHANT.toBase58(),
    mint: USDC_MINT,
    amount: 9_990_000n,
    periodSeconds: MONTH,
    startUnix: START,
    lastPaidPeriod: -1n,
    payments: 0,
    active: true,
  };

  // Month 0: due.
  const first = isDue(sub, START);
  assert.equal(first.due, true);
  assert.equal(first.period, 0n);

  // The bot settles it, naming the period so a drifted clock fails loudly.
  const paid = buildPaySubscriptionIx({
    coreProgramId: CORE,
    intentsProgramId: INTENTS,
    root: ROOT,
    agent: AGENT,
    merchant: MERCHANT,
    mint: USDC,
    period: first.period!,
    feePayer: RELAYER,
  });
  assert.deepEqual(
    paid.subscription,
    subscriptionPda(INTENTS, created.grokAccount, MERCHANT, USDC)[0],
  );
  assert.equal(paid.ix.data.readBigInt64LE(8), 0n, "period travels on the wire");
  assert.equal(paid.ix.keys[0]!.isWritable, false, "agent still holds nothing");

  // Same month again: not due. On chain the retry would also fail, because
  // last_paid_period advanced in the same transaction that moved the money.
  const after = { ...sub, lastPaidPeriod: 0n, payments: 1 };
  const repeat = isDue(after, START + DAY);
  assert.equal(repeat.due, false);
  assert.match(repeat.reason, /already paid/);

  // Next month: due again, exactly once.
  const next = isDue(after, START + MONTH);
  assert.equal(next.due, true);
  assert.equal(next.period, 1n);

  // Offline for three months: it pays the CURRENT month and reports the gap,
  // rather than waking up and firing three charges.
  const late = isDue(after, START + 4n * MONTH);
  assert.equal(late.period, 4n);
  assert.equal(late.missed, 3n);

  // Cancelled by the human: nothing is ever due again, and the merchant has no
  // say in it.
  assert.equal(isDue({ ...after, active: false }, START + MONTH).due, false);
});

test("every payment in the journey is scoped to one vault", () => {
  // Two humans, same merchant and mint: nothing is shared.
  const other = Keypair.generate().publicKey;
  const a = deriveIntentsAddrs({ coreProgramId: CORE, intentsProgramId: INTENTS, root: ROOT });
  const b = deriveIntentsAddrs({ coreProgramId: CORE, intentsProgramId: INTENTS, root: other });

  assert.notEqual(a.grokAccount.toBase58(), b.grokAccount.toBase58());
  assert.notEqual(a.pumpTrader.toBase58(), b.pumpTrader.toBase58());
  assert.notEqual(
    merchantRegistryPda(INTENTS, a.grokAccount)[0].toBase58(),
    merchantRegistryPda(INTENTS, b.grokAccount)[0].toBase58(),
    "one human's allowlist can never authorise another's payments",
  );
  assert.notEqual(
    subscriptionPda(INTENTS, a.grokAccount, MERCHANT, USDC)[0].toBase58(),
    subscriptionPda(INTENTS, b.grokAccount, MERCHANT, USDC)[0].toBase58(),
  );
});
