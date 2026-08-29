/**
 * pay_token — pay an approved merchant in USDC (or any registered mint).
 *
 * Agent signs, relayer fee-pays, one CORE check_grant. The two payment-specific
 * guards: the payee must be on the root's allowlist, and a Solana Pay reference
 * rides along so the merchant can reconcile the invoice.
 */
import { PublicKey } from "@solana/web3.js";
import { HUMAN_MD, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, USDC_MINT } from "../constants.js";
import { parsePubkey } from "../keys.js";
import { toBigInt } from "../policy.js";
import { asError } from "../resolve.js";
import { buildPayTokenIx } from "../paytoken.js";
import { submitAgentIntent } from "./agent_intent.js";
import type { ToolResult } from "../types.js";

export async function payTokenTool(
  args: {
    to?: string;
    amount?: number | string;
    mint?: string;
    decimals?: number;
    reference?: string;
    token_2022?: boolean;
    sponsor_lamports?: number | string;
    root?: string;
    dry_run?: boolean;
  } = {},
): Promise<ToolResult> {
  try {
    if (!args.to) {
      return asError(new Error("pay_token requires `to` (the merchant's wallet, not their token account)"), {
        intent: "pay_token",
        code: "PayeeRequired",
      });
    }
    const amount = toBigInt(args.amount ?? 0, "amount");
    if (amount <= 0n) {
      return asError(new Error("amount must be greater than zero"), {
        intent: "pay_token",
        code: "ZeroAmount",
      });
    }
    const mint = parsePubkey(args.mint ?? USDC_MINT, "mint");
    const destinationOwner = parsePubkey(args.to, "to");
    const reference = args.reference ? parsePubkey(args.reference, "reference") : undefined;
    const decimals = args.decimals ?? 6;
    const sponsor = toBigInt(args.sponsor_lamports ?? 0, "sponsor_lamports");
    const tokenProgram = new PublicKey(
      args.token_2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
    );

    return await submitAgentIntent({
      raw: args,
      intent: "pay_token",
      movedSolOnOk: false,
      extraFields: {
        mint: mint.toBase58(),
        payee: destinationOwner.toBase58(),
        amount: amount.toString(),
        decimals,
        reference: reference?.toBase58(),
        token_program: tokenProgram.toBase58(),
        sponsor_lamports: sponsor.toString(),
      },
      notes: [
        "Pays an APPROVED merchant only: the destination's owner must be on the root's allowlist. A CORE grant caps an amount but cannot name a payee, which is why the allowlist exists.",
        "The grant cap is metered in RAW TOKEN UNITS here, not lamports — on a USDC registry a cap of 50000000 means 50 USDC. Use one agent per denomination or the cap stops meaning anything.",
        "TransferChecked is used, so Token-2022 mints with a transfer fee or hook work; decimals are read from the mint on chain and must match `decimals`.",
        reference
          ? "A Solana Pay reference is attached; the merchant can match this payment to the invoice."
          : "No reference passed — most merchants need one to reconcile the invoice.",
        "Requires an INTENTS upgrade: pay_token does not exist on the deployed binary yet.",
      ],
      build: ({ ctx, rootPk, agentPk, relayerPk }) =>
        buildPayTokenIx({
          coreProgramId: ctx.cfg.programId,
          intentsProgramId: ctx.cfg.intentsProgramId,
          root: rootPk,
          agent: agentPk,
          mint,
          destinationOwner,
          amount,
          decimals,
          sponsorLamports: sponsor,
          reference,
          tokenProgram,
          feePayer: relayerPk,
        }),
    });
  } catch (e) {
    return asError(e, { intent: "pay_token", moved_sol: false });
  }
}
