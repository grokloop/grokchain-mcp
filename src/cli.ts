#!/usr/bin/env node
import { LOCAL_ONLY_INTENTS_PROGRAM_ID } from "./constants.js";
import {
  defaultAgentPath,
  defaultRelayerPath,
  initAgentKeystore,
  initRelayerKeystore,
  loadKeyFromEnvPath,
} from "./keys.js";
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
  withdrawSpendVaultTool,
} from "./tools/vaults.js";

function usage(): string {
  return `grokchain — human CLI for Grok Chain CORE + INTENTS (local-only today)

Env (paths, never secrets):
  GROKCHAIN_CLUSTER                 localnet|devnet|mainnet-beta (default localnet)
  GROKCHAIN_RPC_URL
  GROKCHAIN_PROGRAM_ID              CORE id; required except localnet
  GROKCHAIN_INTENTS_PROGRAM_ID      INTENTS id; required except localnet
  GROKCHAIN_ROOT_KEYPAIR            path to human wallet (Solana CLI JSON)
  GROKCHAIN_AGENT_KEYPAIR           path to agent keystore (0600)
  GROKCHAIN_RELAYER_KEYPAIR         path to relayer keystore (0600)

Commands:
  grokchain root create-account
  grokchain root issue-grant --agent <pk> --cap <lamports> --expires <unix> --programs <csv>
                             [--sponsor] [--label <text>]
      --programs is router mode: allowlist the local-only INTENTS id
      (${LOCAL_ONLY_INTENTS_PROGRAM_ID}), not SystemProgram.
      --sponsor means this grant may use YOUR paymaster — not a promise Grok Chain pays.
  grokchain root revise-grant --agent <pk> --cap <lamports> --expires <unix> --programs <csv>
                             [--sponsor] [--label <text>]
  grokchain root revoke-grant --agent <pk>
  grokchain vault init-spend
  grokchain vault fund-spend --sol <n>
  grokchain vault withdraw-spend --sol <n>
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

removed: grokchain fund --to agent (old wrong path).
The bot/agent never holds SOL and is never the fee payer.
Human funds SpendVault (pay source) and Paymaster (gas). Relayer submits.

CORE and INTENTS are local-only today. Not deployed. See HUMAN.md.
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
  const { cmd, flags } = parseArgs(process.argv.slice(2));
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
  if (cmd[0] === "status") {
    await status(flags);
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
