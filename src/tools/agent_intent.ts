import {
  DEVNET_INTENTS_PROGRAM_ID,
  HUMAN_MD,
  LOCAL_ONLY_INTENTS_PROGRAM_ID,
  LOCAL_ONLY_PROGRAM_ID,
} from "../constants.js";
import { parsePubkey } from "../keys.js";
import {
  asError,
  missingRoot,
  openCtx,
  resolveRootPubkey,
  type Ctx,
} from "../resolve.js";
import { dispatchIx, needHumanSetup } from "../send.js";
import type { AppConfig } from "../config.js";
import type { ToolResult } from "../types.js";
import { PublicKey, type TransactionInstruction, Keypair } from "@solana/web3.js";

const BANNED_LOCAL_ONLY_IDS = new Set([
  LOCAL_ONLY_PROGRAM_ID,
  LOCAL_ONLY_INTENTS_PROGRAM_ID,
]);

/** Refuse banned local-only ids on every non-localnet cluster. */
export function refuseBannedIntentsOnPublicCluster(cfg: AppConfig): void {
  if (cfg.cluster === "localnet") return;
  const id = cfg.intentsProgramId.toBase58();
  if (BANNED_LOCAL_ONLY_IDS.has(id)) {
    throw new Error(
      `Refusing INTENTS program id ${id}: it is local-only, not a deployed program, not valid on ${cfg.cluster}.`,
    );
  }
}

export function honestyNotes(cfg: AppConfig, extra: string[]): string[] {
  return [
    ...extra,
    "Agent signs. Relayer is the outer fee payer. Bot never holds SOL.",
    cfg.cluster === "mainnet-beta"
      ? `Builds against MAINNET INTENTS ${cfg.intentsProgramId.toBase58()}. pay, pump_buy/sell/create, pump_amm_buy/sell, token_buy/token_sell, call, and deploy are on this upgraded binary. deploy is a grant event, not an ELF upload. swap is SOL min_out, not an AMM. token_buy/token_sell is Jupiter v6. pump is official pump.fun curve. pump_amm_* is grant-gated PumpSwap (trader remaining[1], vault never user). Buy remaining 26. Sell remaining 24. Agent stays 0 SOL.`
      : cfg.cluster === "devnet"
      ? `Builds against grokchain-devnet INTENTS ${cfg.intentsProgramId.toBase58() === DEVNET_INTENTS_PROGRAM_ID ? DEVNET_INTENTS_PROGRAM_ID : cfg.intentsProgramId.toBase58()}. This source was not upgraded on devnet in the swap/deploy/call change. The live binary may still reject the new ixs. Do not claim they are live on public Solana.`
      : "On localnet, builds against the local-only INTENTS id. Lands only if the local validator is running this INTENTS binary and CORE.",
  ];
}

export type BuiltIntent = {
  ix: TransactionInstruction;
  grokAccount: PublicKey;
  grant: PublicKey;
  spendVault: PublicKey;
  paymaster: PublicKey;
};

/**
 * Same mouth as payTool: agent signs, relayer fee-pays, need_human_* if keys missing.
 * Does not fake a send. Does not claim a public deploy of the new ixs.
 */
export async function submitAgentIntent(opts: {
  raw: Record<string, unknown> & { root?: string; dry_run?: boolean };
  intent: "swap" | "deploy" | "call" | "pump_buy" | "pump_sell" | "pump_create" | "pump_amm_buy" | "pump_amm_sell" | "token_buy" | "token_sell"
    | "pay_token"
    | "pay_subscription";
  movedSolOnOk: boolean;
  extraFields: Record<string, unknown>;
  notes: string[];
  build: (p: {
    ctx: Ctx;
    rootPk: PublicKey;
    agentPk: PublicKey;
    relayerPk?: PublicKey;
  }) => BuiltIntent;
  /**
   * Keypairs that must sign IN ADDITION to relayer + agent.
   *
   * Only pump_create needs this: pump.fun requires the new mint to sign its own
   * creation, and that key belongs to neither the relayer nor the agent. It is
   * ephemeral — generated for the launch, used once, never written to disk and
   * never returned. Anything long-lived belongs in a keystore path, not here.
   */
  extraSigners?: Keypair[];
}): Promise<ToolResult> {
  try {
    const ctx = openCtx(opts.raw);
    refuseBannedIntentsOnPublicCluster(ctx.cfg);
    const rootPk = resolveRootPubkey(ctx, opts.raw.root);
    // extraFields carries the honesty flags (moved_sol, venue, pool...). Dropping
    // them here hides exactly the facts a bot needs when told to fix its setup.
    if (!rootPk) {
      return missingRoot(ctx, { intent: opts.intent, moved_sol: false, ...opts.extraFields });
    }

    const agentPk = ctx.agent.pubkey;
    if (!agentPk) {
      return needHumanSetup(
        ctx.cfg,
        `GROKCHAIN_AGENT_KEYPAIR is missing. Agent signs ${opts.intent} as a public identity. The bot never holds SOL and never is the fee payer.`,
        { intent: opts.intent, root: rootPk.toBase58(), moved_sol: false, ...opts.extraFields },
      );
    }

    const relayerPk = ctx.relayer.pubkey;
    if (relayerPk && relayerPk.equals(agentPk)) {
      return {
        status: "error",
        code: "AgentMustNotFeePay",
        error:
          "Relayer pubkey equals the agent. The bot/agent is never the fee payer and never holds SOL. Use a distinct GROKCHAIN_RELAYER_KEYPAIR. See HUMAN.md.",
        human: HUMAN_MD,
        intent: opts.intent,
      };
    }

    const built = opts.build({ ctx, rootPk, agentPk, relayerPk });
    const extra = {
      grok_account: built.grokAccount.toBase58(),
      grant: built.grant.toBase58(),
      spend_vault: built.spendVault.toBase58(),
      paymaster: built.paymaster.toBase58(),
      root: rootPk.toBase58(),
      agent: agentPk.toBase58(),
      fee_payer: relayerPk?.toBase58(),
      intents_program_id: ctx.cfg.intentsProgramId.toBase58(),
      intent: opts.intent,
      moved_sol: false,
      notes: honestyNotes(ctx.cfg, opts.notes),
      ...opts.extraFields,
    };

    const setupMissingRelayer =
      "Relayer must submit; bot never holds SOL. Set GROKCHAIN_RELAYER_KEYPAIR (path). The agent signs but is never the fee payer and never the SOL source.";

    if (!relayerPk || !ctx.relayer.keypair) {
      return await dispatchIx({
        cfg: ctx.cfg,
        ix: built.ix,
        feePayer: ctx.cfg.intentsProgramId,
        signer: undefined,
        signerRole: "relayer",
        dryRun: opts.raw.dry_run,
        setupReason: `${setupMissingRelayer} See ${HUMAN_MD}.`,
        extra,
      });
    }

    if (!ctx.agent.keypair) {
      return await dispatchIx({
        cfg: ctx.cfg,
        ix: built.ix,
        feePayer: relayerPk,
        signer: undefined,
        signerRole: "agent",
        dryRun: opts.raw.dry_run,
        setupReason: `GROKCHAIN_AGENT_KEYPAIR is missing. Agent must sign ${opts.intent}. Bot never holds SOL. See ${HUMAN_MD}.`,
        extra: { ...extra, fee_payer: relayerPk.toBase58() },
      });
    }

    const sent = await dispatchIx({
      cfg: ctx.cfg,
      ix: built.ix,
      feePayer: relayerPk,
      signer: ctx.relayer.keypair,
      extraSigners: [ctx.agent.keypair, ...(opts.extraSigners ?? [])],
      signerRole: "relayer",
      dryRun: opts.raw.dry_run,
      extra: { ...extra, fee_payer: relayerPk.toBase58() },
    });
    if (sent.status === "ok" && sent.signature && opts.movedSolOnOk) {
      sent.moved_sol = true;
    }
    return sent;
  } catch (e) {
    return asError(e, { intent: opts.intent });
  }
}

export function parseOptionalRemaining(
  raw: unknown,
): { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw new Error("remaining_accounts must be an array of {pubkey, isSigner?, isWritable?}");
  }
  return raw.map((item, i) => {
    if (typeof item === "string") {
      return { pubkey: parsePubkey(item, `remaining_accounts[${i}]`), isSigner: false, isWritable: false };
    }
    if (!item || typeof item !== "object" || typeof (item as { pubkey?: unknown }).pubkey !== "string") {
      throw new Error(`remaining_accounts[${i}] needs a pubkey`);
    }
    const rec = item as { pubkey: string; isSigner?: boolean; isWritable?: boolean };
    return {
      pubkey: parsePubkey(rec.pubkey, `remaining_accounts[${i}]`),
      isSigner: rec.isSigner === true,
      isWritable: rec.isWritable === true,
    };
  });
}
