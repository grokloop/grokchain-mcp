#!/usr/bin/env node
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { connectionOf, loadConfig } from "./config.js";
import { defaultAgentPath, defaultRootPath, initAgentKeystore, loadKeyFromEnvPath, parsePubkey } from "./keys.js";
import { checkGrantTool } from "./tools/check_grant.js";
import { createAccountTool } from "./tools/create_account.js";
import { issueGrantTool } from "./tools/issue_grant.js";
import { getAccountTool, getGrantTool } from "./tools/reads.js";
import { reviseGrantTool } from "./tools/revise_grant.js";
import { revokeGrantTool } from "./tools/revoke_grant.js";

function usage(): string {
  return `grokchain — human CLI for Grok Chain CORE (local-only today)

Env (paths, never secrets):
  GROKCHAIN_CLUSTER          localnet|devnet|mainnet-beta (default localnet)
  GROKCHAIN_RPC_URL
  GROKCHAIN_PROGRAM_ID       required except localnet
  GROKCHAIN_ROOT_KEYPAIR     path to human wallet (Solana CLI JSON)
  GROKCHAIN_AGENT_KEYPAIR    path to agent keystore (0600)

Commands:
  grokchain root create-account
  grokchain root issue-grant --agent <pk> --cap <lamports> --expires <unix> --programs <csv>
                             [--sponsor] [--label <text>]
  grokchain root revise-grant --agent <pk> --cap <lamports> --expires <unix> --programs <csv>
                             [--sponsor] [--label <text>]
  grokchain root revoke-grant --agent <pk>
  grokchain fund --to agent|<pubkey> --sol <n>
      System transfer from root to agent for FEES.
      This is the human paying gas, not the protocol. CORE is not a vault.
  grokchain agent init [--out <path>]
      Generate a 0600 keystore. Prints pubkey only.
  grokchain agent pubkey
  grokchain status [--agent <pk>]

CORE is local-only today. Not deployed. See HUMAN.md.
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

async function fund(flags: Flags): Promise<void> {
  const cfg = loadConfig();
  const root = loadKeyFromEnvPath("GROKCHAIN_ROOT_KEYPAIR");
  if (!root.keypair || !root.pubkey) {
    throw new Error(
      `${root.reason ?? "GROKCHAIN_ROOT_KEYPAIR missing"}\nHuman pays gas. See HUMAN.md.`,
    );
  }
  const toRaw = req(flags, "to");
  let dest: PublicKey;
  if (toRaw === "agent") {
    const agent = loadKeyFromEnvPath("GROKCHAIN_AGENT_KEYPAIR");
    if (!agent.pubkey) {
      throw new Error(agent.reason ?? "agent keystore missing");
    }
    dest = agent.pubkey;
  } else {
    dest = parsePubkey(toRaw, "--to");
  }
  const sol = Number(req(flags, "sol"));
  if (!Number.isFinite(sol) || sol <= 0) {
    throw new Error("--sol must be a positive number of SOL");
  }
  const lamports = Math.round(sol * LAMPORTS_PER_SOL);
  const connection = connectionOf(cfg);
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: root.pubkey,
      toPubkey: dest,
      lamports,
    }),
  );
  const sig = await sendAndConfirmTransaction(connection, tx, [root.keypair], {
    commitment: "confirmed",
  });
  printJson({
    status: "ok",
    kind: "system_transfer",
    note: "Human paying gas (fees) to the agent. This is NOT a protocol pay and NOT a CORE vault debit.",
    from: root.pubkey.toBase58(),
    to: dest.toBase58(),
    sol,
    lamports,
    signature: sig,
    cluster: cfg.cluster,
  });
}

async function status(flags: Flags): Promise<void> {
  const agent =
    typeof flags.agent === "string"
      ? flags.agent
      : loadKeyFromEnvPath("GROKCHAIN_AGENT_KEYPAIR").pubkey?.toBase58();
  const acc = await getAccountTool({});
  const grant = agent ? await getGrantTool({ agent }) : undefined;
  printJson({
    account: acc,
    grant: grant ?? { status: "skipped", reason: "no --agent and no GROKCHAIN_AGENT_KEYPAIR" },
  });
}

async function main(): Promise<void> {
  const { cmd, flags } = parseArgs(process.argv.slice(2));
  if (flags.help || cmd.length === 0) {
    process.stdout.write(usage());
    process.exit(flags.help || cmd.length === 0 ? 0 : 1);
  }

  const head = cmd.join(" ");
  if (head === "root create-account") {
    printJson(await createAccountTool({ dry_run: flags["dry-run"] === true }));
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
        dry_run: flags["dry-run"] === true,
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
        dry_run: flags["dry-run"] === true,
      }),
    );
    return;
  }
  if (head === "root revoke-grant") {
    printJson(await revokeGrantTool({ agent: req(flags, "agent"), dry_run: flags["dry-run"] === true }));
    return;
  }
  if (cmd[0] === "fund") {
    await fund(flags);
    return;
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
  if (cmd[0] === "status") {
    await status(flags);
    return;
  }
  if (head === "root" || head === "agent") {
    process.stderr.write(usage());
    process.exit(1);
  }

  // unused default-root-path helper keeps the Solana default documented
  void defaultRootPath;
  void checkGrantTool;

  process.stderr.write(`unknown command: ${head}\n\n${usage()}`);
  process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\nSee HUMAN.md.\n`);
  process.exit(1);
});
