import { buildRevokeGrantIx } from "../core.js";
import { parsePubkey } from "../keys.js";
import { asError, missingRoot, openCtx, resolveRootPubkey } from "../resolve.js";
import { dispatchIx } from "../send.js";
import type { ToolResult } from "../types.js";

export async function revokeGrantTool(args: {
  agent: string;
  dry_run?: boolean;
  root?: string;
}): Promise<ToolResult> {
  try {
    const ctx = openCtx(args);
    const rootPk = resolveRootPubkey(ctx, args.root);
    if (!rootPk) return missingRoot(ctx);
    const agent = parsePubkey(args.agent, "agent");
    const built = buildRevokeGrantIx({
      programId: ctx.cfg.programId,
      root: rootPk,
      agent,
    });
    return await dispatchIx({
      cfg: ctx.cfg,
      ix: built.ix,
      feePayer: rootPk,
      signer: ctx.root.keypair,
      signerRole: "root",
      dryRun: args.dry_run,
      extra: {
        grok_account: built.grokAccount.toBase58(),
        grant: built.grant.toBase58(),
        root: rootPk.toBase58(),
        agent: agent.toBase58(),
        intent: "revoke_grant",
      },
    });
  } catch (e) {
    return asError(e);
  }
}
