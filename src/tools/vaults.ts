import { LAMPORTS_PER_SOL, PublicKey, type TransactionInstruction } from "@solana/web3.js";
import {
  fetchPaymaster,
  fetchSpendVault,
  spendableLamports,
  vaultRentMinimums,
} from "../accounts.js";
import { connectionOf } from "../config.js";
import {
  buildFundPaymasterIx,
  buildFundSpendVaultIx,
  buildInitPaymasterIx,
  buildInitSpendVaultIx,
  buildPausePaymasterIx,
  buildSetRelayerIx,
  buildUnpausePaymasterIx,
  buildWithdrawPaymasterIx,
  buildWithdrawPumpTraderIx,
  buildWithdrawSpendVaultIx,
  deriveIntentsAddrs,
  type VaultAddrs,
} from "../intents.js";
import { parsePubkey } from "../keys.js";
import { PolicyError, toBigInt } from "../policy.js";
import { asError, missingRoot, openCtx, resolveRootPubkey } from "../resolve.js";
import { dispatchIx } from "../send.js";
import type { ToolResult } from "../types.js";

function solToLamports(sol: number | string, label: string): bigint {
  const n = typeof sol === "number" ? sol : Number(sol);
  if (!Number.isFinite(n) || n <= 0) {
    throw new PolicyError("ZeroAmount", `${label} must be a positive number of SOL`);
  }
  return BigInt(Math.round(n * LAMPORTS_PER_SOL));
}

function coreOpts(ctx: ReturnType<typeof openCtx>, root: ReturnType<typeof resolveRootPubkey>) {
  return {
    coreProgramId: ctx.cfg.programId,
    intentsProgramId: ctx.cfg.intentsProgramId,
    root: root!,
  };
}

async function dispatchRoot(
  ctx: ReturnType<typeof openCtx>,
  rootPk: NonNullable<ReturnType<typeof resolveRootPubkey>>,
  built: { ix: TransactionInstruction } & VaultAddrs,
  extra: Record<string, unknown>,
  dryRun?: boolean,
): Promise<ToolResult> {
  return dispatchIx({
    cfg: ctx.cfg,
    ix: built.ix,
    feePayer: rootPk,
    signer: ctx.root.keypair,
    signerRole: "root",
    dryRun,
    extra: {
      grok_account: built.grokAccount.toBase58(),
      spend_vault: built.spendVault.toBase58(),
      paymaster: built.paymaster.toBase58(),
      root: rootPk.toBase58(),
      ...extra,
    },
  });
}

export async function initSpendVaultTool(args: { dry_run?: boolean; root?: string } = {}): Promise<ToolResult> {
  try {
    const ctx = openCtx(args);
    const rootPk = resolveRootPubkey(ctx, args.root);
    if (!rootPk) return missingRoot(ctx, { intent: "init_spend_vault" });
    const built = buildInitSpendVaultIx(coreOpts(ctx, rootPk));
    return await dispatchRoot(ctx, rootPk, built, { intent: "init_spend_vault" }, args.dry_run);
  } catch (e) {
    return asError(e);
  }
}

export async function fundSpendVaultTool(args: {
  sol: number | string;
  dry_run?: boolean;
  root?: string;
}): Promise<ToolResult> {
  try {
    const ctx = openCtx(args);
    const rootPk = resolveRootPubkey(ctx, args.root);
    if (!rootPk) return missingRoot(ctx, { intent: "fund_spend_vault" });
    const lamports = solToLamports(args.sol, "--sol");
    const built = buildFundSpendVaultIx({ ...coreOpts(ctx, rootPk), lamports });
    return await dispatchRoot(
      ctx,
      rootPk,
      built,
      { intent: "fund_spend_vault", sol: args.sol, lamports: lamports.toString() },
      args.dry_run,
    );
  } catch (e) {
    return asError(e);
  }
}

export async function withdrawSpendVaultTool(args: {
  sol: number | string;
  dry_run?: boolean;
  root?: string;
}): Promise<ToolResult> {
  try {
    const ctx = openCtx(args);
    const rootPk = resolveRootPubkey(ctx, args.root);
    if (!rootPk) return missingRoot(ctx, { intent: "withdraw_spend_vault" });
    const lamports = solToLamports(args.sol, "--sol");
    const built = buildWithdrawSpendVaultIx({ ...coreOpts(ctx, rootPk), lamports });
    return await dispatchRoot(
      ctx,
      rootPk,
      built,
      { intent: "withdraw_spend_vault", sol: args.sol, lamports: lamports.toString() },
      args.dry_run,
    );
  } catch (e) {
    return asError(e);
  }
}

export async function initPaymasterTool(args: {
  relayer: string;
  dry_run?: boolean;
  root?: string;
}): Promise<ToolResult> {
  try {
    const ctx = openCtx(args);
    const rootPk = resolveRootPubkey(ctx, args.root);
    if (!rootPk) return missingRoot(ctx, { intent: "init_paymaster" });
    const relayer = parsePubkey(args.relayer, "--relayer");
    const built = buildInitPaymasterIx({ ...coreOpts(ctx, rootPk), relayer });
    return await dispatchRoot(
      ctx,
      rootPk,
      built,
      { intent: "init_paymaster", relayer: relayer.toBase58() },
      args.dry_run,
    );
  } catch (e) {
    return asError(e);
  }
}

export async function fundPaymasterTool(args: {
  sol: number | string;
  dry_run?: boolean;
  root?: string;
}): Promise<ToolResult> {
  try {
    const ctx = openCtx(args);
    const rootPk = resolveRootPubkey(ctx, args.root);
    if (!rootPk) return missingRoot(ctx, { intent: "fund_paymaster" });
    const lamports = solToLamports(args.sol, "--sol");
    const built = buildFundPaymasterIx({ ...coreOpts(ctx, rootPk), lamports });
    return await dispatchRoot(
      ctx,
      rootPk,
      built,
      { intent: "fund_paymaster", sol: args.sol, lamports: lamports.toString() },
      args.dry_run,
    );
  } catch (e) {
    return asError(e);
  }
}

export async function withdrawPaymasterTool(args: {
  sol: number | string;
  dry_run?: boolean;
  root?: string;
}): Promise<ToolResult> {
  try {
    const ctx = openCtx(args);
    const rootPk = resolveRootPubkey(ctx, args.root);
    if (!rootPk) return missingRoot(ctx, { intent: "withdraw_paymaster" });
    const lamports = solToLamports(args.sol, "--sol");
    const built = buildWithdrawPaymasterIx({ ...coreOpts(ctx, rootPk), lamports });
    return await dispatchRoot(
      ctx,
      rootPk,
      built,
      { intent: "withdraw_paymaster", sol: args.sol, lamports: lamports.toString() },
      args.dry_run,
    );
  } catch (e) {
    return asError(e);
  }
}

export async function setRelayerTool(args: {
  relayer: string;
  dry_run?: boolean;
  root?: string;
}): Promise<ToolResult> {
  try {
    const ctx = openCtx(args);
    const rootPk = resolveRootPubkey(ctx, args.root);
    if (!rootPk) return missingRoot(ctx, { intent: "set_relayer" });
    const relayer = parsePubkey(args.relayer, "--relayer");
    const built = buildSetRelayerIx({ ...coreOpts(ctx, rootPk), relayer });
    return await dispatchRoot(
      ctx,
      rootPk,
      built,
      { intent: "set_relayer", relayer: relayer.toBase58() },
      args.dry_run,
    );
  } catch (e) {
    return asError(e);
  }
}

export async function pausePaymasterTool(args: { dry_run?: boolean; root?: string } = {}): Promise<ToolResult> {
  try {
    const ctx = openCtx(args);
    const rootPk = resolveRootPubkey(ctx, args.root);
    if (!rootPk) return missingRoot(ctx, { intent: "pause_paymaster" });
    const built = buildPausePaymasterIx(coreOpts(ctx, rootPk));
    return await dispatchRoot(ctx, rootPk, built, { intent: "pause_paymaster" }, args.dry_run);
  } catch (e) {
    return asError(e);
  }
}

export async function unpausePaymasterTool(args: { dry_run?: boolean; root?: string } = {}): Promise<ToolResult> {
  try {
    const ctx = openCtx(args);
    const rootPk = resolveRootPubkey(ctx, args.root);
    if (!rootPk) return missingRoot(ctx, { intent: "unpause_paymaster" });
    const built = buildUnpausePaymasterIx(coreOpts(ctx, rootPk));
    return await dispatchRoot(ctx, rootPk, built, { intent: "unpause_paymaster" }, args.dry_run);
  } catch (e) {
    return asError(e);
  }
}

export async function vaultStatus(args: { root?: string; agent?: string } = {}): Promise<ToolResult> {
  try {
    const ctx = openCtx(args);
    const rootPk = resolveRootPubkey(ctx, args.root);
    if (!rootPk) return missingRoot(ctx, { intent: "status" });
    const agentPk = args.agent
      ? parsePubkey(args.agent, "--agent")
      : ctx.agent.pubkey;
    const addrs = deriveIntentsAddrs({
      coreProgramId: ctx.cfg.programId,
      intentsProgramId: ctx.cfg.intentsProgramId,
      root: rootPk,
      agent: agentPk,
    });
    const connection = connectionOf(ctx.cfg);
    let rent = { spend_vault: 0, paymaster: 0 };
    try {
      rent = await vaultRentMinimums(connection);
    } catch {
      rent = { spend_vault: 0, paymaster: 0 };
    }
    const [spend, pm] = await Promise.all([
      fetchSpendVault(connection, addrs.spendVault),
      fetchPaymaster(connection, addrs.paymaster),
    ]);
    return {
      status: "ok",
      cluster: ctx.cfg.cluster,
      program_id: ctx.cfg.programId.toBase58(),
      intents_program_id: ctx.cfg.intentsProgramId.toBase58(),
      root: rootPk.toBase58(),
      grok_account: addrs.grokAccount.toBase58(),
      spend_vault: {
        address: addrs.spendVault.toBase58(),
        exists: spend !== null,
        lamports: spend?.lamports ?? 0,
        rent_lamports: rent.spend_vault,
        spendable_lamports: spend ? spendableLamports(spend.lamports, rent.spend_vault) : 0,
        note: "pay source. Human funds this vault.",
      },
      paymaster: {
        address: addrs.paymaster.toBase58(),
        exists: pm !== null,
        lamports: pm?.lamports ?? 0,
        rent_lamports: rent.paymaster,
        spendable_lamports: pm ? spendableLamports(pm.lamports, rent.paymaster) : 0,
        relayer: pm?.relayer ?? null,
        paused: pm?.paused ?? null,
        note: "gas vault. Human funds this. Relayer is reimbursed from here. Not a promise Grok Chain pays.",
      },
      intent: "status",
    };
  } catch (e) {
    return asError(e);
  }
}


export async function withdrawPumpTraderTool(args: {
  lamports?: number | string;
  sol?: number | string;
  atas?: string | string[];
  dry_run?: boolean;
  root?: string;
} = {}): Promise<ToolResult> {
  try {
    const ctx = openCtx(args);
    const rootPk = resolveRootPubkey(ctx, args.root);
    if (!rootPk) return missingRoot(ctx, { intent: "withdraw_pump_trader" });
    let lamports: bigint;
    if (args.lamports !== undefined && args.lamports !== "") {
      const n = toBigInt(args.lamports, "--lamports");
      if (n < 0n) throw new PolicyError("ZeroAmount", "--lamports must be >= 0");
      lamports = n;
    } else if (args.sol !== undefined && args.sol !== "") {
      lamports = solToLamports(args.sol, "--sol");
    } else {
      lamports = 0n;
    }
    const rawAtas = args.atas;
    const list: string[] = Array.isArray(rawAtas)
      ? rawAtas
      : typeof rawAtas === "string" && rawAtas.trim()
        ? rawAtas.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    if (list.length % 2 !== 0) {
      throw new PolicyError("WithdrawRemainingAccountsOdd", "--atas must be even from,to pairs");
    }
    const tokenPairs: Array<{ from: PublicKey; to: PublicKey }> = [];
    for (let i = 0; i < list.length; i += 2) {
      tokenPairs.push({
        from: parsePubkey(list[i]!, "--atas from"),
        to: parsePubkey(list[i + 1]!, "--atas to"),
      });
    }
    const built = buildWithdrawPumpTraderIx({
      ...coreOpts(ctx, rootPk),
      lamports,
      tokenPairs,
    });
    return await dispatchIx({
      cfg: ctx.cfg,
      ix: built.ix,
      feePayer: rootPk,
      signer: ctx.root.keypair,
      signerRole: "root",
      dryRun: args.dry_run,
      extra: {
        grok_account: built.grokAccount.toBase58(),
        pump_trader: built.pumpTrader.toBase58(),
        root: rootPk.toBase58(),
        intent: "withdraw_pump_trader",
        lamports: lamports.toString(),
        token_pairs: tokenPairs.map((p) => ({ from: p.from.toBase58(), to: p.to.toBase58() })),
        note: "root-only. not grant-gated. agent cannot call. 0 lamports = SOL no-op.",
      },
    });
  } catch (e) {
    return asError(e);
  }
}

export function requirePositiveLamports(v: number | string, label: string): bigint {
  const n = toBigInt(v, label);
  if (n <= 0n) throw new PolicyError("ZeroAmount", `${label} must be greater than zero`);
  return n;
}
