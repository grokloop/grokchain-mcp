import { Connection, PublicKey } from "@solana/web3.js";
import { LOCAL_ONLY_PROGRAM_ID } from "./constants.js";
import type { Cluster } from "./types.js";

export type AppConfig = {
  cluster: Cluster;
  rpcUrl: string;
  programId: PublicKey;
  rootKeypairPath?: string;
  agentKeypairPath?: string;
  localOnlyProgram: boolean;
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

export function loadConfig(): AppConfig {
  const raw = (process.env.GROKCHAIN_CLUSTER ?? "localnet").trim();
  if (!CLUSTERS.includes(raw as Cluster)) {
    throw new Error(
      `GROKCHAIN_CLUSTER must be localnet|devnet|mainnet-beta (got ${raw})`,
    );
  }
  const cluster = raw as Cluster;

  const rpcUrl = (process.env.GROKCHAIN_RPC_URL ?? defaultRpc(cluster)).trim();
  const envProgram = process.env.GROKCHAIN_PROGRAM_ID?.trim();

  let programIdStr: string;
  if (envProgram) {
    programIdStr = envProgram;
  } else if (cluster === "localnet") {
    programIdStr = LOCAL_ONLY_PROGRAM_ID;
  } else {
    throw new Error(
      "GROKCHAIN_PROGRAM_ID is required when cluster is not localnet. CORE is local-only today and is not deployed.",
    );
  }

  if (cluster !== "localnet" && programIdStr === LOCAL_ONLY_PROGRAM_ID) {
    throw new Error(
      "Refusing to use the local-only program id on a non-localnet cluster. That id is not a deployed program.",
    );
  }

  const programId = new PublicKey(programIdStr);
  const localOnlyProgram =
    cluster === "localnet" && programIdStr === LOCAL_ONLY_PROGRAM_ID;

  return {
    cluster,
    rpcUrl,
    programId,
    rootKeypairPath: process.env.GROKCHAIN_ROOT_KEYPAIR?.trim() || undefined,
    agentKeypairPath: process.env.GROKCHAIN_AGENT_KEYPAIR?.trim() || undefined,
    localOnlyProgram,
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
  notes.push("Human pays gas. spend_cap_lamports is a counter, not a vault.");
  notes.push(
    "sponsor_eligible is a stored hook only; this client does not sponsor gas.",
  );
  return notes;
}
