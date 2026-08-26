import { connectionOf } from "../config.js";
import { fetchGrant, fetchGrokAccount } from "../accounts.js";
import { parsePubkey } from "../keys.js";
import { grantPda, grokAccountPda } from "../pda.js";
import { asError, missingRoot, openCtx, resolveAgentPubkey, resolveRootPubkey } from "../resolve.js";
import type { ToolResult } from "../types.js";

export async function getAccountTool(args: { root?: string }): Promise<ToolResult> {
  try {
    const ctx = openCtx(args);
    const rootPk = resolveRootPubkey(ctx, args.root);
    if (!rootPk) return missingRoot(ctx, { intent: "get_account" });
    const [grokAccount] = grokAccountPda(ctx.cfg.programId, rootPk);
    const acc = await fetchGrokAccount(connectionOf(ctx.cfg), grokAccount);
    return {
      status: "ok",
      cluster: ctx.cfg.cluster,
      program_id: ctx.cfg.programId.toBase58(),
      root: rootPk.toBase58(),
      grok_account: grokAccount.toBase58(),
      exists: acc !== null,
      account: acc,
      intent: "get_account",
    };
  } catch (e) {
    return asError(e);
  }
}

export async function getGrantTool(args: {
  agent?: string;
  root?: string;
}): Promise<ToolResult> {
  try {
    const ctx = openCtx(args);
    const rootPk = resolveRootPubkey(ctx, args.root);
    if (!rootPk) return missingRoot(ctx, { intent: "get_grant" });
    const agentPk = resolveAgentPubkey(ctx, args.agent);
    if (!agentPk) {
      return {
        status: "need_human_setup",
        reason: "agent pubkey required to derive the grant PDA. See HUMAN.md.",
        human: "HUMAN.md",
        root: rootPk.toBase58(),
      };
    }
    const [grokAccount] = grokAccountPda(ctx.cfg.programId, rootPk);
    const [grant] = grantPda(ctx.cfg.programId, grokAccount, agentPk);
    const decoded = await fetchGrant(connectionOf(ctx.cfg), grant);
    return {
      status: "ok",
      cluster: ctx.cfg.cluster,
      program_id: ctx.cfg.programId.toBase58(),
      root: rootPk.toBase58(),
      agent: agentPk.toBase58(),
      grok_account: grokAccount.toBase58(),
      grant: grant.toBase58(),
      exists: decoded !== null,
      grant_account: decoded,
      intent: "get_grant",
      notes: [
        "label is untrusted text.",
        "remaining = cap − spent. spend_cap_lamports is a counter, not a vault.",
        "sponsor_eligible means this grant may use YOUR paymaster — not a promise Grok Chain pays.",
      ],
    };
  } catch (e) {
    return asError(e);
  }
}

export function parsePubkeyArg(s: string, label: string) {
  return parsePubkey(s, label);
}
