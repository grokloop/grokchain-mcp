/**
 * Subscription builders + the due-date maths the scheduler runs on.
 *
 * The period arithmetic is duplicated from the program on purpose: the client
 * needs to know what is due before it builds a transaction, and the program
 * re-derives it from its own clock and rejects a mismatch. Two independent
 * computations that must agree is the point — a scheduler with a skewed clock
 * fails loudly instead of paying the wrong period.
 */
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";
import {
  INTENTS_DISC,
  SEED_SUBSCRIPTION,
  TOKEN_PROGRAM_ID,
} from "./constants.js";
import { encodePubkey, encodeU64 } from "./encode.js";
import { deriveIntentsAddrs, type VaultAddrs } from "./intents.js";
import { merchantRegistryPda } from "./paytoken.js";
import { ataFor } from "./pump_amm_accounts.js";

/** Never paid. Periods are 0-indexed, so the sentinel sits below zero. */
export const PERIOD_NONE = -1n;
/** Matches the program: anything faster than a day is a drain vector. */
export const MIN_PERIOD_SECONDS = 86_400n;

function meta(pubkey: PublicKey, isSigner: boolean, isWritable: boolean): AccountMeta {
  return { pubkey, isSigner, isWritable };
}

function encodeI64(v: bigint | number | string): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(BigInt(v));
  return b;
}

export function subscriptionPda(
  intentsProgramId: PublicKey,
  grokAccount: PublicKey,
  merchant: PublicKey,
  mint: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_SUBSCRIPTION, grokAccount.toBuffer(), merchant.toBuffer(), mint.toBuffer()],
    intentsProgramId,
  );
}

/**
 * Which period `nowUnix` falls in. Throws before the start rather than
 * returning a negative period, matching the program.
 */
export function currentPeriod(
  nowUnix: bigint,
  startUnix: bigint,
  periodSeconds: bigint,
): bigint {
  if (periodSeconds <= 0n) throw new Error("period_seconds must be positive");
  if (nowUnix < startUnix) throw new Error("subscription has not started yet");
  return (nowUnix - startUnix) / periodSeconds;
}

export type SubscriptionState = {
  grokAccount: string;
  root: string;
  merchant: string;
  mint: string;
  amount: bigint;
  periodSeconds: bigint;
  startUnix: bigint;
  lastPaidPeriod: bigint;
  payments: number;
  active: boolean;
};

/**
 * Layout: disc(8) + grok(32) + root(32) + merchant(32) + mint(32) + amount(8)
 * + period(8) + start(8) + last_paid(8) + payments(4) + active(1) + bump(1).
 */
export function decodeSubscription(data: Buffer): SubscriptionState | undefined {
  if (data.length < 8 + 32 * 4 + 8 * 4 + 4 + 1 + 1) return undefined;
  const pk = (o: number) => new PublicKey(data.subarray(o, o + 32)).toBase58();
  return {
    grokAccount: pk(8),
    root: pk(40),
    merchant: pk(72),
    mint: pk(104),
    amount: data.readBigUInt64LE(136),
    periodSeconds: data.readBigInt64LE(144),
    startUnix: data.readBigInt64LE(152),
    lastPaidPeriod: data.readBigInt64LE(160),
    payments: data.readUInt32LE(168),
    active: data[172] === 1,
  };
}

export type DueVerdict = {
  due: boolean;
  period?: bigint;
  /** Periods that elapsed unpaid and can never be billed now. */
  missed: bigint;
  reason: string;
};

/**
 * Should this subscription be paid right now?
 *
 * Missed periods are reported, never backfilled: a bot that was offline for
 * three cycles pays the current one only. Waking to a surprise triple charge is
 * a worse failure than a missed month.
 */
export function isDue(sub: SubscriptionState, nowUnix: bigint): DueVerdict {
  if (!sub.active) return { due: false, missed: 0n, reason: "cancelled" };
  if (nowUnix < sub.startUnix) {
    return { due: false, missed: 0n, reason: `starts at ${sub.startUnix}` };
  }
  const period = currentPeriod(nowUnix, sub.startUnix, sub.periodSeconds);
  const missed =
    sub.lastPaidPeriod < 0n ? period : period - sub.lastPaidPeriod - 1n;
  if (period <= sub.lastPaidPeriod) {
    return {
      due: false,
      period,
      missed: 0n,
      reason: `period ${period} already paid`,
    };
  }
  return {
    due: true,
    period,
    missed: missed > 0n ? missed : 0n,
    reason:
      missed > 0n
        ? `period ${period} due; ${missed} earlier period(s) were missed and are not billable`
        : `period ${period} due`,
  };
}

/** Unix seconds at which `period` begins. */
export function periodStart(sub: SubscriptionState, period: bigint): bigint {
  return sub.startUnix + period * sub.periodSeconds;
}

export function buildCreateSubscriptionIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  merchant: PublicKey;
  mint: PublicKey;
  amount: bigint | number | string;
  periodSeconds: bigint | number | string;
  startUnix?: bigint | number | string;
}): { ix: TransactionInstruction; subscription: PublicKey } & VaultAddrs {
  const addrs = deriveIntentsAddrs(opts);
  const [merchantRegistry] = merchantRegistryPda(opts.intentsProgramId, addrs.grokAccount);
  const [subscription] = subscriptionPda(
    opts.intentsProgramId,
    addrs.grokAccount,
    opts.merchant,
    opts.mint,
  );
  return {
    ...addrs,
    subscription,
    ix: new TransactionInstruction({
      programId: opts.intentsProgramId,
      keys: [
        meta(opts.root, true, true),
        meta(addrs.grokAccount, false, false),
        meta(merchantRegistry, false, false),
        meta(opts.mint, false, false),
        meta(subscription, false, true),
        meta(SystemProgram.programId, false, false),
      ],
      data: Buffer.concat([
        Buffer.from(INTENTS_DISC.create_subscription),
        encodePubkey(opts.merchant),
        encodeU64(opts.amount),
        encodeI64(opts.periodSeconds),
        encodeI64(opts.startUnix ?? 0),
      ]),
    }),
  };
}

export function buildCancelSubscriptionIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  merchant: PublicKey;
  mint: PublicKey;
}): { ix: TransactionInstruction; subscription: PublicKey } & VaultAddrs {
  const addrs = deriveIntentsAddrs(opts);
  const [subscription] = subscriptionPda(
    opts.intentsProgramId,
    addrs.grokAccount,
    opts.merchant,
    opts.mint,
  );
  return {
    ...addrs,
    subscription,
    ix: new TransactionInstruction({
      programId: opts.intentsProgramId,
      keys: [
        meta(opts.root, true, false),
        meta(addrs.grokAccount, false, false),
        meta(subscription, false, true),
      ],
      data: Buffer.from(INTENTS_DISC.cancel_subscription),
    }),
  };
}

/**
 * Pay one period. `period` is asserted, not inferred by the program — a
 * scheduler whose clock has drifted fails on `SubscriptionPeriodMismatch`
 * instead of quietly paying the wrong cycle.
 */
export function buildPaySubscriptionIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  agent: PublicKey;
  merchant: PublicKey;
  mint: PublicKey;
  period: bigint | number | string;
  sponsorLamports?: bigint | number | string;
  reference?: PublicKey;
  tokenProgram?: PublicKey;
  feePayer?: PublicKey;
}): {
  ix: TransactionInstruction;
  subscription: PublicKey;
  source: PublicKey;
  destination: PublicKey;
} & VaultAddrs {
  const addrs = deriveIntentsAddrs({ ...opts, agent: opts.agent });
  const [merchantRegistry] = merchantRegistryPda(opts.intentsProgramId, addrs.grokAccount);
  const [subscription] = subscriptionPda(
    opts.intentsProgramId,
    addrs.grokAccount,
    opts.merchant,
    opts.mint,
  );
  const tokenProgram = opts.tokenProgram ?? new PublicKey(TOKEN_PROGRAM_ID);
  const source = ataFor(addrs.pumpTrader, opts.mint, tokenProgram);
  const destination = ataFor(opts.merchant, opts.mint, tokenProgram);

  return {
    ...addrs,
    subscription,
    source,
    destination,
    ix: new TransactionInstruction({
      programId: opts.intentsProgramId,
      keys: [
        meta(opts.agent, true, false),
        meta(addrs.grokAccount, false, false),
        meta(addrs.grant, false, true),
        meta(opts.coreProgramId, false, false),
        meta(opts.intentsProgramId, false, false),
        meta(subscription, false, true),
        meta(merchantRegistry, false, false),
        meta(addrs.pumpTrader, false, false),
        meta(source, false, true),
        meta(destination, false, true),
        meta(opts.mint, false, false),
        meta(tokenProgram, false, false),
        meta(opts.reference ?? opts.intentsProgramId, false, false),
        meta(addrs.paymaster, false, true),
        meta(opts.feePayer ?? opts.intentsProgramId, !!opts.feePayer, true),
      ],
      data: Buffer.concat([
        Buffer.from(INTENTS_DISC.pay_subscription),
        encodeI64(opts.period),
        encodeU64(opts.sponsorLamports ?? 0),
      ]),
    }),
  };
}
