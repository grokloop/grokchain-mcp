import { Connection, PublicKey } from "@solana/web3.js";
import { LOCAL_ONLY_INTENTS_PROGRAM_ID, LOCAL_ONLY_PROGRAM_ID } from "./constants.js";
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

function resolveProgramId(opts: {
  cluster: Cluster;
  envName: string;
  envValue: string | undefined;
  localOnlyId: string;
  label: string;
}): { id: PublicKey; localOnly: boolean } {
  const envProgram = opts.envValue?.trim();
  let programIdStr: string;
  if (envProgram) {
    programIdStr = envProgram;
  } else if (opts.cluster === "localnet") {
    programIdStr = opts.localOnlyId;
  } else {
    throw new Error(
      `${opts.envName} is required when cluster is not localnet. ${opts.label} is local-only today and is not deployed.`,
    );
  }

  if (opts.cluster !== "localnet" && programIdStr === opts.localOnlyId) {
    throw new Error(
      `Refusing to use the local-only ${opts.label} program id on a non-localnet cluster. That id is not a deployed program.`,
    );
  }

  return {
    id: new PublicKey(programIdStr),
    localOnly: opts.cluster === "localnet" && programIdStr === opts.localOnlyId,
  };
}

export function loadConfig(): AppConfig {
  const raw = (process.env.GROKCHAIN_CLUSTER ?? "localnet").trim();
  if (!CLUSTERS.includes(raw as Cluster)) {
    throw new Error(
      `GROKCHAIN_CLUSTER must be localnet|devnet|mainnet-beta (got ${raw})`,
    );
  }
  const cluster = raw as Cluster;
  const rpcUrl = (process.env.GROKCHAIN_RPC_URL ?? defaultRpc(cluster)).trim();

  const core = resolveProgramId({
    cluster,
    envName: "GROKCHAIN_PROGRAM_ID",
    envValue: process.env.GROKCHAIN_PROGRAM_ID,
    localOnlyId: LOCAL_ONLY_PROGRAM_ID,
    label: "CORE",
  });
  const intents = resolveProgramId({
    cluster,
    envName: "GROKCHAIN_INTENTS_PROGRAM_ID",
    envValue: process.env.GROKCHAIN_INTENTS_PROGRAM_ID,
    localOnlyId: LOCAL_ONLY_INTENTS_PROGRAM_ID,
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
