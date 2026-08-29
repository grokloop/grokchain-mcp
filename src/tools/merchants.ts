/**
 * Root-only management of the payee allowlist.
 *
 * These are deliberately CLI/human tools and are NOT registered as MCP tools,
 * for the same reason the vault withdrawals are not: the bot must never be able
 * to widen who it may pay. It can spend, up to a cap, to names a human chose.
 */
import { PublicKey } from "@solana/web3.js";
import { connectionOf } from "../config.js";
import { HUMAN_MD, USDC_MINT } from "../constants.js";
import { deriveIntentsAddrs } from "../intents.js";
import { parsePubkey } from "../keys.js";
import {
  buildInitMerchantRegistryIx,
  buildMerchantIx,
  decodeMerchantRegistry,
  merchantRegistryPda,
} from "../paytoken.js";
import { asError, missingRoot, openCtx, resolveRootPubkey } from "../resolve.js";
import { dispatchIx } from "../send.js";
import type { ToolResult } from "../types.js";

const UPGRADE_NOTE =
  "Requires the INTENTS upgrade: the deployed program does not have the merchant instructions yet.";

export async function merchantInitTool(
  args: { mint?: string; root?: string; dry_run?: boolean } = {},
): Promise<ToolResult> {
  try {
    const ctx = openCtx(args as Record<string, unknown>);
    const rootPk = resolveRootPubkey(ctx, args.root);
    if (!rootPk) return missingRoot(ctx, { intent: "merchant_init" });
    const mint = parsePubkey(args.mint ?? USDC_MINT, "mint");

    const built = buildInitMerchantRegistryIx({
      coreProgramId: ctx.cfg.programId,
      intentsProgramId: ctx.cfg.intentsProgramId,
      root: rootPk,
      mint,
    });
    return await dispatchIx({
      cfg: ctx.cfg,
      ix: built.ix,
      feePayer: rootPk,
      signer: ctx.root.keypair,
      signerRole: "root",
      dryRun: args.dry_run,
      extra: {
        intent: "merchant_init",
        merchant_registry: built.merchantRegistry.toBase58(),
        mint: mint.toBase58(),
        moved_sol: false,
        notes: [
          "The registry pins ONE mint. That is what makes a grant cap denominate a single asset — a second currency needs a second agent.",
          "Only the root can add or remove payees. The agent can never widen this.",
          UPGRADE_NOTE,
        ],
      },
    });
  } catch (e) {
    return asError(e, { intent: "merchant_init" });
  }
}

async function updateMerchant(
  args: { merchant?: string; root?: string; dry_run?: boolean },
  remove: boolean,
): Promise<ToolResult> {
  const intent = remove ? "merchant_remove" : "merchant_add";
  try {
    if (!args.merchant) {
      return asError(new Error(`${intent} requires --merchant <wallet address>`), {
        intent,
        code: "MerchantRequired",
      });
    }
    const ctx = openCtx(args as Record<string, unknown>);
    const rootPk = resolveRootPubkey(ctx, args.root);
    if (!rootPk) return missingRoot(ctx, { intent });
    const merchant = parsePubkey(args.merchant, "merchant");

    const built = buildMerchantIx({
      coreProgramId: ctx.cfg.programId,
      intentsProgramId: ctx.cfg.intentsProgramId,
      root: rootPk,
      merchant,
      remove,
    });
    return await dispatchIx({
      cfg: ctx.cfg,
      ix: built.ix,
      feePayer: rootPk,
      signer: ctx.root.keypair,
      signerRole: "root",
      dryRun: args.dry_run,
      extra: {
        intent,
        merchant: merchant.toBase58(),
        merchant_registry: built.merchantRegistry.toBase58(),
        moved_sol: false,
        notes: remove
          ? [
              "Immediate: the next payment to this merchant fails, and every subscription to them stops with it.",
              "The merchant cannot refuse or delay this — there is no cancellation flow to navigate.",
              UPGRADE_NOTE,
            ]
          : [
              "This is the address the bot may now pay, up to the grant cap. Check it against the merchant's own published address before approving.",
              "Approving a payee does not move any money.",
              UPGRADE_NOTE,
            ],
      },
    });
  } catch (e) {
    return asError(e, { intent });
  }
}

export async function merchantAddTool(
  args: { merchant?: string; root?: string; dry_run?: boolean } = {},
): Promise<ToolResult> {
  return updateMerchant(args, false);
}

export async function merchantRemoveTool(
  args: { merchant?: string; root?: string; dry_run?: boolean } = {},
): Promise<ToolResult> {
  return updateMerchant(args, true);
}

/** Read-only: who may this bot pay? */
export async function merchantListTool(
  args: { root?: string } = {},
): Promise<ToolResult> {
  try {
    const ctx = openCtx(args as Record<string, unknown>);
    const rootPk = resolveRootPubkey(ctx, args.root);
    if (!rootPk) return missingRoot(ctx, { intent: "merchant_list" });

    const { grokAccount } = deriveIntentsAddrs({
      coreProgramId: ctx.cfg.programId,
      intentsProgramId: ctx.cfg.intentsProgramId,
      root: rootPk,
    });
    const [pda] = merchantRegistryPda(ctx.cfg.intentsProgramId, grokAccount);
    const info = await connectionOf(ctx.cfg).getAccountInfo(pda, "confirmed");
    if (!info) {
      return {
        status: "ok",
        intent: "merchant_list",
        merchant_registry: pda.toBase58(),
        merchants: [],
        moved_sol: false,
        notes: [
          "No allowlist exists yet. Until one does, every pay_token is refused — run `grokchain merchant init` first.",
        ],
        human: HUMAN_MD,
      };
    }
    const decoded = decodeMerchantRegistry(Buffer.from(info.data));
    if (!decoded) {
      return asError(new Error("registry account did not match the expected layout"), {
        intent: "merchant_list",
      });
    }
    return {
      status: "ok",
      intent: "merchant_list",
      merchant_registry: pda.toBase58(),
      mint: decoded.mint,
      merchants: decoded.merchants,
      count: decoded.merchants.length,
      moved_sol: false,
      notes: [
        "These are the only addresses the bot can pay. Anything else is refused on chain.",
        decoded.merchants.length === 0
          ? "The list is empty, so no payment can succeed yet."
          : `Payments are denominated in the registry mint ${decoded.mint}.`,
      ],
      human: HUMAN_MD,
    };
  } catch (e) {
    return asError(e, { intent: "merchant_list" });
  }
}
