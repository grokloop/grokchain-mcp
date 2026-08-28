/**
 * Read-only: resolve the PumpSwap pool and build the ordered account list for a
 * coin, without signing or sending anything.
 *
 * Use it to inspect what pump_amm_buy / pump_amm_sell would submit, or to hand
 * the list to another client. The trade tools call the same builder internally,
 * so a bot does not normally need this.
 */
import { PublicKey } from "@solana/web3.js";
import { connectionOf } from "../config.js";
import { GROK_TOKEN_MINT, HUMAN_MD } from "../constants.js";
import { deriveIntentsAddrs } from "../intents.js";
import { parsePubkey } from "../keys.js";
import { asError, missingRoot, openCtx, resolveRootPubkey } from "../resolve.js";
import { buildPumpAmmAccounts } from "../pump_amm_accounts.js";

import { resolveVenue } from "../venue.js";
import type { ToolResult } from "../types.js";

export async function pumpAmmDeriveTool(
  args: { mint?: string; kind?: string; root?: string; keep_cashback?: boolean } = {},
): Promise<ToolResult> {
  try {
    const ctx = openCtx(args as Record<string, unknown>);
    const rootPk = resolveRootPubkey(ctx, args.root);
    if (!rootPk) return missingRoot(ctx, { intent: "pump_amm_derive" });

    const mint = args.mint ? parsePubkey(args.mint, "mint") : new PublicKey(GROK_TOKEN_MINT);
    const kind = (args.kind ?? "buy").toLowerCase();
    if (kind !== "buy" && kind !== "sell") {
      return asError(new Error('kind must be "buy" or "sell"'), {
        intent: "pump_amm_derive",
        code: "BadKind",
      });
    }

    const connection = connectionOf(ctx.cfg);
    const { pumpTrader, spendVault, grokAccount } = deriveIntentsAddrs({
      coreProgramId: ctx.cfg.programId,
      intentsProgramId: ctx.cfg.intentsProgramId,
      root: rootPk,
    });
    const venue = await resolveVenue(connection, mint);
    const built = await buildPumpAmmAccounts({
      connection,
      mint,
      trader: pumpTrader,
      kind,
      keepCashback: args.keep_cashback === true,
    });

    return {
      status: "ok",
      intent: "pump_amm_derive",
      cluster: ctx.cfg.cluster,
      mint: mint.toBase58(),
      kind,
      venue_probe: venue,
      pool: built.pool,
      pool_info: built.poolInfo,
      base_token_program: built.baseTokenProgram,
      grok_account: grokAccount.toBase58(),
      spend_vault: spendVault.toBase58(),
      pump_trader: pumpTrader.toBase58(),
      dropped_cashback: built.droppedCashback,
      remaining_accounts: built.accounts.map((a) => ({
        pubkey: a.pubkey.toBase58(),
        isSigner: a.isSigner,
        isWritable: a.isWritable,
      })),
      moved_sol: false,
      notes: [
        "Read-only. Signs nothing and moves nothing.",
        `user (index 1) is this vault's pump-trader ${pumpTrader.toBase58()}.`,
        ...built.notes,
      ],
      human: HUMAN_MD,
    };
  } catch (e) {
    return asError(e, { intent: "pump_amm_derive", moved_sol: false });
  }
}
