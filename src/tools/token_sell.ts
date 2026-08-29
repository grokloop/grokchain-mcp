import { PublicKey } from "@solana/web3.js";
import { JUPITER_V6_PROGRAM_ID, USDC_MINT, WSOL_MINT } from "../constants.js";
import { buildTokenSellIx, deriveIntentsAddrs } from "../intents.js";
import { fetchJupiterQuote, fetchJupiterSwapInstructions, isSolMint, remainingFromSwapInstruction } from "../jupiter.js";
import { parsePubkey } from "../keys.js";
import { toBigInt, validateTokenTrade } from "../policy.js";
import { asError, openCtx, resolveRootPubkey } from "../resolve.js";
import { parseOptionalRemaining, submitAgentIntent } from "./agent_intent.js";
import type { ToolResult } from "../types.js";

/**
 * Tight INTENTS `token_sell` client. Grant-gated Jupiter v6.
 * Selling tokens for quote: check_grant(0). Selling WSOL/SOL: check_grant(sol).
 * User/trader pubkey = pump trader PDA. Not PumpPortal.
 */
export async function tokenSellTool(
  args: {
    input_mint?: string;
    output_mint?: string;
    in_amount?: number | string;
    min_out?: number | string;
    slippage_bps?: number | string;
    wrap_sol?: boolean;
    sponsor_lamports?: number | string;
    remaining_accounts?: unknown;
    jupiter_data?: string;
    root?: string;
    dry_run?: boolean;
  } = {},
): Promise<ToolResult> {
  try {
    const inputMint = args.input_mint ? parsePubkey(args.input_mint, "input_mint") : new PublicKey(USDC_MINT);
    const outputMint = args.output_mint ? parsePubkey(args.output_mint, "output_mint") : new PublicKey(WSOL_MINT);
    const inAmount = toBigInt(args.in_amount ?? 0, "in_amount");
    const slippageBps = Number(args.slippage_bps ?? 50);
    const sponsor = toBigInt(args.sponsor_lamports ?? 0, "sponsor_lamports");
    const wrapSol = args.wrap_sol ?? isSolMint(inputMint.toBase58());
    const { warnings } = validateTokenTrade({
      inAmount,
      minOut: toBigInt(args.min_out ?? 0, "min_out"),
      sponsorLamports: sponsor,
      wrapSol,
      inputMint: inputMint.toBase58(),
      kind: "sell",
    });

    const ctx = openCtx(args as Record<string, unknown>);
    const rootPk = resolveRootPubkey(ctx, args.root);
    if (!rootPk) {
      return asError(new Error("root pubkey required to derive pump-trader for Jupiter userPublicKey"), {
        intent: "token_sell",
      });
    }
    const addrs = deriveIntentsAddrs({
      coreProgramId: ctx.cfg.programId,
      intentsProgramId: ctx.cfg.intentsProgramId,
      root: rootPk,
    });
    const trader = addrs.pumpTrader;

    const supplied = parseOptionalRemaining(args.remaining_accounts);
    let remaining = supplied;
    let jupiterData: Buffer = args.jupiter_data ? Buffer.from(args.jupiter_data, "base64") : Buffer.alloc(0);
    let quoteNotes: string[] = [];
    let quoteOut = "";
    let quoteEndpoint = "";
    let swapEndpoint = "";
    let altCount = 0;

    if (supplied.length === 0 || jupiterData.length === 0) {
      const { quote, endpoint } = await fetchJupiterQuote({
        inputMint: inputMint.toBase58(),
        outputMint: outputMint.toBase58(),
        amount: inAmount.toString(),
        slippageBps: Number.isFinite(slippageBps) ? slippageBps : 50,
      });
      quoteEndpoint = endpoint;
      quoteOut = String(quote.outAmount ?? "");
      const { ixs, endpoint: swapEp } = await fetchJupiterSwapInstructions({
        quote,
        userPublicKey: trader.toBase58(),
        wrapAndUnwrapSol: wrapSol,
      });
      swapEndpoint = swapEp;
      const parsed = remainingFromSwapInstruction(ixs.swapInstruction);
      remaining = parsed.remaining;
      jupiterData = parsed.jupiterData;
      altCount = ixs.addressLookupTableAddresses?.length ?? 0;
      quoteNotes = [
        `Jupiter quote ${endpoint}. in=${quote.inAmount} out=${quote.outAmount}.`,
        `swap-instructions ${swapEp}. remaining=${parsed.remaining.length}. ALTs=${altCount}.`,
        "Used swapInstruction only. Adapter does not unwrap or sweep. Leftover stays on the trader.",
        "Do not use PumpPortal. Inner program is hardcoded Jupiter v6.",
      ];
    }

    const minOut = args.min_out != null ? toBigInt(args.min_out, "min_out") : BigInt(quoteOut || 0);

    return await submitAgentIntent({
      raw: args,
      intent: "token_sell",
      movedSolOnOk: wrapSol || isSolMint(inputMint.toBase58()),
      extraFields: {
        input_mint: inputMint.toBase58(),
        output_mint: outputMint.toBase58(),
        in_amount: inAmount.toString(),
        min_out: minOut.toString(),
        wrap_sol: wrapSol,
        sponsor_lamports: sponsor.toString(),
        jupiter_program: JUPITER_V6_PROGRAM_ID,
        remaining_len: remaining.length,
        jupiter_data_len: jupiterData.length,
        pump_trader: trader.toBase58(),
        quote_endpoint: quoteEndpoint || undefined,
        swap_endpoint: swapEndpoint || undefined,
        alt_count: altCount,
        inner_ix: "jupiter_v6_swap",
      },
      notes: [
        ...warnings,
        ...quoteNotes,
        "token_sell is Jupiter v6. Selling tokens for quote is check_grant(0). Selling WSOL/SOL is check_grant(sol).",
        "Old swap is still a grant-gated SOL send. Not an AMM of our own.",
        "Agent stays 0 SOL. Relayer fee-pays.",
      ],
      build: ({ ctx, rootPk, agentPk, relayerPk }) => {
        return buildTokenSellIx({
          coreProgramId: ctx.cfg.programId,
          intentsProgramId: ctx.cfg.intentsProgramId,
          root: rootPk,
          agent: agentPk,
          inAmount,
          minOut,
          sponsorLamports: sponsor,
          inputMint,
          outputMint,
          wrapSol,
          jupiterData,
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
    return asError(e, { intent: "token_sell" });
  }
}
