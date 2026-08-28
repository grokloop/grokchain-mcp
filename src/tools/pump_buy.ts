import { PublicKey } from "@solana/web3.js";
import { GROK_TOKEN_MINT, PUMP_PROGRAM_ID } from "../constants.js";
import { buildPumpBuyIx } from "../intents.js";
import { parsePubkey } from "../keys.js";
import { toBigInt, validatePumpBuy } from "../policy.js";
import { asError } from "../resolve.js";
import { parseOptionalRemaining, submitAgentIntent } from "./agent_intent.js";
import { guardCurveVenue } from "./venue_guard.js";
import type { ToolResult } from "../types.js";

/**
 * Tight INTENTS `pump_buy` client. Grant-gated pump.fun buy_v2.
 * Pump-trader PDA is pump `user` (remaining[13]). SpendVault is never user.
 * Agent signs INTENTS. Relayer fee-pays.
 * Not a general router. Not Jupiter. Live on MAINNET INTENTS 3HCErAF.
 */
export async function pumpBuyTool(
  args: {
    mint?: string;
    amount?: number | string;
    max_sol_cost?: number | string;
    sponsor_lamports?: number | string;
    remaining_accounts?: unknown;
    root?: string;
    dry_run?: boolean;
    /** "auto" (default) probes the curve; "curve" forces it; "amm" rejects. */
    venue?: string;
  } = {},
): Promise<ToolResult> {
  try {
    const amount = toBigInt(args.amount ?? 0, "amount");
    const maxSolCost = toBigInt(args.max_sol_cost ?? 0, "max_sol_cost");
    const sponsor = toBigInt(args.sponsor_lamports ?? 0, "sponsor_lamports");
    const mint = args.mint ? parsePubkey(args.mint, "mint") : new PublicKey(GROK_TOKEN_MINT);
    const remaining = parseOptionalRemaining(args.remaining_accounts);
    const { warnings } = validatePumpBuy({ amount, maxSolCost, sponsorLamports: sponsor });

    // A graduated coin cannot trade on the curve: buy_v2/sell_v2 fail and the
    // transaction is wasted. Probe the curve's `complete` flag first.
    const routed = await guardCurveVenue(mint, "pump_buy", "pump_amm_buy", args.venue);
    if (routed) return routed;

    return await submitAgentIntent({
      raw: args,
      intent: "pump_buy",
      movedSolOnOk: true,
      extraFields: {
        mint: mint.toBase58(),
        amount: amount.toString(),
        max_sol_cost: maxSolCost.toString(),
        sponsor_lamports: sponsor.toString(),
        pump_program: PUMP_PROGRAM_ID,
        remaining_len: remaining.length,
        inner_ix: "buy_v2",
        pump_user: "pump-trader",
      },
      notes: warnings,
      build: ({ ctx, rootPk, agentPk, relayerPk }) => {
        return buildPumpBuyIx({
          coreProgramId: ctx.cfg.programId,
          intentsProgramId: ctx.cfg.intentsProgramId,
          root: rootPk,
          agent: agentPk,
          amount,
          maxSolCost,
          sponsorLamports: sponsor,
          feePayer: relayerPk,
          remainingAccounts: remaining.map((a) => ({
            pubkey: a.pubkey,
            isSigner: a.isSigner,
            isWritable: a.isWritable,
          })),
        });
      },
    });
  } catch (e) {
    return asError(e, { intent: "pump_buy" });
  }
}
