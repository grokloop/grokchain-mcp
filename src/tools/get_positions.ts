/**
 * Read-only book for this vault's pump-trader: native SOL, every token position
 * across both token programs, and an optional mark per position.
 *
 * Signs nothing, sends nothing. This is the read the exit ladder runs on.
 */
import { PublicKey } from "@solana/web3.js";
import { connectionOf } from "../config.js";
import { HUMAN_MD } from "../constants.js";
import { deriveIntentsAddrs } from "../intents.js";
import { readBook } from "../positions.js";
import { asError, missingRoot, openCtx, resolveRootPubkey } from "../resolve.js";
import type { ToolResult } from "../types.js";

export async function getPositionsTool(
  args: { root?: string; marks?: boolean; include_dust?: boolean } = {},
): Promise<ToolResult> {
  try {
    const ctx = openCtx(args as Record<string, unknown>);
    const rootPk = resolveRootPubkey(ctx, args.root);
    if (!rootPk) return missingRoot(ctx, { intent: "get_positions", moved_sol: false });

    const { pumpTrader, spendVault, grokAccount } = deriveIntentsAddrs({
      coreProgramId: ctx.cfg.programId,
      intentsProgramId: ctx.cfg.intentsProgramId,
      root: rootPk,
    });

    const book = await readBook({
      connection: connectionOf(ctx.cfg),
      owner: pumpTrader,
      withMarks: args.marks !== false,
      includeDust: args.include_dust === true,
    });

    return {
      status: "ok",
      intent: "get_positions",
      cluster: ctx.cfg.cluster,
      grok_account: grokAccount.toBase58(),
      spend_vault: spendVault.toBase58(),
      pump_trader: pumpTrader.toBase58(),
      native_sol: book.nativeSol,
      native_lamports: book.nativeLamports,
      position_count: book.positions.length,
      total_position_value_sol: book.totalPositionValueSol,
      positions: book.positions,
      moved_sol: false,
      notes: [
        "Read-only. Signs nothing and moves nothing.",
        "Marks are PRE-FEE constant-product quotes from live reserves — use them to decide whether to exit, not as a fill price. Bound the fill with the venue's own min_out / max_sol_cost.",
        "Both the classic Token and Token-2022 programs are queried; a $GrokChain bag lives under Token-2022.",
        ...book.notes,
      ],
      human: HUMAN_MD,
    };
  } catch (e) {
    return asError(e, { intent: "get_positions", moved_sol: false });
  }
}
