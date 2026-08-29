/**
 * `grokchain setup --mainnet` — one command to make a bot able to pay.
 *
 * The devnet setup can be breezy: an airdrop fixes any mistake. This one spends
 * real money, so it inverts three of its habits.
 *
 * 1. **It plans before it acts.** Every account, its rent, and the total are
 *    printed first. Nothing is sent until a human agrees.
 * 2. **Silence is not consent.** The devnet runner treats a non-TTY as "yes" so
 *    CI can run it. Here that would mean a script spending someone's SOL because
 *    nobody was watching, so a non-TTY without `--yes` REFUSES.
 * 3. **There is no faucet.** If the root is short, it says how short and stops.
 *
 * It is idempotent: every step checks for what it would create and skips it, so
 * a re-run after a failure resumes rather than duplicating.
 *
 * WHAT IT DOES NOT DO
 * It never funds the trader with USDC and never adds a merchant. Those are the
 * two decisions that decide what the bot can spend and who it can pay, and they
 * should be deliberate acts by a human who has read the numbers — not a side
 * effect of running setup.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { connectionOf, loadConfig, type AppConfig } from "./config.js";
import { HUMAN_MD, TOKEN_PROGRAM_ID, USDC_MINT } from "./constants.js";
import { deriveIntentsAddrs } from "./intents.js";
import { defaultAgentPath, defaultRelayerPath, defaultRootPath, ensureKeystore, loadKeypairFromPath } from "./keys.js";
import { merchantRegistryPda } from "./paytoken.js";
import { ataFor } from "./pump_amm_accounts.js";

/** Mainnet program ids. Refuse to run against anything else. */
export const MAINNET_CORE = "44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd";
export const MAINNET_INTENTS = "3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw";

/**
 * Default grant cap: 50 USDC in RAW UNITS.
 *
 * This is the number people misread. CORE meters one u64 with no notion of
 * asset, and a payments grant spends it in the mint's base units — so 50_000_000
 * is fifty dollars, not 0.05 SOL. One agent must therefore spend one asset.
 */
export const DEFAULT_USDC_CAP = 50_000_000;
export const USDC_DECIMALS = 6;
/** 30 days. Long enough to be useful, short enough that neglect ends it. */
export const DEFAULT_GRANT_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Gas float for the relayer to draw on. Roughly a thousand payments. */
export const DEFAULT_PAYMASTER_SOL = 0.02;
export const GRANT_LABEL = "grok-payments";

export type PlannedAccount = {
  name: string;
  address: string;
  bytes: number;
  rentSol: string;
  exists?: boolean;
};

export type MainnetPlan = {
  cluster: "mainnet-beta";
  core: string;
  intents: string;
  rootPath: string;
  agentPath: string;
  relayerPath: string;
  usdcMint: string;
  grant: {
    cap_raw: string;
    cap_human: string;
    expires_at_unix: number;
    allowed_programs: string[];
    label: string;
  };
  accounts: PlannedAccount[];
  paymasterSol: number;
  totalSol: string;
  notes: string[];
};

function sol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(6);
}

function resolveAbs(p: string): string {
  if (p.startsWith("~")) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
    return path.resolve(p.replace(/^~(?=\/|$)/, home));
  }
  return path.resolve(p);
}

/** Refuse to touch mainnet unless the config really is mainnet. */
export function assertMainnet(cfg: AppConfig): void {
  if (cfg.cluster !== "mainnet-beta") {
    throw new Error(
      `setup --mainnet requires GROKCHAIN_CLUSTER=mainnet-beta (got ${cfg.cluster}). Refusing to run mainnet setup against another cluster.`,
    );
  }
  if (cfg.programId.toBase58() !== MAINNET_CORE) {
    throw new Error(`CORE is ${cfg.programId.toBase58()}, expected mainnet ${MAINNET_CORE}`);
  }
  if (cfg.intentsProgramId.toBase58() !== MAINNET_INTENTS) {
    throw new Error(
      `INTENTS is ${cfg.intentsProgramId.toBase58()}, expected mainnet ${MAINNET_INTENTS}`,
    );
  }
}

/**
 * Price the whole setup before spending anything. Rent is read from the chain
 * rather than hardcoded, so the number stays honest if rent changes.
 */
export async function planMainnetSetup(opts: {
  cfg: AppConfig;
  connection: Connection;
  root: PublicKey;
  /** The agent identity. The Grant PDA is derived from it, so the plan is wrong without it. */
  agent: PublicKey;
  usdcCap?: number;
  paymasterSol?: number;
  nowUnix?: number;
}): Promise<MainnetPlan> {
  const { cfg, connection, root, agent } = opts;
  const usdc = new PublicKey(USDC_MINT);
  const addrs = deriveIntentsAddrs({
    coreProgramId: cfg.programId,
    intentsProgramId: cfg.intentsProgramId,
    root,
    agent,
  });
  const [registry] = merchantRegistryPda(cfg.intentsProgramId, addrs.grokAccount);
  // USDC is a classic SPL mint. A Token-2022 stablecoin would derive elsewhere,
  // which is why the program reads the mint's owner rather than assuming.
  const traderUsdc = ataFor(addrs.pumpTrader, usdc, new PublicKey(TOKEN_PROGRAM_ID));

  const sizes: [string, string, number][] = [
    ["GrokAccount", addrs.grokAccount.toBase58(), 53],
    ["SpendVault", addrs.spendVault.toBase58(), 73],
    ["Paymaster", addrs.paymaster.toBase58(), 106],
    ["pump-trader (custody)", addrs.pumpTrader.toBase58(), 0],
    ["MerchantRegistry", registry.toBase58(), 8 + 32 + 32 + 32 + 1 + 4 + 32 * 32],
    ["trader USDC account", traderUsdc.toBase58(), 165],
  ];

  const accounts: PlannedAccount[] = [];
  let totalLamports = 0;
  for (const [name, address, bytes] of sizes) {
    const rent = await connection.getMinimumBalanceForRentExemption(bytes);
    const info = await connection.getAccountInfo(new PublicKey(address), "confirmed");
    const exists = info !== null;
    if (!exists) totalLamports += rent;
    accounts.push({ name, address, bytes, rentSol: sol(rent), exists });
  }
  // The grant PDA is created by issue_grant, sized by CORE.
  const grantRent = await connection.getMinimumBalanceForRentExemption(435);
  const grantInfo = await connection.getAccountInfo(addrs.grant, "confirmed");
  if (!grantInfo) totalLamports += grantRent;
  accounts.push({
    name: "Grant (this agent)",
    address: addrs.grant.toBase58(),
    bytes: 435,
    rentSol: sol(grantRent),
    exists: grantInfo !== null,
  });

  const paymasterSol = opts.paymasterSol ?? DEFAULT_PAYMASTER_SOL;
  totalLamports += Math.round(paymasterSol * LAMPORTS_PER_SOL);
  // Leave room for signatures across the setup transactions.
  totalLamports += 50_000;

  const cap = opts.usdcCap ?? DEFAULT_USDC_CAP;
  const now = opts.nowUnix ?? Math.floor(Date.now() / 1000);

  return {
    cluster: "mainnet-beta",
    core: cfg.programId.toBase58(),
    intents: cfg.intentsProgramId.toBase58(),
    rootPath: resolveAbs(defaultRootPath()),
    agentPath: resolveAbs(defaultAgentPath()),
    relayerPath: resolveAbs(defaultRelayerPath()),
    usdcMint: USDC_MINT,
    grant: {
      cap_raw: String(cap),
      cap_human: `${(cap / 10 ** USDC_DECIMALS).toFixed(2)} USDC`,
      expires_at_unix: now + DEFAULT_GRANT_TTL_SECONDS,
      allowed_programs: [cfg.intentsProgramId.toBase58()],
      label: GRANT_LABEL,
    },
    accounts,
    paymasterSol,
    totalSol: sol(totalLamports),
    notes: [
      `The grant cap is ${cap} RAW USDC UNITS = ${(cap / 1e6).toFixed(2)} USDC. It is not lamports. One agent spends one asset, or the cap stops meaning anything.`,
      "Setup does NOT fund the trader with USDC and does NOT add any merchant. Those two decide what the bot can spend and who it can pay, so they stay deliberate.",
      "The agent keypair is an identity, not a wallet: it signs intents, holds nothing, and cannot withdraw.",
      "The relayer pays transaction fees. Keep it funded or nothing lands.",
    ],
  };
}

export type MainnetSetupResult = {
  status: "ok" | "planned" | "need_human_setup" | "error";
  reason?: string;
  plan?: MainnetPlan;
  root?: string;
  agent?: string;
  relayer?: string;
  steps?: Record<string, string>;
  payments_ready?: boolean;
  next?: string[];
  human?: typeof HUMAN_MD;
};

function line(out: (s: string) => void, s = ""): void {
  out(s.endsWith("\n") ? s : `${s}\n`);
}

export function renderPlan(plan: MainnetPlan, out: (s: string) => void): void {
  line(out, "== grokchain setup --mainnet ==");
  line(out, `cluster : ${plan.cluster}   (REAL MONEY)`);
  line(out, `CORE    : ${plan.core}`);
  line(out, `INTENTS : ${plan.intents}`);
  line(out);
  line(out, "Accounts this will create:");
  for (const a of plan.accounts) {
    const mark = a.exists ? "exists" : `${a.rentSol} SOL`;
    line(out, `  ${a.name.padEnd(22)} ${mark.padStart(12)}   ${a.address}`);
  }
  line(out);
  line(out, `Paymaster gas float      ${plan.paymasterSol.toFixed(6)} SOL`);
  line(out, `TOTAL to spend           ${plan.totalSol} SOL`);
  line(out);
  line(out, "Grant issued to the agent:");
  line(out, `  cap      ${plan.grant.cap_raw} raw  = ${plan.grant.cap_human}`);
  line(out, `  expires  ${new Date(plan.grant.expires_at_unix * 1000).toISOString()}`);
  line(out, `  may call ${plan.grant.allowed_programs.join(", ")}`);
  line(out);
  for (const n of plan.notes) line(out, `  note: ${n}`);
  line(out);
}

/**
 * Ask before spending. On mainnet, a non-interactive shell that did not pass
 * `--yes` is a refusal, not an approval — the opposite of the devnet runner.
 */
async function confirm(yes: boolean, out: (s: string) => void): Promise<boolean> {
  if (yes) return true;
  if (!process.stdin.isTTY) {
    line(out, "Refusing: not a terminal and --yes was not passed. Mainnet setup never assumes consent.");
    return false;
  }
  line(out, "Spend the amount above and create these accounts? [y/N]");
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const a = (await rl.question("")).trim().toLowerCase();
    return a === "y" || a === "yes";
  } finally {
    rl.close();
  }
}

/** Anchor's error when a program does not know a discriminator. */
export function looksLikeMissingInstruction(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("instructionfallbacknotfound") ||
    m.includes("fallback functions are not supported") ||
    m.includes("0x65") // anchor: InstructionFallbackNotFound
  );
}

export function looksAlreadyCreated(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("already in use") ||
    m.includes("already initialized") ||
    m.includes("alreadyinitialized") ||
    m.includes("already exists") ||
    m.includes("grantalreadyactive")
  );
}

function resultText(r: { error?: unknown; reason?: unknown; status?: unknown }): string {
  return `${r.error ?? ""} ${r.reason ?? ""} ${r.status ?? ""}`;
}

export async function runSetupMainnet(
  opts: {
    yes?: boolean;
    planOnly?: boolean;
    usdcCap?: number;
    paymasterSol?: number;
    stdout?: (s: string) => void;
  } = {},
): Promise<MainnetSetupResult> {
  const out = opts.stdout ?? ((s: string) => process.stdout.write(s));
  const steps: Record<string, string> = {};

  let cfg: AppConfig;
  try {
    cfg = loadConfig();
    assertMainnet(cfg);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    line(out, `error: ${reason}`);
    line(out, 'Set GROKCHAIN_CLUSTER=mainnet-beta and use config/mainnet.json.');
    return { status: "error", reason, human: HUMAN_MD };
  }

  const rootPath = resolveAbs(defaultRootPath());
  if (!existsSync(rootPath)) {
    const reason = `GROKCHAIN_ROOT_KEYPAIR is missing. Point it at your Solana wallet JSON (looked at ${rootPath}). Never paste a seed.`;
    line(out, `need_human_setup: ${reason}`);
    return { status: "need_human_setup", reason, human: HUMAN_MD };
  }

  let root: PublicKey;
  try {
    root = loadKeypairFromPath(rootPath).publicKey;
  } catch (e) {
    const reason = `failed to load the root keypair at ${rootPath}: ${e instanceof Error ? e.message : String(e)}`;
    line(out, `error: ${reason}`);
    return { status: "error", reason, human: HUMAN_MD };
  }

  // The agent and relayer are created if absent and REUSED if present — never
  // overwritten, because overwriting an agent key orphans its live grant.
  const agentKs = ensureKeystore(resolveAbs(defaultAgentPath()));
  const relayerKs = ensureKeystore(resolveAbs(defaultRelayerPath()));
  steps.keystores = `agent ${agentKs.reused ? "reused" : "created"}; relayer ${relayerKs.reused ? "reused" : "created"}`;

  const connection = connectionOf(cfg);
  const plan = await planMainnetSetup({
    cfg,
    connection,
    root,
    agent: agentKs.pubkey,
    usdcCap: opts.usdcCap,
    paymasterSol: opts.paymasterSol,
  });

  renderPlan(plan, out);
  line(out, `root    : ${root.toBase58()}  (${rootPath})`);
  line(out, `agent   : ${agentKs.pubkey.toBase58()}  (signs intents, holds nothing)`);
  line(out, `relayer : ${relayerKs.pubkey.toBase58()}  (pays fees)`);
  line(out);

  if (opts.planOnly) {
    line(out, "plan only — nothing was sent.");
    return { status: "planned", plan, root: root.toBase58(), agent: agentKs.pubkey.toBase58(), relayer: relayerKs.pubkey.toBase58(), steps, human: HUMAN_MD };
  }

  // No faucet here. If the root is short, say by how much and stop.
  const balance = await connection.getBalance(root, "confirmed");
  const needed = Math.round(Number(plan.totalSol) * LAMPORTS_PER_SOL);
  if (balance < needed) {
    const short = ((needed - balance) / LAMPORTS_PER_SOL).toFixed(6);
    const reason = `root holds ${(balance / LAMPORTS_PER_SOL).toFixed(6)} SOL but setup needs ${plan.totalSol} SOL — ${short} SOL short. There is no faucet on mainnet.`;
    line(out, `need_human_setup: ${reason}`);
    return { status: "need_human_setup", reason, plan, human: HUMAN_MD };
  }

  if (!(await confirm(opts.yes === true, out))) {
    line(out, "aborted — nothing was sent.");
    return { status: "planned", plan, reason: "not confirmed", steps, human: HUMAN_MD };
  }

  // Imported lazily so the plan path never pulls the whole tool surface in.
  const { createAccountTool } = await import("./tools/create_account.js");
  const { issueGrantTool } = await import("./tools/issue_grant.js");
  const { initSpendVaultTool, initPaymasterTool, fundPaymasterTool } = await import("./tools/vaults.js");

  const run = async (
    name: string,
    fn: () => Promise<{ status?: unknown; error?: unknown; reason?: unknown; signature?: unknown }>,
  ): Promise<boolean> => {
    const r = await fn();
    const text = resultText(r);
    if (r.status === "ok") {
      steps[name] = `ok ${r.signature ?? ""}`.trim();
      line(out, `  ${name}: ok`);
      return true;
    }
    if (looksAlreadyCreated(text)) {
      steps[name] = "already exists (ok)";
      line(out, `  ${name}: already exists`);
      return true;
    }
    if (looksLikeMissingInstruction(text)) {
      steps[name] = "not on the deployed program yet";
      line(out, `  ${name}: SKIPPED — the deployed INTENTS does not have this instruction yet`);
      return false;
    }
    steps[name] = `failed: ${text.trim()}`;
    line(out, `  ${name}: FAILED ${text.trim()}`);
    return false;
  };

  line(out, "sending:");
  const okAccount = await run("create_account", () => createAccountTool({}));
  if (!okAccount) {
    return { status: "error", reason: "create_account failed", plan, steps, human: HUMAN_MD };
  }
  await run("init_spend_vault", () => initSpendVaultTool({}));
  await run("init_paymaster", () => initPaymasterTool({ relayer: relayerKs.pubkey.toBase58() }));
  await run("fund_paymaster", () => fundPaymasterTool({ sol: plan.paymasterSol }));
  await run("issue_grant", () =>
    issueGrantTool({
      agent: agentKs.pubkey.toBase58(),
      spend_cap_lamports: plan.grant.cap_raw,
      allowed_programs: plan.grant.allowed_programs,
      expires_at_unix: plan.grant.expires_at_unix,
      sponsor_eligible: true,
      label: plan.grant.label,
    }),
  );

  // The payment-specific accounts need the INTENTS upgrade. Probe rather than
  // assume, so the output says which world we are in.
  const paymentsReady = steps.init_merchant_registry !== "not on the deployed program yet";

  line(out);
  line(out, "MCP config for the bot (env names PATHS, never secrets):");
  line(
    out,
    JSON.stringify(
      {
        mcpServers: {
          grokchain: {
            command: "npx",
            args: ["-y", "github:grokloop/grokchain-mcp", "grokchain-mcp"],
            env: {
              GROKCHAIN_CLUSTER: "mainnet-beta",
              GROKCHAIN_ROOT_KEYPAIR: rootPath,
              GROKCHAIN_AGENT_KEYPAIR: agentKs.path,
              GROKCHAIN_RELAYER_KEYPAIR: relayerKs.path,
            },
          },
        },
      },
      null,
      2,
    ),
  );

  const next = [
    `Fund the trader with USDC: send it to ${plan.accounts.find((a) => a.name === "trader USDC account")?.address ?? "the trader USDC account above"}. Setup does not do this for you.`,
    "Approve who the bot may pay: `grokchain merchant add <wallet>`. Until a merchant is on the list, every pay_token is refused.",
    "Then the bot can pay: give it a solana: link and it will call pay_request, then pay_token.",
    "Stop it any time: revise the grant cap to freeze spending, remove a merchant, or revoke the grant outright.",
  ];
  line(out);
  line(out, "next:");
  for (const n of next) line(out, `  - ${n}`);

  return {
    status: "ok",
    plan,
    root: root.toBase58(),
    agent: agentKs.pubkey.toBase58(),
    relayer: relayerKs.pubkey.toBase58(),
    steps,
    payments_ready: paymentsReady,
    next,
    human: HUMAN_MD,
  };
}
