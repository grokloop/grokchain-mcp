/**
 * Build the ordered create_v2 account list for a pump.fun launch.
 *
 * WHY THIS IS NOT A HARDCODED TABLE
 * INTENTS passes the writable/signer flags straight through from
 * remaining_accounts into the inner pump.fun instruction — it only forces the
 * mint and the user. Every other flag is whatever the client sent. Inventing
 * them from reading an IDL is how you burn a launch: the pubkeys pass the
 * program's PDA checks, pump.fun then rejects the instruction, and the mint
 * keypair is spent.
 *
 * So the flags come from a create_v2 that pump.fun itself already accepted. We
 * fetch a recent successful one as a template, keep its shape and flags, and
 * substitute the four accounts that are specific to a launch: the new mint, the
 * trader that pays, and the two per-mint PDAs derived from them. Every
 * substituted address is then re-derived independently and compared, so a bad
 * template cannot smuggle in an address we did not compute ourselves.
 *
 * If no template can be found, this throws. Same rule as the PumpSwap builder:
 * a wrong account list burns a transaction, so refusing is cheaper than
 * guessing.
 */
import { type AccountMeta, Connection, PublicKey } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MAYHEM_PROGRAM_ID,
  PUMP_CREATE_V2_ACCOUNT_COUNT,
  PUMP_CREATE_V2_ACCOUNT_COUNT_WITH_QUOTE,
  PUMP_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "./constants.js";

/** create_v2 anchor discriminator: sha256("global:create_v2")[..8]. */
export const PUMP_CREATE_V2_DISC = Buffer.from([
  0xd6, 0x90, 0x4c, 0xec, 0x5f, 0x8b, 0x31, 0xb4,
]);

/** Positions INTENTS pins. Mirrored from instructions/pump.rs. */
export const IDX_MINT = 0;
export const IDX_MINT_AUTHORITY = 1;
export const IDX_BONDING_CURVE = 2;
export const IDX_ASSOCIATED_BONDING_CURVE = 3;
export const IDX_GLOBAL = 4;
export const IDX_USER = 5;
export const IDX_SYSTEM = 6;
export const IDX_TOKEN_PROGRAM = 7;
export const IDX_ATA_PROGRAM = 8;
export const IDX_MAYHEM_PROGRAM = 9;
export const IDX_GLOBAL_PARAMS = 10;
export const IDX_SOL_VAULT = 11;
export const IDX_MAYHEM_STATE = 12;
export const IDX_MAYHEM_TOKEN_VAULT = 13;
export const IDX_EVENT_AUTHORITY = 14;
export const IDX_PUMP_PROGRAM = 15;

const pump = () => new PublicKey(PUMP_PROGRAM_ID);
const mayhem = () => new PublicKey(MAYHEM_PROGRAM_ID);
const t22 = () => new PublicKey(TOKEN_2022_PROGRAM_ID);
const ataProgram = () => new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID);

function pda(seeds: (Buffer | Uint8Array)[], programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

/** Token-2022 ATA. Note the token program in the seeds — classic SPL differs. */
export function ata2022(owner: PublicKey, mint: PublicKey): PublicKey {
  return pda([owner.toBuffer(), t22().toBuffer(), mint.toBuffer()], ataProgram());
}

export type CreateAddresses = {
  mintAuthority: PublicKey;
  bondingCurve: PublicKey;
  associatedBondingCurve: PublicKey;
  global: PublicKey;
  globalParams: PublicKey;
  solVault: PublicKey;
  mayhemState: PublicKey;
  mayhemTokenVault: PublicKey;
  eventAuthority: PublicKey;
};

/**
 * Every create_v2 PDA, derived exactly the way INTENTS re-derives them in
 * validate_pump_create_pdas. Kept as one function so the two lists cannot drift
 * apart silently.
 */
export function deriveCreateAddresses(mint: PublicKey): CreateAddresses {
  const bondingCurve = pda([Buffer.from("bonding-curve"), mint.toBuffer()], pump());
  const solVault = pda([Buffer.from("sol-vault")], mayhem());
  return {
    mintAuthority: pda([Buffer.from("mint-authority")], pump()),
    bondingCurve,
    associatedBondingCurve: ata2022(bondingCurve, mint),
    global: pda([Buffer.from("global")], pump()),
    globalParams: pda([Buffer.from("global-params")], mayhem()),
    solVault,
    mayhemState: pda([Buffer.from("mayhem-state"), mint.toBuffer()], mayhem()),
    mayhemTokenVault: ata2022(solVault, mint),
    eventAuthority: pda([Buffer.from("__event_authority")], pump()),
  };
}

function b58decode(s: string): Buffer {
  const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (const ch of s) {
    const i = A.indexOf(ch);
    if (i < 0) return Buffer.alloc(0);
    n = n * 58n + BigInt(i);
  }
  const out: number[] = [];
  while (n > 0n) {
    out.unshift(Number(n % 256n));
    n /= 256n;
  }
  for (const ch of s) {
    if (ch === "1") out.unshift(0);
    else break;
  }
  return Buffer.from(out);
}

/**
 * Most recent SUCCESSFUL create_v2 on pump.fun, as an account-shape template.
 * Paced deliberately: public RPC rate-limits getTransaction hard, and a burst
 * that trips the limiter looks identical to "no launches exist".
 */
export async function fetchCreateTemplate(
  connection: Connection,
  limit = 40,
  pauseMs = 300,
): Promise<{ accounts: AccountMeta[]; signature: string } | undefined> {
  const sigs = await connection.getSignaturesForAddress(pump(), { limit });
  let first = true;
  for (const s of sigs) {
    if (s.err) continue;
    if (!first) await new Promise((r) => setTimeout(r, pauseMs));
    first = false;
    let tx;
    try {
      tx = await connection.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
    } catch {
      continue;
    }
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
      if (!prog || prog.toBase58() !== PUMP_PROGRAM_ID) continue;
      if (!ix.data.subarray(0, 8).equals(PUMP_CREATE_V2_DISC)) continue;
      const n = ix.accounts.length;
      if (n !== PUMP_CREATE_V2_ACCOUNT_COUNT && n !== PUMP_CREATE_V2_ACCOUNT_COUNT_WITH_QUOTE) {
        continue;
      }
      return {
        signature: s.signature,
        accounts: ix.accounts.map((ai: number) => ({
          pubkey: keys[ai]!,
          isSigner: msg.isAccountSigner(ai),
          isWritable: msg.isAccountWritable(ai),
        })),
      };
    }
  }
  return undefined;
}

export type BuiltCreateAccounts = {
  accounts: AccountMeta[];
  addresses: CreateAddresses;
  templateSignature: string;
  notes: string[];
};

/**
 * The create_v2 account list for launching `mint`, paid by `trader`.
 *
 * The template supplies flags and the fixed accounts (programs, global config).
 * Everything mint- or trader-specific is replaced with a value derived here and
 * verified against the template's own shape, so the only thing inherited is
 * the part that is genuinely the same for every launch.
 */
export async function buildPumpCreateAccounts(opts: {
  connection: Connection;
  mint: PublicKey;
  trader: PublicKey;
  spendVault: PublicKey;
}): Promise<BuiltCreateAccounts> {
  const { connection, mint, trader, spendVault } = opts;
  if (trader.equals(spendVault)) {
    throw new Error("pump_create user must be the pump-trader PDA, never SpendVault");
  }

  const tpl = await fetchCreateTemplate(connection);
  if (!tpl) {
    throw new Error(
      "No recent pump.fun create_v2 found to use as an account template. " +
        "Refusing to guess the account flags — a wrong list burns the mint keypair " +
        "and the launch fee. Retry (public RPC rate-limits hard), or pass " +
        "remaining_accounts explicitly.",
    );
  }

  const a = deriveCreateAddresses(mint);
  const accounts = tpl.accounts.map((m) => ({ ...m }));
  const notes: string[] = [];

  // Substitute everything specific to THIS launch. The template only ever
  // contributes flags and the accounts that are identical across launches.
  const put = (i: number, pubkey: PublicKey) => {
    accounts[i] = { pubkey, isSigner: accounts[i]!.isSigner, isWritable: accounts[i]!.isWritable };
  };
  put(IDX_MINT, mint);
  put(IDX_BONDING_CURVE, a.bondingCurve);
  put(IDX_ASSOCIATED_BONDING_CURVE, a.associatedBondingCurve);
  put(IDX_USER, trader);
  put(IDX_MAYHEM_STATE, a.mayhemState);
  put(IDX_MAYHEM_TOKEN_VAULT, a.mayhemTokenVault);

  // INTENTS forces these two; make the list say so up front rather than relying
  // on the template having had them set.
  accounts[IDX_MINT] = { pubkey: mint, isSigner: true, isWritable: true };
  accounts[IDX_USER] = { pubkey: trader, isSigner: true, isWritable: true };

  // The accounts we did NOT substitute must be the constants INTENTS re-derives.
  // If pump.fun ever moves one, this fails here rather than on chain.
  const fixed: [number, PublicKey, string][] = [
    [IDX_MINT_AUTHORITY, a.mintAuthority, "mint_authority"],
    [IDX_GLOBAL, a.global, "global"],
    [IDX_SYSTEM, PublicKey.default, "system_program"],
    [IDX_TOKEN_PROGRAM, t22(), "token_program (Token-2022)"],
    [IDX_ATA_PROGRAM, ataProgram(), "associated_token_program"],
    [IDX_MAYHEM_PROGRAM, mayhem(), "mayhem_program"],
    [IDX_GLOBAL_PARAMS, a.globalParams, "global_params"],
    [IDX_SOL_VAULT, a.solVault, "sol_vault"],
    [IDX_EVENT_AUTHORITY, a.eventAuthority, "event_authority"],
    [IDX_PUMP_PROGRAM, pump(), "pump_program"],
  ];
  for (const [i, expected, label] of fixed) {
    const got = accounts[i]?.pubkey;
    if (!got || !got.equals(expected)) {
      throw new Error(
        `create_v2 template disagrees with the derived ${label} at index ${i}: ` +
          `template ${got?.toBase58()} vs derived ${expected.toBase58()}. ` +
          "pump.fun's account layout has probably changed; refusing to send.",
      );
    }
  }

  if (accounts.length === PUMP_CREATE_V2_ACCOUNT_COUNT_WITH_QUOTE) {
    notes.push(
      `Template carried ${PUMP_CREATE_V2_ACCOUNT_COUNT_WITH_QUOTE} accounts (quote variant). ` +
        "INTENTS accepts it, but the trailing three came from the template unmodified.",
    );
  }
  notes.push(`Account flags taken from a create_v2 pump.fun accepted: ${tpl.signature}`);

  return { accounts, addresses: a, templateSignature: tpl.signature, notes };
}
