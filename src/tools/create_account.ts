import { buildCreateAccountIx } from "../core.js";
import { asError, missingRoot, openCtx, resolveRootPubkey } from "../resolve.js";
import { dispatchIx } from "../send.js";
import type { ToolResult } from "../types.js";

export async function createAccountTool(args: {
  dry_run?: boolean;
  root?: string;
}): Promise<ToolResult> {
  try {
    const ctx = openCtx(args);
    const rootPk = resolveRootPubkey(ctx, args.root);
    if (!rootPk) return missingRoot(ctx);
    const built = buildCreateAccountIx({
      programId: ctx.cfg.programId,
      root: rootPk,
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
        root: rootPk.toBase58(),
        intent: "create_account",
      },
    });
  } catch (e) {
    return asError(e);
  }
}
