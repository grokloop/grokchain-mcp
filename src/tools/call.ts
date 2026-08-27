import { buildCallIx } from "../intents.js";
import { parsePubkey } from "../keys.js";
import { toBigInt, validateCall } from "../policy.js";
import { asError } from "../resolve.js";
import { parseOptionalRemaining, submitAgentIntent } from "./agent_intent.js";
import type { ToolResult } from "../types.js";

/**
 * Implemented INTENTS `call` client. Grant-gated router.
 * amount 0 = policy ping. amount > 0 debits SpendVault.
 * remaining_accounts empty = grant-checked only.
 */
export async function callTool(
  args: {
    target_program?: string;
    to?: string;
    amount_lamports?: number | string;
    sponsor_lamports?: number | string;
    remaining_accounts?: unknown;
    root?: string;
    dry_run?: boolean;
  } = {},
): Promise<ToolResult> {
  try {
    if (!args.target_program) {
      return asError(new Error("call requires `target_program` (inner program; CORE still allowlists INTENTS)"));
    }
    const target = parsePubkey(args.target_program, "target_program");
    const amount = toBigInt(args.amount_lamports ?? 0, "amount_lamports");
    const sponsor = toBigInt(args.sponsor_lamports ?? 0, "sponsor_lamports");
    if (amount > 0n && !args.to) {
      return asError(new Error("call with amount_lamports > 0 requires `to` (recipient)"));
    }
    const recipient = args.to ? parsePubkey(args.to, "to") : target;
    const remaining = parseOptionalRemaining(args.remaining_accounts);
    const { warnings } = validateCall({ amountLamports: amount, sponsorLamports: sponsor });

    return await submitAgentIntent({
      raw: args,
      intent: "call",
      movedSolOnOk: amount > 0n,
      extraFields: {
        target_program: target.toBase58(),
        to: recipient.toBase58(),
        amount_lamports: amount.toString(),
        sponsor_lamports: sponsor.toString(),
        remaining_len: remaining.length,
      },
      notes: warnings,
      build: ({ ctx, rootPk, agentPk, relayerPk }) =>
        buildCallIx({
          coreProgramId: ctx.cfg.programId,
          intentsProgramId: ctx.cfg.intentsProgramId,
          root: rootPk,
          agent: agentPk,
          recipient,
          targetProgram: target,
          amountLamports: amount,
          sponsorLamports: sponsor,
          feePayer: relayerPk,
          remainingAccounts: remaining.map((a) => ({
            pubkey: a.pubkey,
            isSigner: a.isSigner,
            isWritable: a.isWritable,
          })),
        }),
    });
  } catch (e) {
    return asError(e, { intent: "call" });
  }
}
