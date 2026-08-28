import { PUMP_PROGRAM_ID } from "../constants.js";
import { buildPumpCreateIx } from "../intents.js";
import { parsePubkey } from "../keys.js";
import { rejectSecretFields, toBigInt, validatePumpCreate } from "../policy.js";
import { asError } from "../resolve.js";
import { parseOptionalRemaining, submitAgentIntent } from "./agent_intent.js";
import type { ToolResult } from "../types.js";

/**
 * Tight INTENTS `pump_create` client. Grant-gated pump.fun create_v2.
 * Mint is a NEW Token-2022 keypair signed by the client (relayer/root).
 * This MCP never accepts or prints mint secret / keypair JSON.
 * Pump-trader PDA is pump `user`. SpendVault is never user.
 * Creator recorded on-chain is grok_account.root.
 * Agent signs INTENTS. Relayer fee-pays.
 * Live on MAINNET INTENTS 3HCErAF after the upgrade.
 */
export async function pumpCreateTool(
  args: {
    mint?: string;
    name?: string;
    symbol?: string;
    uri?: string;
    is_mayhem_mode?: boolean;
    is_cashback_enabled?: boolean;
    max_sol_cost?: number | string;
    sponsor_lamports?: number | string;
    remaining_accounts?: unknown;
    root?: string;
    dry_run?: boolean;
  } = {},
): Promise<ToolResult> {
  try {
    rejectSecretFields(args as Record<string, unknown>);
    if (!args.mint) {
      throw new Error("pump_create requires mint (client Token-2022 pubkey). Never send a keypair/secret.");
    }
    const mint = parsePubkey(args.mint, "mint");
    const name = args.name ?? "";
    const symbol = args.symbol ?? "";
    const uri = args.uri ?? "";
    const maxSolCost = toBigInt(args.max_sol_cost ?? 0, "max_sol_cost");
    const sponsor = toBigInt(args.sponsor_lamports ?? 0, "sponsor_lamports");
    const remaining = parseOptionalRemaining(args.remaining_accounts);
    const { warnings } = validatePumpCreate({
      name,
      symbol,
      uri,
      maxSolCost,
      sponsorLamports: sponsor,
    });

    return await submitAgentIntent({
      raw: args,
      intent: "pump_create",
      movedSolOnOk: true,
      extraFields: {
        mint: mint.toBase58(),
        name,
        symbol,
        uri,
        is_mayhem_mode: args.is_mayhem_mode === true,
        is_cashback_enabled: args.is_cashback_enabled === true,
        max_sol_cost: maxSolCost.toString(),
        sponsor_lamports: sponsor.toString(),
        pump_program: PUMP_PROGRAM_ID,
        remaining_len: remaining.length,
        inner_ix: "create_v2",
        pump_user: "pump-trader",
        creator: "grok_account.root",
        mint_signer: "client (relayer/root). MCP never accepts mint secret.",
      },
      notes: warnings,
      build: ({ ctx, rootPk, agentPk, relayerPk }) => {
        return buildPumpCreateIx({
          coreProgramId: ctx.cfg.programId,
          intentsProgramId: ctx.cfg.intentsProgramId,
          root: rootPk,
          agent: agentPk,
          mint,
          name,
          symbol,
          uri,
          isMayhemMode: args.is_mayhem_mode === true,
          isCashbackEnabled: args.is_cashback_enabled === true,
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
    return asError(e, { intent: "pump_create" });
  }
}
