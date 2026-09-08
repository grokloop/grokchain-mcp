/**
 * Sub-grants: an agent delegating a slice of its own authority to another agent.
 *
 * NOT ON THE DEPLOYED PROGRAM. The live MAINNET INTENTS binary does not contain
 * these instructions; every builder here will fail with an unknown-instruction
 * error until it does. That is stated in the tool descriptions too, because a
 * client that offers an instruction the chain does not have sends a bot into an
 * opaque failure it cannot diagnose.
 *
 * WHAT MAKES THIS DIFFERENT FROM A GRANT
 * A CORE grant is authority a human gave an agent. A sub-grant is authority an
 * agent gave another agent, out of its own budget. Nothing about it can widen:
 * the cap cannot exceed the parent's REMAINING headroom, the expiry cannot
 * outlive the parent's, and there is no instruction anywhere that raises either
 * after the fact.
 *
 * THE CHAIN IS THE CALLER'S JOB
 * Spending through a sub-grant meters every ancestor, and the program reads them
 * from remaining_accounts leaf-first. Building that list correctly is this
 * module's real work: get the order wrong and the program rejects it, which is
 * the good case — the bad case would be a client that silently truncates the
 * chain and skips the ancestor that would have refused.
 */
import { type AccountMeta, Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { INTENTS_DISC, SEED_SUB_GRANT } from "./constants.js";
import { grantPda, grokAccountPda } from "./pda.js";

/** Mirrors MAX_SUB_DEPTH in instructions/sub_grant.rs. */
export const MAX_SUB_DEPTH = 3;

/** SubGrant PDA = ["sub-grant", grokAccount, agent] under INTENTS. */
export function subGrantPda(
  intentsProgramId: PublicKey,
  grokAccount: PublicKey,
  agent: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_SUB_GRANT, grokAccount.toBuffer(), agent.toBuffer()],
    intentsProgramId,
  );
}

export type DecodedSubGrant = {
  address: string;
  grok_account: string;
  /** The sub-grant above this one, or null when it hangs off the CORE grant. */
  parent: string | null;
  issuer: string;
  agent: string;
  cap: string;
  spent: string;
  remaining: string;
  expires_at_unix: number;
  revoked: boolean;
  depth: number;
  generation: number;
  /** Live means: not revoked, not expired, and still has headroom. */
  usable: boolean;
};

const SUB_GRANT_ACCOUNT_DISC = Buffer.from([91, 57, 227, 202, 184, 84, 153, 215]);
const ZERO = new PublicKey(0);

export function decodeSubGrant(address: PublicKey, data: Buffer): DecodedSubGrant {
  if (!data.subarray(0, 8).equals(SUB_GRANT_ACCOUNT_DISC)) {
    throw new Error(`${address.toBase58()} is not a SubGrant account`);
  }
  let o = 8;
  const key = () => {
    const p = new PublicKey(data.subarray(o, o + 32));
    o += 32;
    return p;
  };
  const grok_account = key();
  const parent = key();
  const issuer = key();
  const agent = key();
  const cap = data.readBigUInt64LE(o);
  o += 8;
  const spent = data.readBigUInt64LE(o);
  o += 8;
  const expires_at_unix = Number(data.readBigInt64LE(o));
  o += 8;
  const revoked = data[o] !== 0;
  o += 1;
  const depth = data[o]!;
  o += 1;
  const generation = data.readUInt32LE(o);

  const now = Math.floor(Date.now() / 1000);
  return {
    address: address.toBase58(),
    grok_account: grok_account.toBase58(),
    // The default pubkey is the sentinel for "hangs off the CORE grant".
    // Reporting it as an address would imply a parent that does not exist.
    parent: parent.equals(ZERO) ? null : parent.toBase58(),
    issuer: issuer.toBase58(),
    agent: agent.toBase58(),
    cap: cap.toString(),
    spent: spent.toString(),
    remaining: (cap - spent).toString(),
    expires_at_unix,
    revoked,
    depth,
    generation,
    usable: !revoked && expires_at_unix > now && cap > spent,
  };
}

const meta = (pubkey: PublicKey, isSigner: boolean, isWritable: boolean): AccountMeta => ({
  pubkey,
  isSigner,
  isWritable,
});

function u64(v: bigint | number | string): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(v));
  return b;
}
function i64(v: bigint | number | string): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(BigInt(v));
  return b;
}

/**
 * Delegate part of an agent's budget to another agent.
 *
 * `parent` is omitted for the first level, where the issuer is the agent CORE
 * granted. Deeper levels pass the issuer's own sub-grant.
 *
 * The issuer signs but does not pay: `payer` covers rent, because an agent that
 * holds no SOL cannot fund an account.
 */
export function buildIssueSubGrantIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  /** The agent doing the delegating. Signs. */
  issuer: PublicKey;
  /** Pays rent. Never the issuer. */
  payer: PublicKey;
  /** The agent named in the CORE grant — the top of the tree. */
  coreAgent: PublicKey;
  /** Who receives the delegated authority. */
  agent: PublicKey;
  cap: bigint | number | string;
  expiresAtUnix: number;
}): { ix: TransactionInstruction; subGrant: PublicKey; parent: PublicKey | null } {
  const [grokAccount] = grokAccountPda(opts.coreProgramId, opts.root);
  const [grant] = grantPda(opts.coreProgramId, grokAccount, opts.coreAgent);
  const [subGrant] = subGrantPda(opts.intentsProgramId, grokAccount, opts.agent);

  // Depth 1 when the issuer IS the CORE agent; otherwise the issuer must hold a
  // sub-grant of its own, and that is the parent.
  const isFirstLevel = opts.issuer.equals(opts.coreAgent);
  const parent = isFirstLevel
    ? null
    : subGrantPda(opts.intentsProgramId, grokAccount, opts.issuer)[0];

  const keys: AccountMeta[] = [
    meta(opts.issuer, true, false),
    meta(opts.payer, true, true),
    meta(grokAccount, false, false),
    meta(grant, false, false),
  ];
  // Anchor encodes an absent Option<Account> by passing the program id in its
  // place, which is how a missing parent is expressed rather than by omitting
  // the slot and shifting everything after it.
  keys.push(meta(parent ?? opts.intentsProgramId, false, false));
  keys.push(meta(subGrant, false, true));
  keys.push(meta(new PublicKey("11111111111111111111111111111111"), false, false));

  const data = Buffer.concat([
    INTENTS_DISC.issue_sub_grant,
    opts.agent.toBuffer(),
    u64(opts.cap),
    i64(opts.expiresAtUnix),
  ]);
  return { ix: new TransactionInstruction({ programId: opts.intentsProgramId, keys, data }), subGrant, parent };
}

/** Narrow a sub-grant. Widening is refused on chain, not here. */
export function buildReviseSubGrantIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  /** The issuer of this sub-grant, or the human root. */
  authority: PublicKey;
  agent: PublicKey;
  cap: bigint | number | string;
  expiresAtUnix: number;
}): { ix: TransactionInstruction; subGrant: PublicKey } {
  const [grokAccount] = grokAccountPda(opts.coreProgramId, opts.root);
  const [subGrant] = subGrantPda(opts.intentsProgramId, grokAccount, opts.agent);
  const data = Buffer.concat([
    INTENTS_DISC.revise_sub_grant,
    u64(opts.cap),
    i64(opts.expiresAtUnix),
  ]);
  return {
    ix: new TransactionInstruction({
      programId: opts.intentsProgramId,
      keys: [meta(opts.authority, true, false), meta(grokAccount, false, false), meta(subGrant, false, true)],
      data,
    }),
    subGrant,
  };
}

/**
 * Kill a sub-grant and, with it, everything beneath it.
 *
 * One account is written. Descendants are not touched and do not need to be:
 * every spend re-walks the chain to the root and refuses on a revoked ancestor.
 */
export function buildRevokeSubGrantIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  authority: PublicKey;
  agent: PublicKey;
}): { ix: TransactionInstruction; subGrant: PublicKey } {
  const [grokAccount] = grokAccountPda(opts.coreProgramId, opts.root);
  const [subGrant] = subGrantPda(opts.intentsProgramId, grokAccount, opts.agent);
  return {
    ix: new TransactionInstruction({
      programId: opts.intentsProgramId,
      keys: [meta(opts.authority, true, false), meta(grokAccount, false, false), meta(subGrant, false, true)],
      data: Buffer.from(INTENTS_DISC.revoke_sub_grant),
    }),
    subGrant,
  };
}

/**
 * The ancestor chain for a spending agent, leaf first, ready for
 * remaining_accounts.
 *
 * Refuses rather than returning a short chain. A truncated chain is the
 * dangerous failure: it would skip exactly the ancestors whose revocation or
 * exhaustion should have stopped the payment, and the program can only reject it
 * because the top of a valid chain has no parent.
 */
export async function buildSubGrantChain(opts: {
  connection: Connection;
  intentsProgramId: PublicKey;
  grokAccount: PublicKey;
  agent: PublicKey;
}): Promise<{ chain: DecodedSubGrant[]; accounts: AccountMeta[] }> {
  const chain: DecodedSubGrant[] = [];
  let cursor: PublicKey | null = subGrantPda(opts.intentsProgramId, opts.grokAccount, opts.agent)[0];

  while (cursor) {
    if (chain.length >= MAX_SUB_DEPTH) {
      throw new Error(
        `delegation chain exceeds MAX_SUB_DEPTH (${MAX_SUB_DEPTH}); the program would reject it`,
      );
    }
    const info = await opts.connection.getAccountInfo(cursor, "confirmed");
    if (!info) {
      throw new Error(
        `no sub-grant at ${cursor.toBase58()}. The chain must reach the CORE grant — ` +
          "a partial chain would skip the ancestors that could refuse this spend.",
      );
    }
    const node = decodeSubGrant(cursor, Buffer.from(info.data));
    chain.push(node);
    cursor = node.parent ? new PublicKey(node.parent) : null;
  }

  if (chain.length === 0) {
    throw new Error(`${opts.agent.toBase58()} holds no sub-grant`);
  }
  return {
    chain,
    // Writable: metering moves `spent` on every ancestor, not just the leaf.
    accounts: chain.map((n) => meta(new PublicKey(n.address), false, true)),
  };
}
