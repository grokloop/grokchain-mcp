import { PublicKey } from "@solana/web3.js";
import { FORBIDDEN_SECRET_FIELDS, MAX_ALLOWED_PROGRAMS } from "./constants.js";

export class PolicyError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "PolicyError";
  }
}

export function rejectSecretFields(args: Record<string, unknown> | undefined): void {
  if (!args) return;
  for (const key of Object.keys(args)) {
    if ((FORBIDDEN_SECRET_FIELDS as readonly string[]).includes(key)) {
      throw new PolicyError(
        "SecretFieldRejected",
        "This MCP never accepts seed, mnemonic, or key material. Keys stay on the host in 0600 files. See HUMAN.md.",
      );
    }
  }
}

export function validatePolicy(args: {
  spendCapLamports: bigint;
  allowedPrograms: PublicKey[];
  expiresAtUnix: number;
  nowUnix?: number;
}): { warnings: string[] } {
  if (args.expiresAtUnix === 0) {
    throw new PolicyError("ExpiryRequired", "expires_at_unix must be non-zero");
  }
  const now = args.nowUnix ?? Math.floor(Date.now() / 1000);
  if (args.expiresAtUnix <= now) {
    throw new PolicyError(
      "ExpiryNotInFuture",
      `expires_at_unix must be strictly in the future (now=${now})`,
    );
  }
  if (args.allowedPrograms.length > MAX_ALLOWED_PROGRAMS) {
    throw new PolicyError(
      "AllowlistTooLong",
      `allowed_programs length ${args.allowedPrograms.length} > ${MAX_ALLOWED_PROGRAMS}`,
    );
  }
  const seen = new Set<string>();
  for (const p of args.allowedPrograms) {
    const s = p.toBase58();
    if (seen.has(s)) {
      throw new PolicyError("AllowlistDuplicate", `allowed_programs contains a duplicate: ${s}`);
    }
    seen.add(s);
  }
  const warnings: string[] = [];
  if (args.allowedPrograms.length === 0) {
    warnings.push(
      "empty allowlist: check_grant will be denied. v1 allowlist is router mode — allowlist the PROGRAMS router, not every inner DEX.",
    );
  }
  if (args.spendCapLamports === 0n) {
    warnings.push("cap 0 = call-only: check_grant amount must be 0");
  }
  warnings.push(
    "v1 allowlist is router mode: the human allowlists the PROGRAMS router, not every inner DEX.",
  );
  warnings.push("sponsor_eligible is a stored hook only; we do not sponsor gas.");
  return { warnings };
}

export function validateCheckGrant(args: {
  amountLamports: bigint;
  spendCapLamports?: bigint;
  allowedEmpty?: boolean;
}): { warnings: string[] } {
  const warnings: string[] = [];
  if (args.allowedEmpty) {
    throw new PolicyError(
      "GrantProgramDenied",
      "empty allowlist means check_grant is denied",
    );
  }
  if (args.spendCapLamports === 0n && args.amountLamports !== 0n) {
    throw new PolicyError(
      "GrantCapExceeded",
      "cap 0 = call-only; check amount must be 0",
    );
  }
  return { warnings };
}

export function toBigInt(v: number | string, label: string): bigint {
  try {
    const n = BigInt(v);
    if (n < 0n) throw new Error("negative");
    return n;
  } catch {
    throw new PolicyError("BadInteger", `${label} must be a non-negative integer`);
  }
}

export function toUnix(v: number | string, label: string): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new PolicyError("BadInteger", `${label} must be an integer unix timestamp`);
  }
  return n;
}
