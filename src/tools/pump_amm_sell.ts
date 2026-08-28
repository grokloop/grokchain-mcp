import { PublicKey } from "@solana/web3.js";
import { GROK_TOKEN_MINT, PUMP_AMM_PROGRAM_ID } from "../constants.js";
import { buildPumpAmmSellIx } from "../intents.js";
import { parsePubkey } from "../keys.js";
import { toBigInt, validatePumpAmmSell } from "../policy.js";
import { asError } from "../resolve.js";
import { parseOptionalRemaining, submitAgentIntent } from "./agent_intent.js";
import type { ToolResult } from "../types.js";

/**
 * Tight INTENTS `pump_amm_sell` client. Grant-gated PumpSwap sell.
 * Grant amount is 0 (sell spends tokens, not SOL). Pump-trader is remaining[1].
 * Quote unwrap stays on the trader, not the vault. Agent stays 0 SOL.
 * Sell remaining is 24. Do not pass buy's 26. Live on MAINNET INTENTS 3HCErAF.
 */
export async function pumpAmmSellTool(
  args: {
    mint?: string;
    base_amount_in?: number | string;
    min_quote_amount_out?: number | string;
    sponsor_lamports?: number | string;
    remaining_accounts?: unknown;
    root?: string;
    dry_run?: boolean;
  } = {},
): Promise<ToolResult> {
  try {
    const baseAmountIn = toBigInt(args.base_amount_in ?? 0, "base_amount_in");
    const minQuoteAmountOut = toBigInt(args.min_quote_amount_out ?? 0, "min_quote_amount_out");
    const sponsor = toBigInt(args.sponsor_lamports ?? 0, "sponsor_lamports");
    const mint = args.mint ? parsePubkey(args.mint, "mint") : new PublicKey(GROK_TOKEN_MINT);
    const remaining = parseOptionalRemaining(args.remaining_accounts);
    const { warnings } = validatePumpAmmSell({
      baseAmountIn,
      minQuoteAmountOut,
      sponsorLamports: sponsor,
    });

    return await submitAgentIntent({
      raw: args,
      intent: "pump_amm_sell",
      movedSolOnOk: false,
      extraFields: {
        mint: mint.toBase58(),
        base_amount_in: baseAmountIn.toString(),
        min_quote_amount_out: minQuoteAmountOut.toString(),
        sponsor_lamports: sponsor.toString(),
        pump_amm_program: PUMP_AMM_PROGRAM_ID,
        remaining_len: remaining.length,
        inner_ix: "sell",
        pump_user: "pump-trader remaining[1]",
        grant_amount: "0",
      },
      notes: warnings,
      build: ({ ctx, rootPk, agentPk, relayerPk }) => {
        return buildPumpAmmSellIx({
          coreProgramId: ctx.cfg.programId,
          intentsProgramId: ctx.cfg.intentsProgramId,
          root: rootPk,
          agent: agentPk,
          baseAmountIn,
          minQuoteAmountOut,
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
    return asError(e, { intent: "pump_amm_sell" });
  }
}
