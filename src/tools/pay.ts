import { HUMAN_MD } from "../constants.js";
import { buildPayIx } from "../intents.js";
import { parsePubkey } from "../keys.js";
import { toBigInt, validatePay } from "../policy.js";
import {
  asError,
  missingRoot,
  openCtx,
  resolveRootPubkey,
} from "../resolve.js";
import { dispatchIx, needHumanSetup } from "../send.js";
import type { ToolResult } from "../types.js";

/**
 * Implemented INTENTS `pay` client.
 * Agent signs. Relayer is the ONLY outer fee payer. Bot never holds SOL.
 * Never sends a system transfer disguised as pay.
 */
export async function payTool(args: {
  to: string;
  amount_lamports: number | string;
  sponsor_lamports?: number | string;
  root?: string;
  dry_run?: boolean;
}): Promise<ToolResult> {
  try {
    const ctx = openCtx(args);
    const recipient = parsePubkey(args.to, "to");
    const amount = toBigInt(args.amount_lamports, "amount_lamports");
    const sponsor = toBigInt(args.sponsor_lamports ?? 0, "sponsor_lamports");
    const { warnings } = validatePay({ amountLamports: amount, sponsorLamports: sponsor });

    const rootPk = resolveRootPubkey(ctx, args.root);
    if (!rootPk) return missingRoot(ctx, { intent: "pay" });

    const agentPk = ctx.agent.pubkey;
    if (!agentPk) {
      return needHumanSetup(
        ctx.cfg,
        "GROKCHAIN_AGENT_KEYPAIR is missing. Agent signs pay as a public identity. The bot never holds SOL and never is the fee payer.",
        { intent: "pay", root: rootPk.toBase58() },
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
        intent: "pay",
      };
    }

    const built = buildPayIx({
      coreProgramId: ctx.cfg.programId,
      intentsProgramId: ctx.cfg.intentsProgramId,
      root: rootPk,
      agent: agentPk,
      recipient,
      amountLamports: amount,
      sponsorLamports: sponsor,
      feePayer: relayerPk,
    });

    const extra = {
      grok_account: built.grokAccount.toBase58(),
      grant: built.grant.toBase58(),
      spend_vault: built.spendVault.toBase58(),
      paymaster: built.paymaster.toBase58(),
      root: rootPk.toBase58(),
      agent: agentPk.toBase58(),
      to: recipient.toBase58(),
      amount_lamports: amount.toString(),
      sponsor_lamports: sponsor.toString(),
      fee_payer: relayerPk?.toBase58(),
      intents_program_id: ctx.cfg.intentsProgramId.toBase58(),
      intent: "pay",
      moved_sol: false,
      notes: [
        ...warnings,
        "This is the INTENTS pay instruction, not a system transfer.",
        "Relayer is the outer fee payer. Bot never holds SOL.",
      ],
    };

    const setupMissingRelayer =
      sponsor > 0n
        ? "GROKCHAIN_RELAYER_KEYPAIR is required when sponsor_lamports > 0. The relayer is the fee payer and the only address reimbursed. Do not fall back to the agent. Do not ask the bot for a key."
        : "Relayer must submit; bot never holds SOL. Set GROKCHAIN_RELAYER_KEYPAIR (path). The agent signs pay but is never the fee payer and never the SOL source.";

    if (!relayerPk || !ctx.relayer.keypair) {
      return await dispatchIx({
        cfg: ctx.cfg,
        ix: built.ix,
        feePayer: ctx.cfg.intentsProgramId,
        signer: undefined,
        signerRole: "relayer",
        dryRun: args.dry_run,
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
        dryRun: args.dry_run,
        setupReason: `GROKCHAIN_AGENT_KEYPAIR is missing. Agent must sign pay. Bot never holds SOL. See ${HUMAN_MD}.`,
        extra: { ...extra, fee_payer: relayerPk.toBase58() },
      });
    }

    const sent = await dispatchIx({
      cfg: ctx.cfg,
      ix: built.ix,
      feePayer: relayerPk,
      signer: ctx.relayer.keypair,
      extraSigners: [ctx.agent.keypair],
      signerRole: "relayer",
      dryRun: args.dry_run,
      extra: { ...extra, fee_payer: relayerPk.toBase58() },
    });
    if (sent.status === "ok" && sent.signature) {
      sent.moved_sol = true;
    }
    return sent;
  } catch (e) {
    return asError(e);
  }
}
