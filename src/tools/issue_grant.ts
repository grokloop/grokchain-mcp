import { PublicKey } from "@solana/web3.js";
import { buildIssueGrantIx } from "../core.js";
import { parsePubkey } from "../keys.js";
import { toBigInt, toUnix, validatePolicy } from "../policy.js";
import { asError, missingRoot, openCtx, resolveRootPubkey } from "../resolve.js";
import { dispatchIx } from "../send.js";
import type { GrantPolicyInput, ToolResult } from "../types.js";

export async function issueGrantTool(
  args: GrantPolicyInput & { agent: string; dry_run?: boolean; root?: string },
): Promise<ToolResult> {
  try {
    const ctx = openCtx(args);
    const rootPk = resolveRootPubkey(ctx, args.root);
    if (!rootPk) return missingRoot(ctx);
    const agent = parsePubkey(args.agent, "agent");
    const allowed = args.allowed_programs.map((p, i) =>
      parsePubkey(p, `allowed_programs[${i}]`),
    );
    const spendCap = toBigInt(args.spend_cap_lamports, "spend_cap_lamports");
    const expires = toUnix(args.expires_at_unix, "expires_at_unix");
    const { warnings } = validatePolicy({
      spendCapLamports: spendCap,
      allowedPrograms: allowed,
      expiresAtUnix: expires,
    });
    const built = buildIssueGrantIx({
      programId: ctx.cfg.programId,
      root: rootPk,
      agent,
      policy: {
        spendCapLamports: spendCap,
        allowedPrograms: allowed,
        expiresAtUnix: expires,
        sponsorEligible: args.sponsor_eligible ?? false,
        label: args.label,
      },
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
        spend_cap_lamports: spendCap.toString(),
        allowed_programs: allowed.map((p: PublicKey) => p.toBase58()),
        expires_at_unix: expires,
        sponsor_eligible: args.sponsor_eligible ?? false,
        label: args.label ?? "",
        label_untrusted: true,
        intent: "issue_grant",
        notes: warnings,
      },
    });
  } catch (e) {
    return asError(e);
  }
}
