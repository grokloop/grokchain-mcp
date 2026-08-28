import { PublicKey } from "@solana/web3.js";
import { LABEL_LEN, PUMP_DISC } from "./constants.js";

export function encodeU64(n: bigint | number | string): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(n));
  return buf;
}

export function encodeI64(n: bigint | number | string): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(BigInt(n));
  return buf;
}

export function encodePubkeyVec(keys: PublicKey[]): Buffer {
  const buf = Buffer.alloc(4 + 32 * keys.length);
  buf.writeUInt32LE(keys.length, 0);
  for (let i = 0; i < keys.length; i++) {
    keys[i]!.toBuffer().copy(buf, 4 + i * 32);
  }
  return buf;
}

export function encodeLabel(label?: string): Buffer {
  const out = Buffer.alloc(LABEL_LEN);
  if (label) {
    const b = Buffer.from(label, "utf8");
    b.copy(out, 0, 0, Math.min(LABEL_LEN, b.length));
  }
  return out;
}

export function encodeBool(v: boolean): Buffer {
  return Buffer.from([v ? 1 : 0]);
}

export type GrantPolicyArgs = {
  spendCapLamports: bigint | number | string;
  allowedPrograms: PublicKey[];
  expiresAtUnix: number | string;
  sponsorEligible: boolean;
  label?: string;
};

/** Borsh GrantPolicyArgs: u64 + Vec<Pubkey> + i64 + bool + [u8;32] */
export function encodeGrantPolicyArgs(args: GrantPolicyArgs): Buffer {
  return Buffer.concat([
    encodeU64(args.spendCapLamports),
    encodePubkeyVec(args.allowedPrograms),
    encodeI64(args.expiresAtUnix),
    encodeBool(args.sponsorEligible),
    encodeLabel(args.label),
  ]);
}

export function encodeCheckGrantArgs(amountLamports: bigint | number | string): Buffer {
  return encodeU64(amountLamports);
}

export function decodeLabel(bytes: Buffer): string {
  const end = bytes.findIndex((b) => b === 0);
  const slice = end === -1 ? bytes : bytes.subarray(0, end);
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(slice);
  } catch {
    return slice.toString("hex");
  }
}

/** Borsh PayArgs: u64 amount_lamports + u64 sponsor_lamports */
export function encodePayArgs(args: {
  amountLamports: bigint | number | string;
  sponsorLamports: bigint | number | string;
}): Buffer {
  return Buffer.concat([encodeU64(args.amountLamports), encodeU64(args.sponsorLamports)]);
}

export function encodePubkey(key: PublicKey): Buffer {
  return Buffer.from(key.toBuffer());
}

/** Borsh SwapArgs: u64 amount_in + u64 min_out + u64 sponsor */
export function encodeSwapArgs(args: {
  amountInLamports: bigint | number | string;
  minOutLamports: bigint | number | string;
  sponsorLamports: bigint | number | string;
}): Buffer {
  return Buffer.concat([
    encodeU64(args.amountInLamports),
    encodeU64(args.minOutLamports),
    encodeU64(args.sponsorLamports),
  ]);
}

/** Borsh DeployArgs: u64 sponsor + Pubkey program_id */
export function encodeDeployArgs(args: {
  sponsorLamports: bigint | number | string;
  programId: PublicKey;
}): Buffer {
  return Buffer.concat([encodeU64(args.sponsorLamports), encodePubkey(args.programId)]);
}

/** Borsh CallArgs: u64 amount + u64 sponsor + Pubkey target_program */
export function encodeCallArgs(args: {
  amountLamports: bigint | number | string;
  sponsorLamports: bigint | number | string;
  targetProgram: PublicKey;
}): Buffer {
  return Buffer.concat([
    encodeU64(args.amountLamports),
    encodeU64(args.sponsorLamports),
    encodePubkey(args.targetProgram),
  ]);
}

/** Borsh PumpBuyArgs: u64 amount + u64 max_sol_cost + u64 sponsor */
export function encodePumpBuyArgs(args: {
  amount: bigint | number | string;
  maxSolCost: bigint | number | string;
  sponsorLamports: bigint | number | string;
}): Buffer {
  return Buffer.concat([
    encodeU64(args.amount),
    encodeU64(args.maxSolCost),
    encodeU64(args.sponsorLamports),
  ]);
}

/** Borsh PumpSellArgs: u64 amount + u64 min_sol_output + u64 sponsor */
export function encodePumpSellArgs(args: {
  amount: bigint | number | string;
  minSolOutput: bigint | number | string;
  sponsorLamports: bigint | number | string;
}): Buffer {
  return Buffer.concat([
    encodeU64(args.amount),
    encodeU64(args.minSolOutput),
    encodeU64(args.sponsorLamports),
  ]);
}

/** Official pump buy_v2 inner data (constructed on-chain; exported for tests). */
export function encodePumpBuyV2Inner(
  amount: bigint | number | string,
  maxSolCost: bigint | number | string,
): Buffer {
  return Buffer.concat([Buffer.from(PUMP_DISC.buy_v2), encodeU64(amount), encodeU64(maxSolCost)]);
}

/** Official pump sell_v2 inner data (constructed on-chain; exported for tests). */
export function encodePumpSellV2Inner(
  amount: bigint | number | string,
  minSolOutput: bigint | number | string,
): Buffer {
  return Buffer.concat([Buffer.from(PUMP_DISC.sell_v2), encodeU64(amount), encodeU64(minSolOutput)]);
}

function encodeBorshString(s: string): Buffer {
  const bytes = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length, 0);
  return Buffer.concat([len, bytes]);
}

/** Borsh PumpCreateArgs: name + symbol + uri + 2 bools + max_sol_cost + sponsor */
export function encodePumpCreateArgs(args: {
  name: string;
  symbol: string;
  uri: string;
  isMayhemMode: boolean;
  isCashbackEnabled: boolean;
  maxSolCost: bigint | number | string;
  sponsorLamports: bigint | number | string;
}): Buffer {
  return Buffer.concat([
    encodeBorshString(args.name),
    encodeBorshString(args.symbol),
    encodeBorshString(args.uri),
    encodeBool(args.isMayhemMode),
    encodeBool(args.isCashbackEnabled),
    encodeU64(args.maxSolCost),
    encodeU64(args.sponsorLamports),
  ]);
}

/** Official pump create_v2 inner data (constructed on-chain; exported for tests). */
export function encodePumpCreateV2Inner(opts: {
  name: string;
  symbol: string;
  uri: string;
  creator: PublicKey;
  isMayhemMode: boolean;
  isCashbackEnabled: boolean;
}): Buffer {
  return Buffer.concat([
    Buffer.from(PUMP_DISC.create_v2),
    encodeBorshString(opts.name),
    encodeBorshString(opts.symbol),
    encodeBorshString(opts.uri),
    encodePubkey(opts.creator),
    encodeBool(opts.isMayhemMode),
    encodeBool(opts.isCashbackEnabled),
  ]);
}

