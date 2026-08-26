import { buildCheckGrantIx } from "../core.js";
import { connectionOf } from "../config.js";
import { HUMAN_MD } from "../constants.js";
import { parsePubkey } from "../keys.js";
import { fetchGrant } from "../accounts.js";
import { toBigInt, validateCheckGrant } from "../policy.js";
import {
  asError,
  missingRoot,
  openCtx,
  resolveAgentPubkey,
  resolveRootPubkey,
} from "../resolve.js";
import { dispatchIx, needHumanSetup } from "../send.js";
import type { ToolResult } from "../types.js";

export async function checkGrantTool(args: {
  amount_lamports: number | string;
  target_program: string;
  root?: string;
  agent?: string;
  dry_run?: boolean;
}): Promise<ToolResult> {
  try {
    const ctx = openCtx(args);
    const rootPk = resolveRootPubkey(ctx, args.root);
    if (!rootPk) return missingRoot(ctx, { intent: "check_grant" });
    const agentPk = resolveAgentPubkey(ctx, args.agent);
    if (!agentPk) {
      return needHumanSetup(
        ctx.cfg,
        `Agent pubkey unknown. Set GROKCHAIN_AGENT_KEYPAIR (path) or pass agent as a public key. ${HUMAN_MD}.`,
        { intent: "check_grant", root: rootPk.toBase58() },
      );
    }
    const target = parsePubkey(args.target_program, "target_program");
    const amount = toBigInt(args.amount_lamports, "amount_lamports");

    let allowedEmpty: boolean | undefined;
    let spendCap: bigint | undefined;
    try {
      const builtPreview = buildCheckGrantIx({
        programId: ctx.cfg.programId,
        root: rootPk,
        agent: agentPk,
        targetProgram: target,
        amountLamports: amount,
      });
      const grant = await fetchGrant(connectionOf(ctx.cfg), builtPreview.grant);
      if (grant) {
        allowedEmpty = grant.allowed_programs.length === 0;
        spendCap = BigInt(grant.spend_cap_lamports);
        if (!grant.allowed_programs.includes(target.toBase58())) {
          allowedEmpty = grant.allowed_programs.length === 0 ? true : allowedEmpty;
        }
      }
    } catch {
      // chain read is optional; client-side checks still run below
    }

    const { warnings } = validateCheckGrant({
      amountLamports: amount,
      spendCapLamports: spendCap,
      allowedEmpty,
    });

    const built = buildCheckGrantIx({
      programId: ctx.cfg.programId,
      root: rootPk,
      agent: agentPk,
      targetProgram: target,
      amountLamports: amount,
    });
    return await dispatchIx({
      cfg: ctx.cfg,
      ix: built.ix,
      feePayer: agentPk,
      signer: ctx.agent.keypair,
      signerRole: "agent",
      dryRun: args.dry_run,
      extra: {
        grok_account: built.grokAccount.toBase58(),
        grant: built.grant.toBase58(),
        root: rootPk.toBase58(),
        agent: agentPk.toBase58(),
        target_program: target.toBase58(),
        amount_lamports: amount.toString(),
        intent: "check_grant",
        notes: [
          ...warnings,
          "check_grant is the agent consume path. Agent signs. Root does not.",
          "This increments spent_lamports. It does not move SOL. Human pays gas.",
        ],
      },
    });
  } catch (e) {
    return asError(e);
  }
}
