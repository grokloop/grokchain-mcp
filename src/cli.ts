#!/usr/bin/env node
import { DEVNET_INTENTS_PROGRAM_ID, LOCAL_ONLY_INTENTS_PROGRAM_ID } from "./constants.js";
import {
  defaultAgentPath,
  defaultRelayerPath,
  initAgentKeystore,
  initRelayerKeystore,
  loadKeyFromEnvPath,
} from "./keys.js";
import { isSetupDevnet, normalizeCliCmd, runSetupDevnet } from "./setup.js";
import { checkGrantTool } from "./tools/check_grant.js";
import { createAccountTool } from "./tools/create_account.js";
import { issueGrantTool } from "./tools/issue_grant.js";
import { getAccountTool, getGrantTool } from "./tools/reads.js";
import { reviseGrantTool } from "./tools/revise_grant.js";
import { revokeGrantTool } from "./tools/revoke_grant.js";
import {
  fundPaymasterTool,
  fundSpendVaultTool,
  initPaymasterTool,
  initSpendVaultTool,
  pausePaymasterTool,
  setRelayerTool,
  unpausePaymasterTool,
  vaultStatus,
  withdrawPaymasterTool,
  withdrawPumpTraderTool,
  withdrawSpendVaultTool,
} from "./tools/vaults.js";
import { tokenBuyTool } from "./tools/token_buy.js";
import { tokenSellTool } from "./tools/token_sell.js";

function usage(): string {
  return `grokchain — human CLI for Grok Chain CORE + INTENTS

Env (paths, never secrets):
  GROKCHAIN_CLUSTER                 localnet|devnet|mainnet-beta (default localnet)
  GROKCHAIN_RPC_URL
  GROKCHAIN_CONFIG                  path to JSON config (e.g. config/devnet.json)
  GROKCHAIN_PROGRAM_ID              CORE id; required except localnet
  GROKCHAIN_INTENTS_PROGRAM_ID      INTENTS id; required except localnet
  GROKCHAIN_ROOT_KEYPAIR            path to human wallet (Solana CLI JSON)
  GROKCHAIN_AGENT_KEYPAIR           path to agent keystore (0600)
  GROKCHAIN_RELAYER_KEYPAIR         path to relayer keystore (0600)

  grokchain --config config/devnet.json <command>
  Devnet wires the grokchain-devnet deployed CORE and INTENTS ids from
  config/devnet.json. Local-only ids are refused on devnet. Relayer remains
  fee payer. Human funds vaults. Bot never holds SOL.

Commands:
  grokchain root create-account
  grokchain root issue-grant --agent <pk> --cap <lamports> --expires <unix> --programs <csv>
                             [--sponsor] [--label <text>]
      --programs is router mode: allowlist the INTENTS id for this cluster.
      localnet: ${LOCAL_ONLY_INTENTS_PROGRAM_ID} (local-only, not live).
      devnet: ${DEVNET_INTENTS_PROGRAM_ID} (devnet router). Not SystemProgram.
      --sponsor means this grant may use YOUR paymaster — not a promise Grok Chain pays.
  grokchain root revise-grant --agent <pk> --cap <lamports> --expires <unix> --programs <csv>
                             [--sponsor] [--label <text>]
  grokchain root revoke-grant --agent <pk>
  grokchain vault init-spend
  grokchain vault fund-spend --sol <n>
  grokchain vault withdraw-spend --sol <n>
  grokchain vault withdraw-pump-trader [--lamports <n>] [--sol <n>] [--atas from,to,...]
      Root-only. Not grant-gated. 0 / omitted lamports = SOL no-op (token sweep ok).
  grokchain paymaster init --relayer <pk>
  grokchain paymaster fund --sol <n>
  grokchain paymaster withdraw --sol <n>
  grokchain paymaster set-relayer --relayer <pk>
  grokchain paymaster pause
  grokchain paymaster unpause
  grokchain agent init [--out <path>]
      Generate a 0600 keystore. Prints pubkey only.
  grokchain agent pubkey
  grokchain relayer init [--out <path>]
      Generate a 0600 keystore. Prints pubkey only. Relayer is the fee payer.
  grokchain relayer pubkey
  grokchain status [--agent <pk>]
  grokchain token-buy --in-amount <n> [--input-mint <pk>] [--output-mint <pk>] [--min-out <n>] [--slippage-bps <n>] [--wrap-sol|--no-wrap-sol]
  grokchain token-sell --in-amount <n> [--input-mint <pk>] [--output-mint <pk>] [--min-out <n>] [--slippage-bps <n>]
      Jupiter v6 via INTENTS. User is the pump-trader PDA. Old swap is still a SOL send.
  grokchain setup --devnet [--yes]
      One command on grokchain-devnet. Equivalent: setup --devnet or setup devnet.
      Only GROKCHAIN_ROOT_KEYPAIR (or ~/.config/solana/id.json) is required.
      Creates agent+relayer 0600 keystores (reuses if present), airdrops if it can,
      create_account, issue_grant (allowlist EYhYtq…), SpendVault + Paymaster.
      Prints an MCP snippet. Does not send a pay. Idempotent. See GETTING-STARTED.md.

removed: grokchain fund --to agent (old wrong path).
The bot/agent never holds SOL and is never the fee payer.
Human funds SpendVault (pay source) and Paymaster (gas). Relayer submits.

localnet uses the local-only CORE + INTENTS pair. Devnet uses the
grokchain-devnet deployed ids. See GETTING-STARTED.md and HUMAN.md.
`;
}

type Flags = Record<string, string | boolean>;

function parseArgs(argv: string[]): { cmd: string[]; flags: Flags } {
  const cmd: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") {
      flags.help = true;
      continue;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
      continue;
    }
    cmd.push(a);
  }
  return { cmd, flags };
}

function req(flags: Flags, name: string): string {
  const v = flags[name];
  if (typeof v !== "string" || !v) {
    throw new Error(`missing --${name}`);
  }
  return v;
}

function programsOf(flags: Flags): string[] {
  const raw = flags.programs;
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function printJson(v: unknown): void {
  process.stdout.write(`${JSON.stringify(v, null, 2)}\n`);
}

function dry(flags: Flags): boolean {
  return flags["dry-run"] === true;
}

async function status(flags: Flags): Promise<void> {
  const agent =
    typeof flags.agent === "string"
      ? flags.agent
      : loadKeyFromEnvPath("GROKCHAIN_AGENT_KEYPAIR").pubkey?.toBase58();
  const acc = await getAccountTool({});
  const grant = agent ? await getGrantTool({ agent }) : undefined;
  const vaults = await vaultStatus({ agent });
  printJson({
    account: acc,
    grant: grant ?? { status: "skipped", reason: "no --agent and no GROKCHAIN_AGENT_KEYPAIR" },
    vaults,
  });
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const flags = parsed.flags;
  const cmd = normalizeCliCmd(parsed.cmd);
  if (flags.config === true) {
    throw new Error("missing --config <path> (e.g. config/devnet.json)");
  }
  if (typeof flags.config === "string") {
    process.env.GROKCHAIN_CONFIG = flags.config;
  }
  if (flags.help || cmd.length === 0) {
    process.stdout.write(usage());
    process.exit(0);
  }

  const head = cmd.join(" ");
  if (head === "root create-account") {
    printJson(await createAccountTool({ dry_run: dry(flags) }));
    return;
  }
  if (head === "root issue-grant") {
    printJson(
      await issueGrantTool({
        agent: req(flags, "agent"),
        spend_cap_lamports: req(flags, "cap"),
        expires_at_unix: req(flags, "expires"),
        allowed_programs: programsOf(flags),
        sponsor_eligible: flags.sponsor === true,
        label: typeof flags.label === "string" ? flags.label : undefined,
        dry_run: dry(flags),
      }),
    );
    return;
  }
  if (head === "root revise-grant") {
    printJson(
      await reviseGrantTool({
        agent: req(flags, "agent"),
        spend_cap_lamports: req(flags, "cap"),
        expires_at_unix: req(flags, "expires"),
        allowed_programs: programsOf(flags),
        sponsor_eligible: flags.sponsor === true,
        label: typeof flags.label === "string" ? flags.label : undefined,
        dry_run: dry(flags),
      }),
    );
    return;
  }
  if (head === "root revoke-grant") {
    printJson(await revokeGrantTool({ agent: req(flags, "agent"), dry_run: dry(flags) }));
    return;
  }
  if (head === "vault init-spend") {
    printJson(await initSpendVaultTool({ dry_run: dry(flags) }));
    return;
  }
  if (head === "vault fund-spend") {
    printJson(await fundSpendVaultTool({ sol: req(flags, "sol"), dry_run: dry(flags) }));
    return;
  }
  if (head === "vault withdraw-spend") {
    printJson(await withdrawSpendVaultTool({ sol: req(flags, "sol"), dry_run: dry(flags) }));
    return;
  }
  if (head === "vault withdraw-pump-trader") {
    printJson(
      await withdrawPumpTraderTool({
        lamports: typeof flags.lamports === "string" ? flags.lamports : undefined,
        sol: typeof flags.sol === "string" ? flags.sol : undefined,
        atas: typeof flags.atas === "string" ? flags.atas : undefined,
        dry_run: dry(flags),
      }),
    );
    return;
  }
  if (head === "paymaster init") {
    printJson(await initPaymasterTool({ relayer: req(flags, "relayer"), dry_run: dry(flags) }));
    return;
  }
  if (head === "paymaster fund") {
    printJson(await fundPaymasterTool({ sol: req(flags, "sol"), dry_run: dry(flags) }));
    return;
  }
  if (head === "paymaster withdraw") {
    printJson(await withdrawPaymasterTool({ sol: req(flags, "sol"), dry_run: dry(flags) }));
    return;
  }
  if (head === "paymaster set-relayer") {
    printJson(await setRelayerTool({ relayer: req(flags, "relayer"), dry_run: dry(flags) }));
    return;
  }
  if (head === "paymaster pause") {
    printJson(await pausePaymasterTool({ dry_run: dry(flags) }));
    return;
  }
  if (head === "paymaster unpause") {
    printJson(await unpausePaymasterTool({ dry_run: dry(flags) }));
    return;
  }
  if (cmd[0] === "fund") {
    process.stderr.write(
      "grokchain fund --to agent is removed (old wrong path).\n" +
        "The bot/agent never holds SOL and is never the fee payer.\n" +
        "Human funds SpendVault (pay source) and Paymaster (gas):\n" +
        "  grokchain vault fund-spend --sol N\n" +
        "  grokchain paymaster fund --sol N\n" +
        "Relayer submits. See HUMAN.md.\n",
    );
    process.exit(1);
  }
  if (head === "agent init") {
    const out = typeof flags.out === "string" ? flags.out : defaultAgentPath();
    const pk = initAgentKeystore(out);
    printJson({
      status: "ok",
      pubkey: pk.toBase58(),
      path: out,
      note: "keystore written mode 0600. pubkey only is printed. set GROKCHAIN_AGENT_KEYPAIR to this path.",
    });
    return;
  }
  if (head === "agent pubkey") {
    const loaded = loadKeyFromEnvPath("GROKCHAIN_AGENT_KEYPAIR", defaultAgentPath());
    if (!loaded.pubkey) {
      throw new Error(loaded.reason ?? "agent keystore missing");
    }
    printJson({ pubkey: loaded.pubkey.toBase58(), path: loaded.path });
    return;
  }
  if (head === "relayer init") {
    const out = typeof flags.out === "string" ? flags.out : defaultRelayerPath();
    const pk = initRelayerKeystore(out);
    printJson({
      status: "ok",
      pubkey: pk.toBase58(),
      path: out,
      note: "keystore written mode 0600. pubkey only is printed. set GROKCHAIN_RELAYER_KEYPAIR to this path. Relayer is the fee payer. Bot never holds SOL.",
    });
    return;
  }
  if (head === "relayer pubkey") {
    const loaded = loadKeyFromEnvPath("GROKCHAIN_RELAYER_KEYPAIR", defaultRelayerPath());
    if (!loaded.pubkey) {
      throw new Error(loaded.reason ?? "relayer keystore missing");
    }
    printJson({ pubkey: loaded.pubkey.toBase58(), path: loaded.path });
    return;
  }
  if (cmd[0] === "setup") {
    if (!isSetupDevnet(cmd, flags)) {
      process.stderr.write("setup currently supports --devnet (or: grokchain setup devnet). See GETTING-STARTED.md.\n");
      process.exit(1);
    }
    const result = await runSetupDevnet({ yes: flags.yes === true });
    if (result.status !== "ok") {
      process.exit(1);
    }
    return;
  }
  if (cmd[0] === "status") {
    await status(flags);
    return;
  }
  if (head === "token-buy") {
    printJson(
      await tokenBuyTool({
        in_amount: req(flags, "in-amount"),
        input_mint: typeof flags["input-mint"] === "string" ? flags["input-mint"] : undefined,
        output_mint: typeof flags["output-mint"] === "string" ? flags["output-mint"] : undefined,
        min_out: typeof flags["min-out"] === "string" ? flags["min-out"] : undefined,
        slippage_bps: typeof flags["slippage-bps"] === "string" ? flags["slippage-bps"] : undefined,
        wrap_sol: flags["no-wrap-sol"] === true ? false : flags["wrap-sol"] === true ? true : undefined,
        sponsor_lamports: typeof flags["sponsor-lamports"] === "string" ? flags["sponsor-lamports"] : undefined,
        root: typeof flags.root === "string" ? flags.root : undefined,
        dry_run: dry(flags),
      }),
    );
    return;
  }
  if (head === "token-sell") {
    printJson(
      await tokenSellTool({
        in_amount: req(flags, "in-amount"),
        input_mint: typeof flags["input-mint"] === "string" ? flags["input-mint"] : undefined,
        output_mint: typeof flags["output-mint"] === "string" ? flags["output-mint"] : undefined,
        min_out: typeof flags["min-out"] === "string" ? flags["min-out"] : undefined,
        slippage_bps: typeof flags["slippage-bps"] === "string" ? flags["slippage-bps"] : undefined,
        wrap_sol: flags["no-wrap-sol"] === true ? false : flags["wrap-sol"] === true ? true : undefined,
        sponsor_lamports: typeof flags["sponsor-lamports"] === "string" ? flags["sponsor-lamports"] : undefined,
        root: typeof flags.root === "string" ? flags.root : undefined,
        dry_run: dry(flags),
      }),
    );
    return;
  }
  if (head === "root" || head === "agent" || head === "vault" || head === "paymaster" || head === "relayer") {
    process.stderr.write(usage());
    process.exit(1);
  }

  void checkGrantTool;

  process.stderr.write(`unknown command: ${head}\n\n${usage()}`);
  process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\nSee HUMAN.md.\n`);
  process.exit(1);
});
