import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  DEVNET_CORE_PROGRAM_ID,
  DEVNET_INTENTS_PROGRAM_ID,
  LOCAL_ONLY_INTENTS_PROGRAM_ID,
  LOCAL_ONLY_PROGRAM_ID,
} from "./constants.js";
import type { Cluster } from "./types.js";

export type AppConfig = {
  cluster: Cluster;
  rpcUrl: string;
  programId: PublicKey;
  intentsProgramId: PublicKey;
  rootKeypairPath?: string;
  agentKeypairPath?: string;
  relayerKeypairPath?: string;
  localOnlyProgram: boolean;
  localOnlyIntents: boolean;
};

const CLUSTERS: Cluster[] = ["localnet", "devnet", "mainnet-beta"];

/** Local-only validator ids. Refused on every non-localnet cluster, in either slot. */
const BANNED_LOCAL_ONLY_IDS = new Set([
  LOCAL_ONLY_PROGRAM_ID,
  LOCAL_ONLY_INTENTS_PROGRAM_ID,
]);

/** MAINNET deployed CORE. Used only when cluster=mainnet-beta. */
const MAINNET_CORE_PROGRAM_ID =
  "44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd";

/** MAINNET deployed INTENTS (pay + pump + call + deploy). Used only when cluster=mainnet-beta. */
const MAINNET_INTENTS_PROGRAM_ID =
  "3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw";

export const WAITING_ON_CORE_AND_PROGRAMS =
  "Waiting on CORE and PROGRAMS for real deployed ids. Both CORE and INTENTS program ids are required when cluster is not localnet. Fill config/devnet.json or config/mainnet.json or set GROKCHAIN_PROGRAM_ID and GROKCHAIN_INTENTS_PROGRAM_ID with real deployed ids only. Do not fall back to local-only defaults. null means not deployed yet.";

type FileConfig = {
  cluster?: string;
  rpcUrl?: string;
  coreProgramId?: string | null;
  intentsProgramId?: string | null;
};

function defaultRpc(cluster: Cluster): string {
  switch (cluster) {
    case "localnet":
      return "http://127.0.0.1:8899";
    case "devnet":
      return "https://api.devnet.solana.com";
    case "mainnet-beta":
      return "https://api.mainnet-beta.solana.com";
  }
}

function packageRootCandidates(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return [process.cwd(), path.resolve(here, ".."), path.resolve(here, "../..")];
}

function resolveExistingFile(p: string): string {
  const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  if (!existsSync(abs)) {
    throw new Error(`GROKCHAIN_CONFIG file not found: ${abs}`);
  }
  return abs;
}

/** config/devnet.json next to the package (cwd / import.meta / well-known relative). */
export function findDevnetConfigPath(): string | undefined {
  for (const root of packageRootCandidates()) {
    const candidate = path.join(root, "config", "devnet.json");
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/** config/mainnet.json next to the package (cwd / import.meta / well-known relative). */
export function findMainnetConfigPath(): string | undefined {
  for (const root of packageRootCandidates()) {
    const candidate = path.join(root, "config", "mainnet.json");
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function asIdString(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") return value;
  throw new Error(`${field} must be a base58 pubkey string or null`);
}

function readJsonConfig(filePath: string): FileConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    throw new Error(
      `Failed to load GROKCHAIN_CONFIG ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`GROKCHAIN_CONFIG ${filePath} must be a JSON object`);
  }
  const o = parsed as Record<string, unknown>;
  return {
    cluster: typeof o.cluster === "string" ? o.cluster : undefined,
    rpcUrl: typeof o.rpcUrl === "string" ? o.rpcUrl : undefined,
    coreProgramId: asIdString(o.coreProgramId, "coreProgramId"),
    intentsProgramId: asIdString(o.intentsProgramId, "intentsProgramId"),
  };
}

function firstId(...values: Array<string | null | undefined>): string | undefined {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function refuseLocalOnly(id: string, label: string): never {
  throw new Error(
    `Refusing ${label} program id ${id}: it is local-only, not a deployed program, not valid on devnet.`,
  );
}

function parseDeployedProgramId(idStr: string, label: string): PublicKey {
  if (BANNED_LOCAL_ONLY_IDS.has(idStr)) {
    refuseLocalOnly(idStr, label);
  }
  try {
    const pk = new PublicKey(idStr);
    const normalized = pk.toBase58();
    if (BANNED_LOCAL_ONLY_IDS.has(normalized)) {
      refuseLocalOnly(normalized, label);
    }
    return pk;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Refusing ")) throw err;
    throw new Error(
      `${label} program id ${idStr} is not a valid base58 pubkey. Accept only real deployed program ids.`,
    );
  }
}

function resolveProgramId(opts: {
  cluster: Cluster;
  envName: string;
  fileValue: string | null | undefined;
  envValue: string | undefined;
  localOnlyId: string;
  deployedDefault?: string;
  label: string;
}): { id: PublicKey; localOnly: boolean } {
  const value = firstId(opts.envValue, opts.fileValue);

  if (opts.cluster === "localnet") {
    const programIdStr = value ?? opts.localOnlyId;
    return {
      id: new PublicKey(programIdStr),
      localOnly: programIdStr === opts.localOnlyId,
    };
  }

  // cluster=devnet or mainnet-beta: deployed defaults from json / explicit constant.
  // Never applied on localnet. Never fall back to the local-only pair.
  const resolved =
    value ??
    (opts.cluster === "devnet" || opts.cluster === "mainnet-beta"
      ? opts.deployedDefault
      : undefined);

  if (!resolved) {
    throw new Error(WAITING_ON_CORE_AND_PROGRAMS);
  }

  return {
    id: parseDeployedProgramId(resolved, opts.label),
    localOnly: false,
  };
}

export function loadConfig(): AppConfig {
  const explicit = process.env.GROKCHAIN_CONFIG?.trim();
  let file: FileConfig | undefined;
  if (explicit) {
    file = readJsonConfig(resolveExistingFile(explicit));
  }

  const raw = (process.env.GROKCHAIN_CLUSTER ?? file?.cluster ?? "localnet").trim();
  if (!CLUSTERS.includes(raw as Cluster)) {
    throw new Error(
      `GROKCHAIN_CLUSTER must be localnet|devnet|mainnet-beta (got ${raw})`,
    );
  }
  const cluster = raw as Cluster;

  if (!file && cluster === "devnet") {
    const auto = findDevnetConfigPath();
    if (auto) file = readJsonConfig(auto);
  }
  if (!file && cluster === "mainnet-beta") {
    const auto = findMainnetConfigPath();
    if (auto) file = readJsonConfig(auto);
  }

  const rpcUrl = (process.env.GROKCHAIN_RPC_URL ?? file?.rpcUrl ?? defaultRpc(cluster)).trim();

  const core = resolveProgramId({
    cluster,
    envName: "GROKCHAIN_PROGRAM_ID",
    envValue: process.env.GROKCHAIN_PROGRAM_ID,
    fileValue: file?.coreProgramId,
    localOnlyId: LOCAL_ONLY_PROGRAM_ID,
    deployedDefault:
      cluster === "mainnet-beta" ? MAINNET_CORE_PROGRAM_ID : DEVNET_CORE_PROGRAM_ID,
    label: "CORE",
  });
  const intents = resolveProgramId({
    cluster,
    envName: "GROKCHAIN_INTENTS_PROGRAM_ID",
    envValue: process.env.GROKCHAIN_INTENTS_PROGRAM_ID,
    fileValue: file?.intentsProgramId,
    localOnlyId: LOCAL_ONLY_INTENTS_PROGRAM_ID,
    deployedDefault:
      cluster === "mainnet-beta"
        ? MAINNET_INTENTS_PROGRAM_ID
        : DEVNET_INTENTS_PROGRAM_ID,
    label: "INTENTS",
  });

  return {
    cluster,
    rpcUrl,
    programId: core.id,
    intentsProgramId: intents.id,
    rootKeypairPath: process.env.GROKCHAIN_ROOT_KEYPAIR?.trim() || undefined,
    agentKeypairPath: process.env.GROKCHAIN_AGENT_KEYPAIR?.trim() || undefined,
    relayerKeypairPath: process.env.GROKCHAIN_RELAYER_KEYPAIR?.trim() || undefined,
    localOnlyProgram: core.localOnly,
    localOnlyIntents: intents.localOnly,
  };
}

export function connectionOf(cfg: AppConfig): Connection {
  return new Connection(cfg.rpcUrl, "confirmed");
}

export function clusterNotes(cfg: AppConfig): string[] {
  const notes: string[] = [];
  if (cfg.localOnlyProgram) {
    notes.push(
      "CORE is local-only today. This default program id is for a local validator only. It is not a deployed program.",
    );
  }
  if (cfg.localOnlyIntents) {
    notes.push(
      "INTENTS is local-only today. This default program id is for a local validator only. It is not a deployed program.",
    );
  }
  if (cfg.cluster === "devnet" || cfg.cluster === "mainnet-beta") {
    if (cfg.localOnlyProgram || cfg.localOnlyIntents) {
      notes.push(
        "Waiting on CORE and PROGRAMS for real deployed ids. Do not treat the local-only pair as live.",
      );
    } else {
      const source =
        cfg.cluster === "mainnet-beta" ? "grokchain-mainnet" : "grokchain-devnet";
      notes.push(
        `CORE ${cfg.programId.toBase58()} and INTENTS ${cfg.intentsProgramId.toBase58()} came from the ${source} config / env and are treated as deployed. Still no seed export.`,
      );
      if (cfg.cluster === "devnet") {
        notes.push(
          `CORE ${cfg.programId.toBase58()} and INTENTS ${cfg.intentsProgramId.toBase58()} are the grokchain-devnet deployed programs. Still no seed export.`,
        );
      }
      if (cfg.cluster === "mainnet-beta") {
        notes.push(
          `CORE ${cfg.programId.toBase58()} and INTENTS ${cfg.intentsProgramId.toBase58()} are the grokchain-mainnet deployed programs. pay + pump + call + deploy. deploy is a grant event, not ELF upload. swap is SOL min_out, not AMM. Still no seed export.`,
        );
      }
    }
  }
  notes.push(
    "Human funds SpendVault (pay source) AND Paymaster (gas). Two deposits. Human pays.",
  );
  notes.push(
    "Relayer is the only address reimbursed as the outer fee payer. Bot/agent never holds SOL, never is the fee payer, never is the SOL source.",
  );
  notes.push(
    "sponsor_eligible means this grant may use YOUR paymaster — not a promise Grok Chain pays.",
  );
  return notes;
}
