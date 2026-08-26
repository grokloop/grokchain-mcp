import { existsSync } from "node:fs";
import path from "node:path";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  fetchGrant,
  fetchGrokAccount,
  fetchPaymaster,
  fetchSpendVault,
  spendableLamports,
  vaultRentMinimums,
  type DecodedGrant,
} from "./accounts.js";
import { connectionOf, loadConfig, type AppConfig } from "./config.js";
import {
  DEVNET_CORE_PROGRAM_ID,
  DEVNET_INTENTS_PROGRAM_ID,
  HUMAN_MD,
  LOCAL_ONLY_INTENTS_PROGRAM_ID,
  LOCAL_ONLY_PROGRAM_ID,
} from "./constants.js";
import {
  defaultAgentPath,
  defaultRelayerPath,
  defaultRootPath,
  ensureKeystore,
  loadKeypairFromPath,
  planKeystoreAction,
} from "./keys.js";
import { grantPda, grokAccountPda, paymasterPda, spendVaultPda } from "./pda.js";
import { createAccountTool } from "./tools/create_account.js";
import { issueGrantTool } from "./tools/issue_grant.js";
import { reviseGrantTool } from "./tools/revise_grant.js";
import {
  fundPaymasterTool,
  fundSpendVaultTool,
  initPaymasterTool,
  initSpendVaultTool,
} from "./tools/vaults.js";
import type { ToolResult } from "./types.js";

export const SETUP_GRANT_CAP_LAMPORTS = 50_000_000;
export const SETUP_GRANT_TTL_SECONDS = 30 * 24 * 60 * 60;
export const SETUP_GRANT_LABEL = "grok-bot";
export const SETUP_SPEND_FUND_SOL = 0.03;
export const SETUP_PAYMASTER_FUND_SOL = 0.02;
export const SETUP_AIRDROP_SOL = 1;
export const SETUP_FAUCET_CMD = "solana airdrop 2 --url https://api.devnet.solana.com";
export const SETUP_FAUCET_URL = "https://faucet.solana.com";
export const SETUP_DEVNET_RPC = "https://api.devnet.solana.com";
export const SETUP_SPEND_FLOOR_LAMPORTS = 10_000_000;
export const SETUP_PAYMASTER_FLOOR_LAMPORTS = 5_000_000;
export const SETUP_MIN_ROOT_LAMPORTS =
  Math.round(SETUP_SPEND_FUND_SOL * LAMPORTS_PER_SOL) +
  Math.round(SETUP_PAYMASTER_FUND_SOL * LAMPORTS_PER_SOL) +
  20_000_000;

const BANNED_LOCAL_ONLY_IDS = new Set([
  LOCAL_ONLY_PROGRAM_ID,
  LOCAL_ONLY_INTENTS_PROGRAM_ID,
]);

export type SetupGrantPlan = {
  spend_cap_lamports: number;
  expires_at_unix: number;
  allowed_programs: string[];
  sponsor_eligible: boolean;
  label: string;
};

export type McpSnippet = {
  mcpServers: {
    grokchain: {
      command: string;
      args: string[];
      env: {
        GROKCHAIN_CLUSTER: "devnet";
        GROKCHAIN_ROOT_KEYPAIR: string;
        GROKCHAIN_AGENT_KEYPAIR: string;
        GROKCHAIN_RELAYER_KEYPAIR: string;
      };
    };
  };
};

export type SetupPlan = {
  cluster: "devnet";
  rpcUrl: string;
  coreProgramId: string;
  intentsProgramId: string;
  rootKeypairPath: string;
  agentKeypairPath: string;
  relayerKeypairPath: string;
  agentKeystoreAction: "reuse" | "create";
  relayerKeystoreAction: "reuse" | "create";
  grant: SetupGrantPlan;
  spendFundSol: number;
  paymasterFundSol: number;
  mcp: McpSnippet;
  oneLiner: string;
};

export type SetupResult = {
  status: "ok" | "need_human_setup" | "error";
  reason?: string;
  cluster?: "devnet";
  core?: string;
  intents?: string;
  root?: string;
  agent?: string;
  relayer?: string;
  paths?: {
    GROKCHAIN_ROOT_KEYPAIR: string;
    GROKCHAIN_AGENT_KEYPAIR: string;
    GROKCHAIN_RELAYER_KEYPAIR: string;
  };
  mcp?: McpSnippet;
  one_liner?: string;
  steps?: Record<string, string>;
  faucet?: { cmd: string; url: string };
  human?: typeof HUMAN_MD;
};

function resolveAbs(p: string): string {
  if (p.startsWith("~")) {
    const home = process.env.HOME ?? defaultRootPath().replace(/\/.config\/solana\/id\.json$/, "");
    return path.resolve(p.replace(/^~(?=\/|$)/, home));
  }
  return path.resolve(p);
}

export function refuseBannedLocalId(id: string, label: string): never | void {
  if (BANNED_LOCAL_ONLY_IDS.has(id)) {
    throw new Error(
      `Refusing ${label} program id ${id}: it is local-only, not a deployed program, not valid on devnet.`,
    );
  }
}

export function assertDevnetProgramIds(core: string, intents: string): void {
  refuseBannedLocalId(core, "CORE");
  refuseBannedLocalId(intents, "INTENTS");
}

export function planSetupGrant(opts?: { nowUnix?: number }): SetupGrantPlan {
  const now = opts?.nowUnix ?? Math.floor(Date.now() / 1000);
  return {
    spend_cap_lamports: SETUP_GRANT_CAP_LAMPORTS,
    expires_at_unix: now + SETUP_GRANT_TTL_SECONDS,
    allowed_programs: [DEVNET_INTENTS_PROGRAM_ID],
    sponsor_eligible: true,
    label: SETUP_GRANT_LABEL,
  };
}

export function buildMcpSnippet(paths: {
  root: string;
  agent: string;
  relayer: string;
}): McpSnippet {
  return {
    mcpServers: {
      grokchain: {
        command: "npx",
        args: ["-y", "github:grokloop/grokchain-mcp", "grokchain-mcp"],
        env: {
          GROKCHAIN_CLUSTER: "devnet",
          GROKCHAIN_ROOT_KEYPAIR: paths.root,
          GROKCHAIN_AGENT_KEYPAIR: paths.agent,
          GROKCHAIN_RELAYER_KEYPAIR: paths.relayer,
        },
      },
    },
  };
}

export function buildSetupOneLiner(rootPath: string): string {
  return `GROKCHAIN_CLUSTER=devnet GROKCHAIN_ROOT_KEYPAIR=${rootPath} grokchain setup --devnet`;
}

export function isSetupDevnet(cmd: string[], flags: Record<string, string | boolean>): boolean {
  if (cmd[0] !== "setup") return false;
  return flags.devnet === true || cmd[1] === "devnet";
}

/** npx github:grokloop/grokchain-mcp grokchain setup --devnet passes a leading bin name. */
export function normalizeCliCmd(cmd: string[]): string[] {
  if (cmd[0] === "grokchain" || cmd[0] === "grokchain-mcp") {
    return cmd.slice(1);
  }
  return cmd;
}

export function planSetupDevnet(opts?: {
  nowUnix?: number;
  rootPath?: string;
  agentPath?: string;
  relayerPath?: string;
  coreProgramId?: string;
  intentsProgramId?: string;
  agentExists?: boolean;
  relayerExists?: boolean;
}): SetupPlan {
  const core = opts?.coreProgramId ?? DEVNET_CORE_PROGRAM_ID;
  const intents = opts?.intentsProgramId ?? DEVNET_INTENTS_PROGRAM_ID;
  assertDevnetProgramIds(core, intents);

  const rootKeypairPath = resolveAbs(opts?.rootPath ?? defaultRootPath());
  const agentKeypairPath = resolveAbs(opts?.agentPath ?? defaultAgentPath());
  const relayerKeypairPath = resolveAbs(opts?.relayerPath ?? defaultRelayerPath());

  const agentExists = opts?.agentExists ?? existsSync(agentKeypairPath);
  const relayerExists = opts?.relayerExists ?? existsSync(relayerKeypairPath);

  return {
    cluster: "devnet",
    rpcUrl: SETUP_DEVNET_RPC,
    coreProgramId: core,
    intentsProgramId: intents,
    rootKeypairPath,
    agentKeypairPath,
    relayerKeypairPath,
    agentKeystoreAction: planKeystoreAction(agentExists),
    relayerKeystoreAction: planKeystoreAction(relayerExists),
    grant: planSetupGrant({ nowUnix: opts?.nowUnix }),
    spendFundSol: SETUP_SPEND_FUND_SOL,
    paymasterFundSol: SETUP_PAYMASTER_FUND_SOL,
    mcp: buildMcpSnippet({
      root: rootKeypairPath,
      agent: agentKeypairPath,
      relayer: relayerKeypairPath,
    }),
    oneLiner: buildSetupOneLiner(rootKeypairPath),
  };
}

export function looksAlreadyExists(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("already in use") ||
    m.includes("already initialized") ||
    m.includes("alreadyinitialized") ||
    m.includes("already exists") ||
    m.includes("alreadyactive") ||
    m.includes("grant already active") ||
    m.includes("account already") ||
    m.includes("already inited")
  );
}

export function grantLooksReady(grant: DecodedGrant, nowUnix: number, intentsId: string): boolean {
  return !grant.revoked && grant.expires_at_unix > nowUnix && grant.allowed_programs.includes(intentsId);
}

function writeLine(out: (s: string) => void, line: string): void {
  out(line.endsWith("\n") ? line : `${line}\n`);
}

function forceDevnetEnv(plan: SetupPlan): void {
  process.env.GROKCHAIN_CLUSTER = "devnet";
  process.env.GROKCHAIN_ROOT_KEYPAIR = plan.rootKeypairPath;
  process.env.GROKCHAIN_AGENT_KEYPAIR = plan.agentKeypairPath;
  process.env.GROKCHAIN_RELAYER_KEYPAIR = plan.relayerKeypairPath;
}

function resultText(result: ToolResult): string {
  return `${result.error ?? ""} ${result.reason ?? ""} ${result.status}`;
}

function needRootMissing(rootPath: string): SetupResult {
  return {
    status: "need_human_setup",
    reason: `GROKCHAIN_ROOT_KEYPAIR is missing. Set it to ${rootPath} (path to your Solana CLI wallet JSON). Never paste a seed.`,
    paths: {
      GROKCHAIN_ROOT_KEYPAIR: rootPath,
      GROKCHAIN_AGENT_KEYPAIR: resolveAbs(defaultAgentPath()),
      GROKCHAIN_RELAYER_KEYPAIR: resolveAbs(defaultRelayerPath()),
    },
    human: HUMAN_MD,
  };
}

function needSol(rootPath: string, pubkey: string, lamports: number): SetupResult {
  return {
    status: "need_human_setup",
    reason: `need SOL on the root (${pubkey}, ${lamports} lamports). ${SETUP_FAUCET_CMD}`,
    faucet: { cmd: SETUP_FAUCET_CMD, url: SETUP_FAUCET_URL },
    paths: {
      GROKCHAIN_ROOT_KEYPAIR: rootPath,
      GROKCHAIN_AGENT_KEYPAIR: resolveAbs(defaultAgentPath()),
      GROKCHAIN_RELAYER_KEYPAIR: resolveAbs(defaultRelayerPath()),
    },
    human: HUMAN_MD,
  };
}

async function confirmIfNeeded(yes: boolean, out: (s: string) => void): Promise<boolean> {
  if (yes || !process.stdin.isTTY) return true;
  writeLine(out, "Continue? [y/N] (pass --yes to skip)");
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question("")).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

export async function runSetupDevnet(opts: {
  yes?: boolean;
  stdout?: (s: string) => void;
} = {}): Promise<SetupResult> {
  const out = opts.stdout ?? ((s: string) => process.stdout.write(s));
  const steps: Record<string, string> = {};

  const plan = planSetupDevnet();
  forceDevnetEnv(plan);

  writeLine(out, "== grokchain setup --devnet ==");
  writeLine(out, `cluster: ${plan.cluster}`);
  writeLine(out, `CORE: ${plan.coreProgramId}`);
  writeLine(out, `INTENTS: ${plan.intentsProgramId}`);
  writeLine(out, `rpc: ${plan.rpcUrl}`);

  if (!existsSync(plan.rootKeypairPath)) {
    const result = needRootMissing(plan.rootKeypairPath);
    writeLine(out, `need_human_setup: ${result.reason}`);
    writeLine(out, "Never ask for a seed.");
    return result;
  }

  let rootPubkey: string;
  try {
    rootPubkey = loadKeypairFromPath(plan.rootKeypairPath).publicKey.toBase58();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeLine(out, `error: failed to load root keypair path ${plan.rootKeypairPath}: ${msg}`);
    writeLine(out, "Never paste a seed. Env names a PATH.");
    return {
      status: "error",
      reason: `failed to load GROKCHAIN_ROOT_KEYPAIR at ${plan.rootKeypairPath}`,
      human: HUMAN_MD,
    };
  }
  writeLine(out, `root: ${rootPubkey}`);
  writeLine(out, `root path: ${plan.rootKeypairPath}`);

  const agentKs = ensureKeystore(plan.agentKeypairPath);
  const relayerKs = ensureKeystore(plan.relayerKeypairPath);
  writeLine(
    out,
    `agent: ${agentKs.pubkey.toBase58()}  path: ${agentKs.path}  (${agentKs.reused ? "reused" : "created"} 0600)`,
  );
  writeLine(
    out,
    `relayer: ${relayerKs.pubkey.toBase58()}  path: ${relayerKs.path}  (${relayerKs.reused ? "reused" : "created"} 0600)`,
  );
  steps.keystores = `agent ${agentKs.reused ? "reused" : "created"}; relayer ${relayerKs.reused ? "reused" : "created"}`;

  let cfg: AppConfig;
  try {
    cfg = loadConfig();
    assertDevnetProgramIds(cfg.programId.toBase58(), cfg.intentsProgramId.toBase58());
    if (cfg.cluster !== "devnet") {
      throw new Error(`setup --devnet forced cluster=devnet, got ${cfg.cluster}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeLine(out, `error: ${msg}`);
    return { status: "error", reason: msg, human: HUMAN_MD, steps };
  }

  writeLine(out, `loaded CORE: ${cfg.programId.toBase58()}`);
  writeLine(out, `loaded INTENTS: ${cfg.intentsProgramId.toBase58()}`);

  const proceeded = await confirmIfNeeded(opts.yes === true, out);
  if (!proceeded) {
    writeLine(out, "aborted.");
    return { status: "error", reason: "aborted", human: HUMAN_MD, steps };
  }

  const connection = connectionOf(cfg);
  const rootPk = new PublicKey(rootPubkey);

  let airdropped = false;
  try {
    const sig = await connection.requestAirdrop(rootPk, SETUP_AIRDROP_SOL * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    airdropped = true;
    steps.airdrop = `ok ${sig}`;
    writeLine(out, `airdrop: requested ${SETUP_AIRDROP_SOL} SOL, confirmed ${sig}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    steps.airdrop = `failed: ${msg}`;
    writeLine(out, `airdrop: failed (${msg}). faucet dry / 429 is common.`);
    writeLine(out, `  run: ${SETUP_FAUCET_CMD}`);
    writeLine(out, `  or:  ${SETUP_FAUCET_URL}`);
  }

  let rootLamports = 0;
  try {
    rootLamports = await connection.getBalance(rootPk, "confirmed");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeLine(out, `error: could not read root balance: ${msg}`);
    return { status: "error", reason: `could not read root balance: ${msg}`, human: HUMAN_MD, steps };
  }
  writeLine(out, `root balance: ${rootLamports} lamports${airdropped ? " (after airdrop)" : ""}`);

  if (!airdropped && rootLamports < SETUP_MIN_ROOT_LAMPORTS) {
    writeLine(out, "need_human: need SOL on the root");
    writeLine(out, `  ${SETUP_FAUCET_CMD}`);
    writeLine(out, `  ${SETUP_FAUCET_URL}`);
    return needSol(plan.rootKeypairPath, rootPubkey, rootLamports);
  }

  const [grokAccount] = grokAccountPda(cfg.programId, rootPk);
  const existingAccount = await fetchGrokAccount(connection, grokAccount).catch(() => null);
  if (existingAccount) {
    steps.create_account = "already exists (ok)";
    writeLine(out, `create_account: already exists (ok) ${grokAccount.toBase58()}`);
  } else {
    const created = await createAccountTool({});
    if (created.status === "ok" || looksAlreadyExists(resultText(created))) {
      steps.create_account = created.status === "ok" ? `ok ${created.signature ?? ""}`.trim() : "already exists (ok)";
      writeLine(out, `create_account: ${steps.create_account}`);
    } else {
      const again = await fetchGrokAccount(connection, grokAccount).catch(() => null);
      if (again) {
        steps.create_account = "already exists (ok)";
        writeLine(out, `create_account: already exists (ok)`);
      } else {
        writeLine(out, `create_account: ${created.status} ${created.error ?? created.reason ?? ""}`);
        return {
          status: created.status === "need_human_setup" ? "need_human_setup" : "error",
          reason: created.error ?? created.reason ?? "create_account failed",
          human: HUMAN_MD,
          steps,
        };
      }
    }
  }

  const [grantAddr] = grantPda(cfg.programId, grokAccount, agentKs.pubkey);
  const now = Math.floor(Date.now() / 1000);
  const existingGrant = await fetchGrant(connection, grantAddr).catch(() => null);
  if (existingGrant && grantLooksReady(existingGrant, now, cfg.intentsProgramId.toBase58())) {
    steps.issue_grant = "skipped (active grant already ready)";
    writeLine(out, `issue_grant: skipped (active grant already ready) ${grantAddr.toBase58()}`);
  } else if (existingGrant) {
    const revised = await reviseGrantTool({
      agent: agentKs.pubkey.toBase58(),
      spend_cap_lamports: plan.grant.spend_cap_lamports,
      expires_at_unix: plan.grant.expires_at_unix,
      allowed_programs: plan.grant.allowed_programs,
      sponsor_eligible: true,
      label: plan.grant.label,
    });
    if (revised.status === "ok") {
      steps.issue_grant = `revised ${revised.signature ?? ""}`.trim();
      writeLine(out, `issue_grant: revised to setup defaults`);
    } else if (looksAlreadyExists(resultText(revised))) {
      steps.issue_grant = "GrantAlreadyActive (ok, already ready)";
      writeLine(out, `issue_grant: GrantAlreadyActive (ok)`);
    } else {
      const again = await fetchGrant(connection, grantAddr).catch(() => null);
      if (again && grantLooksReady(again, now, cfg.intentsProgramId.toBase58())) {
        steps.issue_grant = "GrantAlreadyActive (ok, already ready)";
        writeLine(out, `issue_grant: existing grant looks ready; continuing`);
      } else {
        writeLine(out, `issue_grant/revise: ${revised.status} ${revised.error ?? revised.reason ?? ""}`);
        writeLine(out, "continuing: do not fail the whole setup on GrantAlreadyActive if status already looks ready.");
        steps.issue_grant = `revise ${revised.status} (continued)`;
      }
    }
  } else {
    const issued = await issueGrantTool({
      agent: agentKs.pubkey.toBase58(),
      spend_cap_lamports: plan.grant.spend_cap_lamports,
      expires_at_unix: plan.grant.expires_at_unix,
      allowed_programs: plan.grant.allowed_programs,
      sponsor_eligible: true,
      label: plan.grant.label,
    });
    if (issued.status === "ok") {
      steps.issue_grant = `ok ${issued.signature ?? ""}`.trim();
      writeLine(out, `issue_grant: ok allowlist ${DEVNET_INTENTS_PROGRAM_ID} cap ${SETUP_GRANT_CAP_LAMPORTS}`);
    } else if (looksAlreadyExists(resultText(issued))) {
      steps.issue_grant = "GrantAlreadyActive (ok)";
      writeLine(out, `issue_grant: GrantAlreadyActive (ok)`);
    } else {
      const again = await fetchGrant(connection, grantAddr).catch(() => null);
      if (again && grantLooksReady(again, now, cfg.intentsProgramId.toBase58())) {
        steps.issue_grant = "GrantAlreadyActive (ok, already ready)";
        writeLine(out, `issue_grant: existing grant looks ready; continuing`);
      } else {
        writeLine(out, `issue_grant: ${issued.status} ${issued.error ?? issued.reason ?? ""}`);
        return {
          status: issued.status === "need_human_setup" ? "need_human_setup" : "error",
          reason: issued.error ?? issued.reason ?? "issue_grant failed",
          human: HUMAN_MD,
          steps,
        };
      }
    }
  }

  let rent = { spend_vault: 0, paymaster: 0 };
  try {
    rent = await vaultRentMinimums(connection);
  } catch {
    rent = { spend_vault: 0, paymaster: 0 };
  }

  const [spendVault] = spendVaultPda(cfg.intentsProgramId, grokAccount);
  const [paymaster] = paymasterPda(cfg.intentsProgramId, grokAccount);
  const spendState = await fetchSpendVault(connection, spendVault).catch(() => null);
  const pmState = await fetchPaymaster(connection, paymaster).catch(() => null);

  if (!spendState) {
    const initS = await initSpendVaultTool({});
    if (initS.status !== "ok" && !looksAlreadyExists(resultText(initS))) {
      const again = await fetchSpendVault(connection, spendVault).catch(() => null);
      if (!again) {
        writeLine(out, `spend_vault init: ${initS.status} ${initS.error ?? initS.reason ?? ""}`);
        return {
          status: initS.status === "need_human_setup" ? "need_human_setup" : "error",
          reason: initS.error ?? initS.reason ?? "init_spend_vault failed",
          human: HUMAN_MD,
          steps,
        };
      }
    }
    const funded = await fundSpendVaultTool({ sol: SETUP_SPEND_FUND_SOL });
    if (funded.status !== "ok") {
      writeLine(out, `spend_vault fund: ${funded.status} ${funded.error ?? funded.reason ?? ""}`);
      return {
        status: funded.status === "need_human_setup" ? "need_human_setup" : "error",
        reason: funded.error ?? funded.reason ?? "fund_spend_vault failed",
        human: HUMAN_MD,
        steps,
      };
    }
    steps.spend_vault = `init + fund ${SETUP_SPEND_FUND_SOL} SOL`;
    writeLine(out, `spend_vault: inited + funded ${SETUP_SPEND_FUND_SOL} SOL (human pays)`);
  } else {
    const spendable = spendableLamports(spendState.lamports, rent.spend_vault);
    if (spendable < SETUP_SPEND_FLOOR_LAMPORTS) {
      const funded = await fundSpendVaultTool({ sol: SETUP_SPEND_FUND_SOL });
      if (funded.status !== "ok") {
        writeLine(out, `spend_vault fund: ${funded.status} ${funded.error ?? funded.reason ?? ""}`);
        return {
          status: funded.status === "need_human_setup" ? "need_human_setup" : "error",
          reason: funded.error ?? funded.reason ?? "fund_spend_vault failed",
          human: HUMAN_MD,
          steps,
        };
      }
      steps.spend_vault = `topped up ${SETUP_SPEND_FUND_SOL} SOL`;
      writeLine(out, `spend_vault: already inited, funded ${SETUP_SPEND_FUND_SOL} SOL (below floor)`);
    } else {
      steps.spend_vault = "already inited, above floor (skipped)";
      writeLine(out, `spend_vault: already inited, ${spendable} spendable lamports (skip)`);
    }
  }

  if (!pmState) {
    const initP = await initPaymasterTool({ relayer: relayerKs.pubkey.toBase58() });
    if (initP.status !== "ok" && !looksAlreadyExists(resultText(initP))) {
      const again = await fetchPaymaster(connection, paymaster).catch(() => null);
      if (!again) {
        writeLine(out, `paymaster init: ${initP.status} ${initP.error ?? initP.reason ?? ""}`);
        return {
          status: initP.status === "need_human_setup" ? "need_human_setup" : "error",
          reason: initP.error ?? initP.reason ?? "init_paymaster failed",
          human: HUMAN_MD,
          steps,
        };
      }
    }
    const funded = await fundPaymasterTool({ sol: SETUP_PAYMASTER_FUND_SOL });
    if (funded.status !== "ok") {
      writeLine(out, `paymaster fund: ${funded.status} ${funded.error ?? funded.reason ?? ""}`);
      return {
        status: funded.status === "need_human_setup" ? "need_human_setup" : "error",
        reason: funded.error ?? funded.reason ?? "fund_paymaster failed",
        human: HUMAN_MD,
        steps,
      };
    }
    steps.paymaster = `init + fund ${SETUP_PAYMASTER_FUND_SOL} SOL (relayer ${relayerKs.pubkey.toBase58()})`;
    writeLine(out, `paymaster: inited + funded ${SETUP_PAYMASTER_FUND_SOL} SOL (human pays; relayer is fee payer)`);
  } else {
    const spendable = spendableLamports(pmState.lamports, rent.paymaster);
    if (spendable < SETUP_PAYMASTER_FLOOR_LAMPORTS) {
      const funded = await fundPaymasterTool({ sol: SETUP_PAYMASTER_FUND_SOL });
      if (funded.status !== "ok") {
        writeLine(out, `paymaster fund: ${funded.status} ${funded.error ?? funded.reason ?? ""}`);
        return {
          status: funded.status === "need_human_setup" ? "need_human_setup" : "error",
          reason: funded.error ?? funded.reason ?? "fund_paymaster failed",
          human: HUMAN_MD,
          steps,
        };
      }
      steps.paymaster = `topped up ${SETUP_PAYMASTER_FUND_SOL} SOL`;
      writeLine(out, `paymaster: already inited, funded ${SETUP_PAYMASTER_FUND_SOL} SOL (below floor)`);
    } else {
      steps.paymaster = "already inited, above floor (skipped)";
      writeLine(out, `paymaster: already inited, ${spendable} spendable lamports (skip)`);
    }
  }

  const mcp = buildMcpSnippet({
    root: plan.rootKeypairPath,
    agent: agentKs.path,
    relayer: relayerKs.path,
  });
  const oneLiner = buildSetupOneLiner(plan.rootKeypairPath);

  writeLine(out, "");
  writeLine(out, "Ready MCP snippet — add grokchain-mcp to Grok Bot / Grok Build.");
  writeLine(out, "stdio command + env. Env names PATHS only. Never paste a seed.");
  writeLine(out, JSON.stringify(mcp, null, 2));
  writeLine(out, "");
  writeLine(out, "one-liner:");
  writeLine(out, `  ${oneLiner}`);
  writeLine(out, "");
  writeLine(out, "After this, a Grok bot can call pay. This command did not send a pay.");
  writeLine(out, "Human funds vaults. Relayer pays fees. Bot never holds SOL.");
  writeLine(out, `See GETTING-STARTED.md and ${HUMAN_MD}.`);

  return {
    status: "ok",
    cluster: "devnet",
    core: cfg.programId.toBase58(),
    intents: cfg.intentsProgramId.toBase58(),
    root: rootPubkey,
    agent: agentKs.pubkey.toBase58(),
    relayer: relayerKs.pubkey.toBase58(),
    paths: {
      GROKCHAIN_ROOT_KEYPAIR: plan.rootKeypairPath,
      GROKCHAIN_AGENT_KEYPAIR: agentKs.path,
      GROKCHAIN_RELAYER_KEYPAIR: relayerKs.path,
    },
    mcp,
    one_liner: oneLiner,
    steps,
    human: HUMAN_MD,
  };
}

