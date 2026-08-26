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
  extraSigners?: Keypair[];
  signerRole: "root" | "agent" | "relayer";
  dryRun?: boolean;
  extra: Record<string, unknown>;
  /** When the required fee-payer/setup key is missing, return need_human_setup (not need_human_signature). */
  setupReason?: string;
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
  const { cfg, ix, feePayer, signer, extraSigners, signerRole, dryRun, extra, setupReason } = opts;
  const notes = [...clusterNotes(cfg), ...(Array.isArray(extra.notes) ? (extra.notes as string[]) : [])];
  const base: ToolResult = {
    status: "ok",
    cluster: cfg.cluster,
    program_id: cfg.programId.toBase58(),
    intents_program_id: cfg.intentsProgramId.toBase58(),
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
    const status = setupReason ? "need_human_setup" : "need_human_signature";
    const reason =
      setupReason ??
      `${signerRole} keypair path is missing. Do not ask the bot for a key. The human signs with their own wallet. See ${HUMAN_MD}.`;
    return {
      ...base,
      status,
      unsigned_tx_base64: unsigned,
      reason,
      dry_run: dryRun,
      notes,
    };
  }

  const signers = [signer, ...(extraSigners ?? [])];

  if (dryRun) {
    try {
      tx.sign(...signers);
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
    const signature = await sendAndConfirmTransaction(connection, tx, signers, {
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
        "Send failed. Local-only programs land only on a local validator running the matching CORE and INTENTS program ids. See HUMAN.md.",
      notes,
    };
  }
}

export function needHumanSetup(cfg: AppConfig, reason: string, extra: Record<string, unknown> = {}): ToolResult {
  return {
    status: "need_human_setup",
    cluster: cfg.cluster,
    program_id: cfg.programId.toBase58(),
    intents_program_id: cfg.intentsProgramId.toBase58(),
    rpc_url: cfg.rpcUrl,
    reason: `${reason} See ${HUMAN_MD}. Never ask the bot for a key.`,
    human: HUMAN_MD,
    notes: clusterNotes(cfg),
    ...extra,
  };
}
