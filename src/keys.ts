import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { homedir } from "node:os";
import { Keypair, PublicKey } from "@solana/web3.js";
import { HUMAN_MD } from "./constants.js";

export type LoadedKey = {
  present: boolean;
  path?: string;
  keypair?: Keypair;
  pubkey?: PublicKey;
  reason?: string;
};

function parseSecretArray(raw: string, path: string): Keypair {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`keypair file at ${path} is not JSON`);
  }
  if (!Array.isArray(parsed) || parsed.length < 64) {
    throw new Error(
      `keypair file at ${path} is not a Solana CLI secret-key array (expected 64 numbers)`,
    );
  }
  if (!parsed.every((n) => typeof n === "number" && n >= 0 && n <= 255)) {
    throw new Error(`keypair file at ${path} contains non-byte values`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(parsed as number[]));
}

/** Load a Solana CLI JSON keypair from a path. Never returns the secret. */
export function loadKeypairFromPath(path: string): Keypair {
  const raw = readFileSync(path, "utf8");
  return parseSecretArray(raw, path);
}

export function loadKeyFromEnvPath(
  envName: "GROKCHAIN_ROOT_KEYPAIR" | "GROKCHAIN_AGENT_KEYPAIR" | "GROKCHAIN_RELAYER_KEYPAIR",
  explicitPath?: string,
): LoadedKey {
  const path = (explicitPath ?? process.env[envName])?.trim();
  if (!path) {
    return {
      present: false,
      reason: `${envName} is unset. Env vars name PATHS, not secrets. See ${HUMAN_MD}.`,
    };
  }
  if (!existsSync(path)) {
    return {
      present: false,
      path,
      reason: `${envName} points at ${path} but the file is missing. See ${HUMAN_MD}.`,
    };
  }
  const keypair = loadKeypairFromPath(path);
  return { present: true, path, keypair, pubkey: keypair.publicKey };
}

export function pubkeyOnly(loaded: LoadedKey): string | undefined {
  return loaded.pubkey?.toBase58();
}

export function defaultAgentPath(): string {
  return (
    process.env.GROKCHAIN_AGENT_KEYPAIR?.trim() ||
    `${homedir()}/.config/grokchain/agent.json`
  );
}

export function defaultRootPath(): string {
  return (
    process.env.GROKCHAIN_ROOT_KEYPAIR?.trim() ||
    `${homedir()}/.config/solana/id.json`
  );
}

export function defaultRelayerPath(): string {
  return (
    process.env.GROKCHAIN_RELAYER_KEYPAIR?.trim() ||
    `${homedir()}/.config/grokchain/relayer.json`
  );
}

/**
 * Generate an agent keystore (Solana CLI JSON array), chmod 0600,
 * print/return pubkey only. Never serializes the secret to stdout.
 */
export function initRelayerKeystore(outPath: string): PublicKey {
  return initAgentKeystore(outPath);
}

export function initAgentKeystore(outPath: string): PublicKey {
  if (existsSync(outPath)) {
    throw new Error(
      `refusing to overwrite existing keystore at ${outPath}. Use that file or pick a new path.`,
    );
  }
  mkdirSync(dirname(outPath), { recursive: true, mode: 0o700 });
  const kp = Keypair.generate();
  writeFileSync(outPath, JSON.stringify(Array.from(kp.secretKey)), {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(outPath, 0o600);
  return kp.publicKey;
}

export function parsePubkey(s: string, label: string): PublicKey {
  try {
    return new PublicKey(s);
  } catch {
    throw new Error(`${label} is not a valid Solana pubkey`);
  }
}

export type EnsuredKeystore = {
  path: string;
  pubkey: PublicKey;
  reused: boolean;
};

/**
 * Reuse an existing keystore (do not overwrite) or create a new 0600 file.
 * Returns the pubkey only. Never prints secret bytes.
 */
export function ensureKeystore(outPath: string): EnsuredKeystore {
  if (existsSync(outPath)) {
    const kp = loadKeypairFromPath(outPath);
    return { path: outPath, pubkey: kp.publicKey, reused: true };
  }
  const pubkey = initAgentKeystore(outPath);
  return { path: outPath, pubkey, reused: false };
}

/** reuse if the file exists; create otherwise. Never overwrite. */
export function planKeystoreAction(fileExists: boolean): "reuse" | "create" {
  return fileExists ? "reuse" : "create";
}
