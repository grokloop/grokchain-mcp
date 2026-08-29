/**
 * "What do I hold?" for the pump-trader.
 *
 * The exit ladder cannot run without this: to sell 50% at +100% the desk has to
 * know the position exists, how many base units it is, and what it is worth.
 *
 * One gotcha this exists to absorb: token accounts live under TWO programs.
 * $GrokChain is Token-2022, so a reader that only queries the classic Token
 * program reports an empty book while the desk is holding 134k tokens. Both are
 * always queried.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, WSOL_MINT } from "./constants.js";
import { markPosition, type Mark } from "./pricing.js";

export type Position = {
  mint: string;
  tokenAccount: string;
  tokenProgram: string;
  /** Raw base units, as a string — never a JS number. */
  amountRaw: string;
  amountUi: string;
  decimals: number;
  mark?: Mark;
  /** Mark value of the whole holding in SOL, decimal string. */
  valueSol?: string;
  note?: string;
};

export type Book = {
  owner: string;
  nativeLamports: string;
  nativeSol: string;
  positions: Position[];
  totalPositionValueSol: string;
  notes: string[];
};

function lamportsToSol(l: bigint): string {
  const whole = l / 1_000_000_000n;
  const frac = (l % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/**
 * Read the trader's whole book. `withMarks` costs several RPC calls per mint, so
 * it is opt-in: a bot polling for the ladder wants marks, a status page does not.
 */
export async function readBook(opts: {
  connection: Connection;
  owner: PublicKey;
  withMarks?: boolean;
  includeDust?: boolean;
}): Promise<Book> {
  const { connection, owner } = opts;
  const notes: string[] = [];

  const lamports = BigInt(await connection.getBalance(owner, "confirmed"));

  const programs = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
  const found = await Promise.all(
    programs.map((p) =>
      connection.getParsedTokenAccountsByOwner(owner, { programId: new PublicKey(p) }),
    ),
  );

  const positions: Position[] = [];
  for (let i = 0; i < programs.length; i++) {
    for (const { pubkey, account } of found[i]!.value) {
      const info = (account.data as { parsed: { info: Record<string, unknown> } }).parsed
        .info as {
        mint: string;
        tokenAmount: { amount: string; decimals: number; uiAmountString: string };
      };
      const raw = BigInt(info.tokenAmount.amount);
      // A zero-balance ATA is rent the desk already paid; report it only on request
      // so it can be reclaimed, but never treat it as a position.
      if (raw === 0n && !opts.includeDust) continue;
      if (info.mint === WSOL_MINT) {
        notes.push(
          `wSOL account ${pubkey.toBase58()} holds ${info.tokenAmount.uiAmountString} — quote left over from a trade, not a position.`,
        );
        continue;
      }
      positions.push({
        mint: info.mint,
        tokenAccount: pubkey.toBase58(),
        tokenProgram: programs[i]!,
        amountRaw: info.tokenAmount.amount,
        amountUi: info.tokenAmount.uiAmountString,
        decimals: info.tokenAmount.decimals,
      });
    }
  }

  let total = 0n;
  if (opts.withMarks) {
    for (const p of positions) {
      try {
        const mark = await markPosition({
          connection,
          mint: new PublicKey(p.mint),
          amountRaw: BigInt(p.amountRaw),
          decimals: p.decimals,
        });
        if (mark) {
          p.mark = mark;
          p.valueSol = lamportsToSol(BigInt(mark.quoteLamports));
          total += BigInt(mark.quoteLamports);
        } else {
          p.note = "no readable venue for this mint — cannot mark, so the ladder must not act on it";
        }
      } catch (e) {
        p.note = `mark failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
  }

  if (positions.some((p) => !p.mark) && opts.withMarks) {
    notes.push("Some positions could not be marked. Treat those as unpriced, not as zero.");
  }

  return {
    owner: owner.toBase58(),
    nativeLamports: lamports.toString(),
    nativeSol: lamportsToSol(lamports),
    positions,
    totalPositionValueSol: lamportsToSol(total),
    notes,
  };
}
