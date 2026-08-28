import { SystemProgram } from "@solana/web3.js";
import { buildSwapIx } from "../intents.js";
import { parsePubkey } from "../keys.js";
import { toBigInt, validateSwap } from "../policy.js";
import { asError } from "../resolve.js";
import { submitAgentIntent } from "./agent_intent.js";
import type { ToolResult } from "../types.js";

/**
 * Implemented INTENTS `swap` client. Grant-gated SOL send with min_out.
 * Not Jupiter. Not an AMM. Not SPL. Not pump.fun.
 * For a real pump.fun trade use pump_buy / pump_sell.
 * Agent signs. Relayer fee-pays. Bot never holds SOL.
 */
export async function swapTool(
  args: {
    to?: string;
    amount_in_lamports?: number | string;
    min_out_lamports?: number | string;
    sponsor_lamports?: number | string;
    root?: string;
    dry_run?: boolean;
  } = {},
): Promise<ToolResult> {
  try {
    const to = args.to ?? "";
    if (!to) {
      return asError(new Error("swap requires `to` (out_destination pubkey)"));
    }
    const recipient = parsePubkey(to, "to");
    const amountIn = toBigInt(args.amount_in_lamports ?? 0, "amount_in_lamports");
    const minOut = toBigInt(args.min_out_lamports ?? args.amount_in_lamports ?? 0, "min_out_lamports");
    const sponsor = toBigInt(args.sponsor_lamports ?? 0, "sponsor_lamports");
    const { warnings } = validateSwap({
      amountInLamports: amountIn,
      minOutLamports: minOut,
      sponsorLamports: sponsor,
    });
    void SystemProgram;

    return await submitAgentIntent({
      raw: args,
      intent: "swap",
      movedSolOnOk: true,
      extraFields: {
        to: recipient.toBase58(),
        amount_in_lamports: amountIn.toString(),
        min_out_lamports: minOut.toString(),
        sponsor_lamports: sponsor.toString(),
      },
      notes: warnings,
      build: ({ ctx, rootPk, agentPk, relayerPk }) =>
        buildSwapIx({
          coreProgramId: ctx.cfg.programId,
          intentsProgramId: ctx.cfg.intentsProgramId,
          root: rootPk,
          agent: agentPk,
          outDestination: recipient,
          amountInLamports: amountIn,
          minOutLamports: minOut,
          sponsorLamports: sponsor,
          feePayer: relayerPk,
        }),
    });
  } catch (e) {
    return asError(e, { intent: "swap" });
  }
}
