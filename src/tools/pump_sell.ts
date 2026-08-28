import { PublicKey } from "@solana/web3.js";
import { GROK_TOKEN_MINT, PUMP_PROGRAM_ID } from "../constants.js";
import { buildPumpSellIx } from "../intents.js";
import { parsePubkey } from "../keys.js";
import { toBigInt, validatePumpSell } from "../policy.js";
import { asError } from "../resolve.js";
import { parseOptionalRemaining, submitAgentIntent } from "./agent_intent.js";
import { guardCurveVenue } from "./venue_guard.js";
import type { ToolResult } from "../types.js";

/**
 * Tight INTENTS `pump_sell` client. Grant-gated pump.fun sell_v2.
 * Grant amount is 0 (sell spends tokens, not SOL). Pump-trader is pump `user`.
 * Mainnet allowed after INTENTS upgrade (3HCErAF full router).
 */
export async function pumpSellTool(
  args: {
    mint?: string;
    amount?: number | string;
    min_sol_output?: number | string;
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
    const minSolOutput = toBigInt(args.min_sol_output ?? 0, "min_sol_output");
    const sponsor = toBigInt(args.sponsor_lamports ?? 0, "sponsor_lamports");
    const mint = args.mint ? parsePubkey(args.mint, "mint") : new PublicKey(GROK_TOKEN_MINT);
    const remaining = parseOptionalRemaining(args.remaining_accounts);
    const { warnings } = validatePumpSell({ amount, minSolOutput, sponsorLamports: sponsor });

    // A graduated coin cannot trade on the curve: buy_v2/sell_v2 fail and the
    // transaction is wasted. Probe the curve's `complete` flag first.
    const routed = await guardCurveVenue(mint, "pump_sell", "pump_amm_sell", args.venue);
    if (routed) return routed;

    return await submitAgentIntent({
      raw: args,
      intent: "pump_sell",
      movedSolOnOk: false,
      extraFields: {
        mint: mint.toBase58(),
        amount: amount.toString(),
        min_sol_output: minSolOutput.toString(),
        sponsor_lamports: sponsor.toString(),
        pump_program: PUMP_PROGRAM_ID,
        remaining_len: remaining.length,
        inner_ix: "sell_v2",
        pump_user: "pump-trader",
        grant_amount: "0",
      },
      notes: warnings,
      build: ({ ctx, rootPk, agentPk, relayerPk }) => {
        return buildPumpSellIx({
          coreProgramId: ctx.cfg.programId,
          intentsProgramId: ctx.cfg.intentsProgramId,
          root: rootPk,
          agent: agentPk,
          amount,
          minSolOutput,
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
    return asError(e, { intent: "pump_sell" });
  }
}
