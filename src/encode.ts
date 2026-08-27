import { PublicKey } from "@solana/web3.js";
import { LABEL_LEN } from "./constants.js";

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

