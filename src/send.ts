import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  type Keypair,
} from "@solana/web3.js";
import { HUMAN_MD } from "./constants.js";
import { clusterNotes, connectionOf, type AppConfig } from "./config.js";
import type { ToolResult } from "./types.js";

const PLACEHOLDER_BLOCKHASH = "11111111111111111111111111111111";

export type DispatchOpts = {
  cfg: AppConfig;
  ix: TransactionInstruction;
  feePayer: PublicKey;
  signer?: Keypair;
  signerRole: "root" | "agent";
  dryRun?: boolean;
  extra: Record<string, unknown>;
};

async function latestBlockhash(connection: Connection): Promise<string | null> {
  try {
    const { blockhash } = await connection.getLatestBlockhash();
    return blockhash;
  } catch {
    return null;
  }
}

function serializeUnsigned(tx: Transaction): string {
  return tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString("base64");
}

export async function dispatchIx(opts: DispatchOpts): Promise<ToolResult> {
  const { cfg, ix, feePayer, signer, signerRole, dryRun, extra } = opts;
  const notes = [...clusterNotes(cfg), ...(Array.isArray(extra.notes) ? (extra.notes as string[]) : [])];
  const base: ToolResult = {
    status: "ok",
    cluster: cfg.cluster,
    program_id: cfg.programId.toBase58(),
    rpc_url: cfg.rpcUrl,
    ...extra,
    notes,
    human: HUMAN_MD,
  };

  const connection = connectionOf(cfg);
  const tx = new Transaction().add(ix);
  tx.feePayer = feePayer;
  const blockhash = await latestBlockhash(connection);
  tx.recentBlockhash = blockhash ?? PLACEHOLDER_BLOCKHASH;
  if (!blockhash) {
    notes.push(
      "RPC did not return a recent blockhash; unsigned tx uses a placeholder. Refresh the blockhash before signing.",
    );
  }

  if (!signer) {
    const unsigned = serializeUnsigned(tx);
    return {
      ...base,
      status: dryRun ? "need_human_signature" : "need_human_signature",
      unsigned_tx_base64: unsigned,
      reason: `${signerRole} keypair path is missing. Do not ask the bot for a key. The human signs with their own wallet. See ${HUMAN_MD}.`,
      dry_run: dryRun,
      notes,
    };
  }

  if (dryRun) {
    try {
      tx.sign(signer);
      const sim = await connection.simulateTransaction(tx);
      return {
        ...base,
        status: "simulated",
        dry_run: true,
        logs: sim.value.logs ?? [],
        err: sim.value.err ?? null,
        units_consumed: sim.value.unitsConsumed ?? null,
        notes,
      };
    } catch (e) {
      return {
        ...base,
        status: "error",
        dry_run: true,
        error: e instanceof Error ? e.message : String(e),
        unsigned_tx_base64: serializeUnsigned(tx),
        notes,
      };
    }
  }

  try {
    const signature = await sendAndConfirmTransaction(connection, tx, [signer], {
      commitment: "confirmed",
    });
    return {
      ...base,
      status: "ok",
      signature,
      notes,
    };
  } catch (e) {
    return {
      ...base,
      status: "error",
      error: e instanceof Error ? e.message : String(e),
      unsigned_tx_base64: serializeUnsigned(tx),
      reason:
        "Send failed. If the local validator is not running the local-only CORE program, the ix will not land. See HUMAN.md.",
      notes,
    };
  }
}

export function needHumanSetup(cfg: AppConfig, reason: string, extra: Record<string, unknown> = {}): ToolResult {
  return {
    status: "need_human_setup",
    cluster: cfg.cluster,
    program_id: cfg.programId.toBase58(),
    rpc_url: cfg.rpcUrl,
    reason: `${reason} See ${HUMAN_MD}. Never ask the bot for a key.`,
    human: HUMAN_MD,
    notes: clusterNotes(cfg),
    ...extra,
  };
}
