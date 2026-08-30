import { Keypair, PublicKey } from "@solana/web3.js";
import { connectionOf } from "../config.js";
import { PUMP_PROGRAM_ID } from "../constants.js";
import { buildPumpCreateIx, deriveIntentsAddrs } from "../intents.js";
import { loadKeypairFromPath, parsePubkey } from "../keys.js";
import { rejectSecretFields, toBigInt, validatePumpCreate } from "../policy.js";
import { buildPumpCreateAccounts } from "../pump_create_accounts.js";
import { asError, missingRoot, openCtx, resolveRootPubkey } from "../resolve.js";
import { parseOptionalRemaining, submitAgentIntent } from "./agent_intent.js";
import type { ToolResult } from "../types.js";

/**
 * Tight INTENTS `pump_create` client. Grant-gated pump.fun create_v2.
 *
 * THE MINT KEY
 * pump.fun requires the new mint to sign its own creation. That key is neither
 * the agent's nor the relayer's, so this tool supplies it — generated here,
 * held in memory for one transaction, never written to disk, never printed, and
 * dropped when the call returns. That is safe precisely because the key is
 * worthless afterwards: create_v2 hands mint authority to pump.fun's own PDA,
 * so nothing can be minted with it again.
 *
 * Pass `mint_keypair_path` instead when the address itself matters — a vanity
 * mint ending in `pump`, say. Same rule as every other key here: a PATH, never
 * inline secret material.
 *
 * Everything else is unchanged: the pump-trader PDA is the pump `user` and pays,
 * SpendVault is never user, the creator recorded on chain is grok_account.root
 * rather than the agent, the agent signs INTENTS, and the relayer fee-pays so
 * the bot stays at 0 SOL.
 */
export async function pumpCreateTool(
  args: {
    name?: string;
    symbol?: string;
    uri?: string;
    mint_keypair_path?: string;
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

    // A vanity mint is a file path; anything else gets a throwaway key.
    const mintKeypair = args.mint_keypair_path
      ? loadKeypairFromPath(args.mint_keypair_path)
      : Keypair.generate();
    const mint = mintKeypair.publicKey;

    const name = args.name ?? "";
    const symbol = args.symbol ?? "";
    const uri = args.uri ?? "";
    const maxSolCost = toBigInt(args.max_sol_cost ?? 0, "max_sol_cost");
    const sponsor = toBigInt(args.sponsor_lamports ?? 0, "sponsor_lamports");
    const { warnings } = validatePumpCreate({
      name,
      symbol,
      uri,
      maxSolCost,
      sponsorLamports: sponsor,
    });

    // The account list needs chain access (flags come from a real create_v2), so
    // it is resolved here rather than inside the synchronous build callback.
    const ctx = openCtx(args as Record<string, unknown>);
    const rootPk = resolveRootPubkey(ctx, args.root);
    if (!rootPk) return missingRoot(ctx, { intent: "pump_create" });
    const { pumpTrader, spendVault } = deriveIntentsAddrs({
      coreProgramId: ctx.cfg.programId,
      intentsProgramId: ctx.cfg.intentsProgramId,
      root: rootPk,
    });

    const supplied = parseOptionalRemaining(args.remaining_accounts);
    const notes = [...warnings];
    let remaining = supplied;
    let templateSignature: string | undefined;

    if (supplied.length === 0) {
      const built = await buildPumpCreateAccounts({
        connection: connectionOf(ctx.cfg),
        mint,
        trader: pumpTrader,
        spendVault,
      });
      remaining = built.accounts.map((a) => ({
        pubkey: a.pubkey,
        isSigner: a.isSigner,
        isWritable: a.isWritable,
      }));
      templateSignature = built.templateSignature;
      notes.push(...built.notes);
    } else {
      notes.push(
        "remaining_accounts was supplied, so the derived create_v2 list was not used. " +
          "Flags are yours to get right; a wrong one is rejected by pump.fun, not by INTENTS.",
      );
    }

    return await submitAgentIntent({
      raw: args,
      intent: "pump_create",
      movedSolOnOk: true,
      extraSigners: [mintKeypair],
      extraFields: {
        mint: mint.toBase58(),
        mint_source: args.mint_keypair_path ? "keypair path (vanity)" : "generated for this launch",
        name,
        symbol,
        uri,
        is_mayhem_mode: args.is_mayhem_mode === true,
        is_cashback_enabled: args.is_cashback_enabled === true,
        max_sol_cost: maxSolCost.toString(),
        sponsor_lamports: sponsor.toString(),
        pump_program: PUMP_PROGRAM_ID,
        remaining_len: remaining.length,
        account_template: templateSignature ?? "supplied by caller",
        inner_ix: "create_v2",
        pump_user: "pump-trader",
        creator: "grok_account.root",
        mint_signer: "ephemeral, in-memory, never persisted or printed",
      },
      notes,
      build: ({ ctx: c, rootPk: r, agentPk, relayerPk }) => {
        return buildPumpCreateIx({
          coreProgramId: c.cfg.programId,
          intentsProgramId: c.cfg.intentsProgramId,
          root: r,
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

/**
 * Read-only: show the create_v2 account list a launch would submit, without
 * signing, sending, or spending a mint keypair on it.
 *
 * Worth running before the first mainnet launch — it proves a template was found
 * and that every derived PDA agrees with it, which is exactly what fails if
 * pump.fun changes its layout.
 */
export async function pumpCreateDeriveTool(
  args: { mint?: string; root?: string } = {},
): Promise<ToolResult> {
  try {
    const ctx = openCtx(args as Record<string, unknown>);
    const rootPk = resolveRootPubkey(ctx, args.root);
    if (!rootPk) return missingRoot(ctx, { intent: "pump_create_derive" });

    // A throwaway pubkey is fine here: nothing is signed, and the per-mint PDAs
    // are what we want to see derived.
    const mint = args.mint ? parsePubkey(args.mint, "mint") : Keypair.generate().publicKey;
    const { pumpTrader, spendVault, grokAccount } = deriveIntentsAddrs({
      coreProgramId: ctx.cfg.programId,
      intentsProgramId: ctx.cfg.intentsProgramId,
      root: rootPk,
    });

    const built = await buildPumpCreateAccounts({
      connection: connectionOf(ctx.cfg),
      mint,
      trader: pumpTrader,
      spendVault,
    });

    const LABELS = [
      "mint (new, signs)",
      "mint_authority",
      "bonding_curve",
      "associated_bonding_curve",
      "global",
      "user = pump-trader PDA (pays)",
      "system_program",
      "token_program (Token-2022)",
      "associated_token_program",
      "mayhem_program",
      "global_params",
      "sol_vault",
      "mayhem_state",
      "mayhem_token_vault",
      "event_authority",
      "pump_program",
    ];

    return {
      status: "ok",
      intent: "pump_create_derive",
      mint: mint.toBase58(),
      mint_is_placeholder: !args.mint,
      grok_account: grokAccount.toBase58(),
      pump_trader: pumpTrader.toBase58(),
      account_template: built.templateSignature,
      accounts: built.accounts.map((a, i) => ({
        index: i,
        label: LABELS[i] ?? `template account ${i}`,
        pubkey: a.pubkey.toBase58(),
        isSigner: a.isSigner,
        isWritable: a.isWritable,
      })),
      moved_sol: false,
      notes: [
        ...built.notes,
        "Read-only. Nothing was signed or sent, and no mint keypair was spent.",
        "The pump-trader PDA must hold at least max_sol_cost before a launch — pump_create does not debit the vault in-instruction.",
      ],
    };
  } catch (e) {
    return asError(e, { intent: "pump_create_derive" });
  }
}
