import { PublicKey } from "@solana/web3.js";
import { GROK_TOKEN_MINT, PUMP_AMM_PROGRAM_ID } from "../constants.js";
import { buildPumpAmmBuyIx } from "../intents.js";
import { parsePubkey } from "../keys.js";
import { toBigInt, validatePumpAmmBuy } from "../policy.js";
import { asError } from "../resolve.js";
import { parseOptionalRemaining, submitAgentIntent } from "./agent_intent.js";
import type { ToolResult } from "../types.js";

/**
 * Tight INTENTS `pump_amm_buy` client. Grant-gated PumpSwap buy_exact_quote_in.
 * Pump-trader PDA is remaining[1] user. SpendVault is never user.
 * Agent signs INTENTS. Relayer fee-pays. Agent stays 0 SOL.
 * Not a general router. Not Jupiter. Live on MAINNET INTENTS 3HCErAF.
 */
export async function pumpAmmBuyTool(
  args: {
    mint?: string;
    spendable_quote_in?: number | string;
    min_base_amount_out?: number | string;
    max_sol_cost?: number | string;
    sponsor_lamports?: number | string;
    remaining_accounts?: unknown;
    root?: string;
    dry_run?: boolean;
  } = {},
): Promise<ToolResult> {
  try {
    const spendableQuoteIn = toBigInt(args.spendable_quote_in ?? 0, "spendable_quote_in");
    const minBaseAmountOut = toBigInt(args.min_base_amount_out ?? 0, "min_base_amount_out");
    const maxSolCost = toBigInt(args.max_sol_cost ?? args.spendable_quote_in ?? 0, "max_sol_cost");
    const sponsor = toBigInt(args.sponsor_lamports ?? 0, "sponsor_lamports");
    const mint = args.mint ? parsePubkey(args.mint, "mint") : new PublicKey(GROK_TOKEN_MINT);
    const remaining = parseOptionalRemaining(args.remaining_accounts);
    const { warnings } = validatePumpAmmBuy({
      spendableQuoteIn,
      minBaseAmountOut,
      maxSolCost,
      sponsorLamports: sponsor,
    });

    return await submitAgentIntent({
      raw: args,
      intent: "pump_amm_buy",
      movedSolOnOk: true,
      extraFields: {
        mint: mint.toBase58(),
        spendable_quote_in: spendableQuoteIn.toString(),
        min_base_amount_out: minBaseAmountOut.toString(),
        max_sol_cost: maxSolCost.toString(),
        sponsor_lamports: sponsor.toString(),
        pump_amm_program: PUMP_AMM_PROGRAM_ID,
        remaining_len: remaining.length,
        inner_ix: "buy_exact_quote_in",
        pump_user: "pump-trader remaining[1]",
      },
      notes: warnings,
      build: ({ ctx, rootPk, agentPk, relayerPk }) => {
        return buildPumpAmmBuyIx({
          coreProgramId: ctx.cfg.programId,
          intentsProgramId: ctx.cfg.intentsProgramId,
          root: rootPk,
          agent: agentPk,
          spendableQuoteIn,
          minBaseAmountOut,
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
    return asError(e, { intent: "pump_amm_buy" });
  }
}
