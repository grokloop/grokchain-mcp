/**
 * Marks for open positions.
 *
 * The exit ladder needs to answer "what is this worth right now?" — otherwise
 * +100% and -60% are unenforceable. Both venues are constant-product, so both
 * marks come from reserves rather than from any price feed.
 *
 *   bonding curve : virtual_sol_reserves / virtual_token_reserves
 *   PumpSwap AMM  : pool quote balance / pool base balance
 *
 * These are PRE-FEE marks, deliberately. pump.fun takes a fee that varies by
 * fee config, so a mark that pretended to be a fill quote would be wrong in a
 * direction that flatters us. Use these to decide WHETHER to exit; use the
 * venue's own `min_quote_amount_out` / `max_sol_cost` to bound the fill itself.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { WSOL_MINT } from "./constants.js";
import { decodePool, poolPda } from "./pump_amm_accounts.js";
import { bondingCurvePda, decodeBondingCurveFull } from "./venue.js";

const LAMPORTS = 1_000_000_000n;

/**
 * Divide rounding UP. Both quote functions round the remaining reserve up, which
 * makes the output smaller — the mark errs against us. For an exit ladder that is
 * the safe direction: never overstate what a position will fetch. Flooring here
 * instead lets a buy-then-sell round trip come back a lamport richer.
 */
function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

export type Mark = {
  venue: "curve" | "amm";
  /** Lamports of SOL per one whole token, as a decimal string. */
  priceSolPerToken: string;
  /** What `amount` base units would fetch right now, ignoring fees. */
  quoteLamports: string;
  source: string;
};

/** Constant product: tokens in -> quote out. */
export function quoteOutForTokensIn(
  baseReserve: bigint,
  quoteReserve: bigint,
  tokensIn: bigint,
): bigint {
  if (tokensIn <= 0n || baseReserve <= 0n || quoteReserve <= 0n) return 0n;
  const k = baseReserve * quoteReserve;
  const newBase = baseReserve + tokensIn;
  const newQuote = ceilDiv(k, newBase);
  return quoteReserve > newQuote ? quoteReserve - newQuote : 0n;
}

/** Constant product: quote in -> tokens out. */
export function tokensOutForQuoteIn(
  baseReserve: bigint,
  quoteReserve: bigint,
  quoteIn: bigint,
): bigint {
  if (quoteIn <= 0n || baseReserve <= 0n || quoteReserve <= 0n) return 0n;
  const k = baseReserve * quoteReserve;
  const newQuote = quoteReserve + quoteIn;
  const newBase = ceilDiv(k, newQuote);
  return baseReserve > newBase ? baseReserve - newBase : 0n;
}

/** Price of one whole token in SOL, given raw reserves and the mint's decimals. */
export function pricePerWholeToken(
  baseReserve: bigint,
  quoteReserve: bigint,
  decimals: number,
): string {
  if (baseReserve <= 0n) return "0";
  const oneToken = 10n ** BigInt(decimals);
  // quote lamports for one whole token, at the margin
  const lamports = (quoteReserve * oneToken) / baseReserve;
  const whole = lamports / LAMPORTS;
  const frac = (lamports % LAMPORTS).toString().padStart(9, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/**
 * Mark a holding. Returns undefined when the venue cannot be read, rather than
 * guessing a price — a wrong mark silently mis-triggers the ladder.
 */
export async function markPosition(opts: {
  connection: Connection;
  mint: PublicKey;
  amountRaw: bigint;
  decimals: number;
}): Promise<Mark | undefined> {
  const { connection, mint, amountRaw, decimals } = opts;

  // Bonding curve first: if it exists and is live, that is where the coin trades.
  const [curve] = bondingCurvePda(mint);
  const curveInfo = await connection.getAccountInfo(curve, "confirmed");
  if (curveInfo) {
    const bc = decodeBondingCurveFull(Buffer.from(curveInfo.data));
    if (bc && !bc.complete) {
      return {
        venue: "curve",
        priceSolPerToken: pricePerWholeToken(
          bc.virtualTokenReserves,
          bc.virtualSolReserves,
          decimals,
        ),
        quoteLamports: quoteOutForTokensIn(
          bc.virtualTokenReserves,
          bc.virtualSolReserves,
          amountRaw,
        ).toString(),
        source: `bonding curve ${curve.toBase58()} (virtual reserves)`,
      };
    }
  }

  // Graduated: read the pool's own token balances.
  const pool = poolPda(mint, new PublicKey(WSOL_MINT));
  const poolInfo = await connection.getAccountInfo(pool, "confirmed");
  if (!poolInfo) return undefined;
  const decoded = decodePool(Buffer.from(poolInfo.data));
  if (!decoded) return undefined;

  const [baseBal, quoteBal] = await Promise.all([
    connection.getTokenAccountBalance(new PublicKey(decoded.poolBaseTokenAccount)),
    connection.getTokenAccountBalance(new PublicKey(decoded.poolQuoteTokenAccount)),
  ]);
  const baseReserve = BigInt(baseBal.value.amount);
  const quoteReserve = BigInt(quoteBal.value.amount);
  if (baseReserve <= 0n || quoteReserve <= 0n) return undefined;

  return {
    venue: "amm",
    priceSolPerToken: pricePerWholeToken(baseReserve, quoteReserve, decimals),
    quoteLamports: quoteOutForTokensIn(baseReserve, quoteReserve, amountRaw).toString(),
    source: `pool ${pool.toBase58()} (live reserves)`,
  };
}
