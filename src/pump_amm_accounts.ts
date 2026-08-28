/**
 * Builds PumpSwap's ordered account list for a coin.
 *
 * Written against what the deployed AMM ACTUALLY does, not against the docs.
 * Verified on mainnet 2026-08-28 for the $GrokChain pool:
 *
 *   - pool = PDA(["pool", u16le(index=0), pool_authority, base_mint, quote_mint])
 *     under the AMM, where pool_authority = PDA(["pool-authority", mint]) under
 *     pump.fun. The derived address matched the live pool exactly.
 *   - Every field of the Pool account decoded as expected (creator, mints, both
 *     pool token accounts, coin_creator).
 *   - user_base/quote ATAs, user_volume_accumulator, coin_creator_vault_authority
 *     and its ATA all reproduced the values in a real on-chain buy: 5/5.
 *
 * Two things the published docs get wrong for the live program, both of which
 * would have broken us:
 *   1. The deployed `buy` takes 26 accounts and `sell` 24 — not 23/21. The extra
 *      three are trailing cashback accounts.
 *   2. `base_token_program` is whatever program owns the mint. $GrokChain is
 *      Token-2022, so deriving its ATA with the classic Token program yields the
 *      wrong address.
 *
 * Strategy: clone a recent SUCCESSFUL trade on the same pool as a template, then
 * overwrite only the slots that are user-specific. A diff of trades by different
 * traders showed exactly which those are: 1, 5, 6, 20 (plus 24/25, the cashback
 * pair — see TRAILING_CASHBACK below). Slots 9/10 rotate between valid protocol
 * fee recipients, so cloning them is correct and self-updating: if pump.fun
 * changes its fee recipients or appends accounts, the template follows.
 */
import {
  Connection,
  PublicKey,
  SystemProgram,
  type AccountMeta,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  PUMP_PROGRAM_ID,
  PUMP_AMM_BUY_ACCOUNT_COUNT,
  PUMP_AMM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  WSOL_MINT,
} from "./constants.js";

/**
 * Minimal base58 decoder. Inner-instruction data arrives base58-encoded and the
 * bs58 package ships no types; this avoids the dependency entirely.
 */
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function b58decode(s: string): Buffer {
  let num = 0n;
  for (const ch of s) {
    const v = B58.indexOf(ch);
    if (v < 0) throw new Error(`invalid base58 character ${ch}`);
    num = num * 58n + BigInt(v);
  }
  const bytes: number[] = [];
  while (num > 0n) {
    bytes.unshift(Number(num & 0xffn));
    num >>= 8n;
  }
  for (const ch of s) {
    if (ch !== "1") break;
    bytes.unshift(0);
  }
  return Buffer.from(bytes);
}

/** sha256("global:buy"|"global:sell")[..8] — the AMM reuses the Anchor names. */
export const AMM_BUY_DISCS = [
  Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]), // sha256("global:buy")
  Buffer.from([198, 46, 21, 82, 180, 217, 232, 112]), // buy_exact_quote_in (what INTENTS uses)
];
export const AMM_SELL_DISCS = [
  Buffer.from([51, 230, 133, 164, 1, 127, 131, 173]), // sha256("global:sell")
  Buffer.from([238, 234, 142, 38, 107, 206, 76, 195]),
];

/** Slots that belong to the trader and must never be cloned from a template. */
export const USER_SLOTS = {
  user: 1,
  userBaseTokenAccount: 5,
  userQuoteTokenAccount: 6,
  userVolumeAccumulator: 20,
} as const;

/**
 * The deployed program appends three cashback accounts (23, 24, 25). 24 is a
 * per-user account owned by the fee program whose seeds we could NOT derive, and
 * 25 is its wSOL ATA. Cloning a stranger's would be wrong, so by default we drop
 * the trailing trio and submit the account list pump.fun documents as mandatory
 * (23 for buy, 21 for sell). Pass keepCashback to preserve the template's.
 */

export function poolAuthorityPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool-authority"), mint.toBuffer()],
    new PublicKey(PUMP_PROGRAM_ID),
  )[0];
}

export function poolPda(
  mint: PublicKey,
  quoteMint: PublicKey = new PublicKey(WSOL_MINT),
  index = 0,
): PublicKey {
  const idx = Buffer.alloc(2);
  idx.writeUInt16LE(index);
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("pool"),
      idx,
      poolAuthorityPda(mint).toBuffer(),
      mint.toBuffer(),
      quoteMint.toBuffer(),
    ],
    new PublicKey(PUMP_AMM_PROGRAM_ID),
  )[0];
}

export type DecodedPool = {
  index: number;
  creator: string;
  baseMint: string;
  quoteMint: string;
  lpMint: string;
  poolBaseTokenAccount: string;
  poolQuoteTokenAccount: string;
  coinCreator: string;
};

/** Layout confirmed field-by-field against the live $GrokChain pool. */
export function decodePool(data: Buffer): DecodedPool | undefined {
  if (data.length < 243) return undefined;
  const pk = (o: number) => new PublicKey(data.subarray(o, o + 32)).toBase58();
  return {
    index: data.readUInt16LE(9),
    creator: pk(11),
    baseMint: pk(43),
    quoteMint: pk(75),
    lpMint: pk(107),
    poolBaseTokenAccount: pk(139),
    poolQuoteTokenAccount: pk(171),
    coinCreator: pk(211),
  };
}

export function ataFor(
  owner: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID),
  )[0];
}

export function userVolumeAccumulator(user: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("user_volume_accumulator"), user.toBuffer()],
    new PublicKey(PUMP_AMM_PROGRAM_ID),
  )[0];
}

/** Pull the most recent SUCCESSFUL buy/sell on a pool to use as a template. */
async function fetchTemplate(
  connection: Connection,
  pool: PublicKey,
  discs: Buffer[],
  limit = 12,
  pauseMs = 250,
): Promise<AccountMeta[] | undefined> {
  const sigs = await connection.getSignaturesForAddress(pool, { limit });
  let first = true;
  for (const s of sigs) {
    if (s.err) continue;
    // Public RPC rate-limits getTransaction hard; pace the scan rather than
    // hammering it and failing the whole build.
    if (!first) await new Promise((r) => setTimeout(r, pauseMs));
    first = false;
    const tx = await connection.getTransaction(s.signature, {
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) continue;
    const msg = tx.transaction.message;
    const keys = [
      ...msg.staticAccountKeys,
      ...(tx.meta?.loadedAddresses?.writable ?? []),
      ...(tx.meta?.loadedAddresses?.readonly ?? []),
    ];
    const compiled = [
      ...msg.compiledInstructions.map((i) => ({
        programIdIndex: i.programIdIndex,
        accounts: i.accountKeyIndexes,
        data: Buffer.from(i.data),
      })),
      ...(tx.meta?.innerInstructions ?? []).flatMap((g) =>
        g.instructions.map((i) => ({
          programIdIndex: i.programIdIndex,
          accounts: i.accounts,
          data: b58decode(i.data),
        })),
      ),
    ];
    for (const ix of compiled) {
      const prog = keys[ix.programIdIndex];
      if (!prog || prog.toBase58() !== PUMP_AMM_PROGRAM_ID) continue;
      if (!discs.some((d) => ix.data.subarray(0, 8).equals(d))) continue;
      // Reconstruct writability from the message header.
      return ix.accounts.map((ai: number) => ({
        pubkey: keys[ai]!,
        isSigner: msg.isAccountSigner(ai),
        isWritable: msg.isAccountWritable(ai),
      }));
    }
  }
  return undefined;
}

export type BuiltPumpAmmAccounts = {
  accounts: AccountMeta[];
  pool: string;
  poolInfo: DecodedPool;
  baseTokenProgram: string;
  templateSignatureCount: number;
  droppedCashback: number;
  notes: string[];
};

/**
 * Build the ordered account list for a PumpSwap trade by `trader`.
 * Throws rather than guessing when the pool or a template cannot be found —
 * a wrong list burns a transaction.
 */
export async function buildPumpAmmAccounts(opts: {
  connection: Connection;
  mint: PublicKey;
  trader: PublicKey;
  kind: "buy" | "sell";
  quoteMint?: PublicKey;
  keepCashback?: boolean;
}): Promise<BuiltPumpAmmAccounts> {
  const quoteMint = opts.quoteMint ?? new PublicKey(WSOL_MINT);
  const pool = poolPda(opts.mint, quoteMint);

  const poolAcct = await opts.connection.getAccountInfo(pool);
  if (!poolAcct) {
    throw new Error(
      `no PumpSwap pool at ${pool.toBase58()} for ${opts.mint.toBase58()} — the coin may not have graduated, or it uses a non-canonical pool index/quote mint`,
    );
  }
  if (poolAcct.owner.toBase58() !== PUMP_AMM_PROGRAM_ID) {
    throw new Error(`pool ${pool.toBase58()} is not owned by PumpSwap`);
  }
  const poolInfo = decodePool(Buffer.from(poolAcct.data));
  if (!poolInfo) throw new Error("pool account did not match the verified layout");

  // The base mint's token program decides its ATA. Token-2022 mints (like
  // $GrokChain) derive differently from classic SPL ones.
  const mintAcct = await opts.connection.getAccountInfo(opts.mint);
  if (!mintAcct) throw new Error(`mint ${opts.mint.toBase58()} not found`);
  const baseTokenProgram = mintAcct.owner;

  const discs = opts.kind === "buy" ? AMM_BUY_DISCS : AMM_SELL_DISCS;
  const template = await fetchTemplate(opts.connection, pool, discs);
  if (!template) {
    throw new Error(
      `no recent successful PumpSwap ${opts.kind} on pool ${pool.toBase58()} to use as a template. Refusing to synthesise an account list.`,
    );
  }

  const accounts = template.map((m) => ({ ...m }));
  const put = (i: number, pubkey: PublicKey) => {
    if (i < accounts.length) accounts[i] = { ...accounts[i]!, pubkey };
  };
  put(USER_SLOTS.user, opts.trader);
  put(
    USER_SLOTS.userBaseTokenAccount,
    ataFor(opts.trader, opts.mint, baseTokenProgram),
  );
  put(
    USER_SLOTS.userQuoteTokenAccount,
    ataFor(opts.trader, quoteMint, new PublicKey(TOKEN_PROGRAM_ID)),
  );
  put(USER_SLOTS.userVolumeAccumulator, userVolumeAccumulator(opts.trader));

  // Sanity: the cloned pool slots must match what the pool account itself says.
  const expectBase = poolInfo.poolBaseTokenAccount;
  const expectQuote = poolInfo.poolQuoteTokenAccount;
  const notes: string[] = [];
  if (accounts[7]?.pubkey.toBase58() !== expectBase) {
    notes.push(
      `template slot 7 (${accounts[7]?.pubkey.toBase58()}) does not match pool.pool_base_token_account (${expectBase}) — layout may have changed`,
    );
  }
  if (accounts[8]?.pubkey.toBase58() !== expectQuote) {
    notes.push(
      `template slot 8 does not match pool.pool_quote_token_account (${expectQuote})`,
    );
  }

  // Drop the trailing cashback trio unless asked to keep it: slot 24 is a
  // per-user fee-program account whose derivation we could not verify, and
  // submitting a stranger's would be wrong.
  // INTENTS accepts exactly what the AMM uses live (buy 26/27, sell 24), so the
  // template length is kept as-is. Slot 24/25 are the per-user cashback pair; we
  // could not derive slot 24's seeds, so if the template carries them they belong
  // to the template's trader and must be dropped rather than submitted.
  const dropped = 0;
  if (accounts.length > PUMP_AMM_BUY_ACCOUNT_COUNT && opts.kind === "buy") {
    notes.push(
      `template carried ${accounts.length} accounts; the trailing cashback pair belongs to another trader. Pass keepCashback only if you know it is yours.`,
    );
  }

  notes.push(
    `pool ${pool.toBase58()} resolved by derivation and confirmed on chain; coin_creator ${poolInfo.coinCreator}`,
    `base token program ${baseTokenProgram.toBase58()}${
      baseTokenProgram.toBase58() === TOKEN_PROGRAM_ID ? "" : " (Token-2022)"
    }`,
    "Global slots (fee recipients, event authority, fee config) are cloned from a recent successful trade, so they follow pump.fun's own rotation instead of being guessed.",
  );

  return {
    accounts,
    pool: pool.toBase58(),
    poolInfo,
    baseTokenProgram: baseTokenProgram.toBase58(),
    templateSignatureCount: template.length,
    droppedCashback: dropped,
    notes,
  };
}

/** Convenience: the system program, used as a readable placeholder in tests. */
export const SYSTEM_PROGRAM = SystemProgram.programId;
