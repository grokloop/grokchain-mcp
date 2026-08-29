import assert from "node:assert/strict";
import { test } from "node:test";
import { PublicKey } from "@solana/web3.js";
import {
  BONDING_CURVE_DISCRIMINATOR,
  GROK_TOKEN_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "../src/constants.js";
import {
  pricePerWholeToken,
  quoteOutForTokensIn,
  tokensOutForQuoteIn,
} from "../src/pricing.js";
import { curveProgress, decodeBondingCurveFull } from "../src/venue.js";

/** Reserves shaped like a real early pump.fun curve. */
function curveBytes(over: Partial<Record<string, bigint | boolean>> = {}): Buffer {
  const b = Buffer.alloc(151);
  BONDING_CURVE_DISCRIMINATOR.copy(b, 0);
  b.writeBigUInt64LE((over.vtok as bigint) ?? 1_073_000_000_000_000n, 8);
  b.writeBigUInt64LE((over.vsol as bigint) ?? 30_000_000_000n, 16);
  b.writeBigUInt64LE((over.rtok as bigint) ?? 793_100_000_000_000n, 24);
  b.writeBigUInt64LE((over.rsol as bigint) ?? 0n, 32);
  b.writeBigUInt64LE(1_000_000_000_000_000n, 40);
  b[48] = over.complete ? 1 : 0;
  new PublicKey(GROK_TOKEN_MINT).toBuffer().copy(b, 49);
  return b;
}

test("constant product moves the right way and never returns more than the reserve", () => {
  const base = 1_000_000n, quote = 1_000_000n;
  // selling more tokens yields more quote, but with diminishing returns
  const a = quoteOutForTokensIn(base, quote, 1_000n);
  const b = quoteOutForTokensIn(base, quote, 10_000n);
  assert.ok(b > a, "more in => more out");
  assert.ok(b < a * 10n, "slippage: 10x size is worth less than 10x proceeds");
  // can never drain the pool
  // integer maths floors an absurd size to exactly the reserve; it must never exceed it
  assert.ok(quoteOutForTokensIn(base, quote, 10n ** 18n) <= quote);
  // degenerate inputs are zero, not NaN or a throw
  assert.equal(quoteOutForTokensIn(base, quote, 0n), 0n);
  assert.equal(quoteOutForTokensIn(0n, quote, 100n), 0n);
  assert.equal(tokensOutForQuoteIn(base, 0n, 100n), 0n);
});

test("a buy then an immediate sell loses value (no free round trip)", () => {
  const base = 5_000_000_000n, quote = 40_000_000_000n;
  const bought = tokensOutForQuoteIn(base, quote, 1_000_000_000n);
  // sell straight back into the moved pool
  const back = quoteOutForTokensIn(base - bought, quote + 1_000_000_000n, bought);
  assert.ok(back <= 1_000_000_000n, "round trip must not mint value");
});

test("price per whole token respects decimals", () => {
  // 1e9 base units at 6dp = 1000 whole tokens; 30 SOL across them = 0.03 each
  assert.equal(pricePerWholeToken(1_000_000_000n, 30_000_000_000n, 6), "0.03");
  // same reserves at 9dp = 1 whole token, so the whole 30 SOL is one token
  assert.equal(pricePerWholeToken(1_000_000_000n, 30_000_000_000n, 9), "30");
  assert.equal(pricePerWholeToken(0n, 1n, 6), "0", "empty reserve must not divide by zero");
});

test("full curve decode reads the reserve fields", () => {
  const s = decodeBondingCurveFull(curveBytes())!;
  assert.equal(s.virtualSolReserves, 30_000_000_000n);
  assert.equal(s.virtualTokenReserves, 1_073_000_000_000_000n);
  assert.equal(s.complete, false);
  assert.equal(s.creator, GROK_TOKEN_MINT);
  assert.equal(decodeBondingCurveFull(Buffer.alloc(151)), undefined, "foreign bytes must not decode");
});

test("curve progress rises with real SOL and pins at 1 when complete", () => {
  assert.equal(curveProgress(decodeBondingCurveFull(curveBytes())!), 0);
  const half = decodeBondingCurveFull(curveBytes({ rsol: 30_000_000_000n }))!;
  assert.ok(Math.abs(curveProgress(half) - 0.5) < 0.001);
  assert.equal(curveProgress(decodeBondingCurveFull(curveBytes({ complete: true }))!), 1);
});

test("both token programs are distinct and both must be queried", () => {
  // A reader that only knows the classic program reports an empty book while
  // the desk is holding a Token-2022 bag.
  assert.notEqual(TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID);
  assert.equal(TOKEN_2022_PROGRAM_ID, "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
});
