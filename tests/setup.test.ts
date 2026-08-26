import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Keypair } from "@solana/web3.js";
import {
  DEVNET_CORE_PROGRAM_ID,
  DEVNET_INTENTS_PROGRAM_ID,
  LOCAL_ONLY_INTENTS_PROGRAM_ID,
  LOCAL_ONLY_PROGRAM_ID,
} from "../src/constants.js";
import { ensureKeystore, planKeystoreAction } from "../src/keys.js";
import {
  SETUP_GRANT_CAP_LAMPORTS,
  SETUP_GRANT_LABEL,
  SETUP_GRANT_TTL_SECONDS,
  assertDevnetProgramIds,
  buildMcpSnippet,
  buildSetupOneLiner,
  isSetupDevnet,
  looksAlreadyExists,
  normalizeCliCmd,
  planSetupDevnet,
  planSetupGrant,
  refuseBannedLocalId,
} from "../src/setup.js";

test("setup planner defaults: cap 50_000_000, expiry now+30d, allowlist EYhYtq", () => {
  const now = 1_700_000_000;
  const grant = planSetupGrant({ nowUnix: now });
  assert.equal(grant.spend_cap_lamports, 50_000_000);
  assert.equal(grant.spend_cap_lamports, SETUP_GRANT_CAP_LAMPORTS);
  assert.equal(grant.expires_at_unix, now + SETUP_GRANT_TTL_SECONDS);
  assert.equal(grant.expires_at_unix, now + 30 * 24 * 60 * 60);
  assert.deepEqual(grant.allowed_programs, [DEVNET_INTENTS_PROGRAM_ID]);
  assert.equal(grant.allowed_programs[0], "EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz");
  assert.equal(grant.sponsor_eligible, true);
  assert.equal(grant.label, "grok-bot");
  assert.equal(grant.label, SETUP_GRANT_LABEL);
  assert.ok(!grant.allowed_programs.includes(LOCAL_ONLY_INTENTS_PROGRAM_ID));
});

test("setup planner refuses banned local-only ids", () => {
  assert.throws(
    () => refuseBannedLocalId(LOCAL_ONLY_PROGRAM_ID, "CORE"),
    (e: unknown) =>
      e instanceof Error &&
      e.message.includes("8WDhHSfrz6hMkmX7WteAAmyuWFLryHM2Kfc1r4k8EFXE") &&
      e.message.includes("local-only"),
  );
  assert.throws(
    () => refuseBannedLocalId(LOCAL_ONLY_INTENTS_PROGRAM_ID, "INTENTS"),
    (e: unknown) =>
      e instanceof Error &&
      e.message.includes("AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2") &&
      e.message.includes("local-only"),
  );
  assert.throws(
    () => assertDevnetProgramIds(LOCAL_ONLY_PROGRAM_ID, DEVNET_INTENTS_PROGRAM_ID),
    /Refusing CORE/,
  );
  assert.throws(
    () => assertDevnetProgramIds(DEVNET_CORE_PROGRAM_ID, LOCAL_ONLY_INTENTS_PROGRAM_ID),
    /Refusing INTENTS/,
  );
  assert.throws(
    () =>
      planSetupDevnet({
        coreProgramId: LOCAL_ONLY_PROGRAM_ID,
        intentsProgramId: DEVNET_INTENTS_PROGRAM_ID,
      }),
    /Refusing CORE/,
  );
  assert.throws(
    () =>
      planSetupDevnet({
        coreProgramId: DEVNET_CORE_PROGRAM_ID,
        intentsProgramId: LOCAL_ONLY_INTENTS_PROGRAM_ID,
      }),
    /Refusing INTENTS/,
  );
  assert.doesNotThrow(() => assertDevnetProgramIds(DEVNET_CORE_PROGRAM_ID, DEVNET_INTENTS_PROGRAM_ID));
});

test("setup planner does not overwrite existing keystores (mock fs)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "grokchain-setup-ks-"));
  const agentPath = path.join(dir, "agent.json");
  const relayerPath = path.join(dir, "relayer.json");
  const existing = Keypair.generate();
  const existingJson = JSON.stringify(Array.from(existing.secretKey));
  writeFileSync(agentPath, existingJson, { mode: 0o600 });
  chmodSync(agentPath, 0o600);

  assert.equal(planKeystoreAction(true), "reuse");
  assert.equal(planKeystoreAction(false), "create");
  assert.equal(planKeystoreAction(existsSync(agentPath)), "reuse");
  assert.equal(planKeystoreAction(existsSync(relayerPath)), "create");

  const plan = planSetupDevnet({
    agentPath,
    relayerPath,
    agentExists: true,
    relayerExists: false,
  });
  assert.equal(plan.agentKeystoreAction, "reuse");
  assert.equal(plan.relayerKeystoreAction, "create");

  const before = readFileSync(agentPath, "utf8");
  const ensured = ensureKeystore(agentPath);
  const after = readFileSync(agentPath, "utf8");
  assert.equal(ensured.reused, true);
  assert.equal(ensured.pubkey.toBase58(), existing.publicKey.toBase58());
  assert.equal(after, before);
  assert.equal(after, existingJson);

  const created = ensureKeystore(relayerPath);
  assert.equal(created.reused, false);
  assert.ok(existsSync(relayerPath));
  const again = ensureKeystore(relayerPath);
  assert.equal(again.reused, true);
  assert.equal(again.pubkey.toBase58(), created.pubkey.toBase58());
  assert.equal(readFileSync(relayerPath, "utf8"), readFileSync(relayerPath, "utf8"));
});

test("MCP snippet contains GROKCHAIN_CLUSTER=devnet and key PATHS not secret bytes", () => {
  const dir = "/home/USER/.config";
  const root = "/abs/path/to/id.json";
  const agent = `${dir}/grokchain/agent.json`;
  const relayer = `${dir}/grokchain/relayer.json`;
  const snippet = buildMcpSnippet({ root, agent, relayer });
  const text = JSON.stringify(snippet, null, 2);

  assert.equal(snippet.mcpServers.grokchain.env.GROKCHAIN_CLUSTER, "devnet");
  assert.ok(text.includes('"GROKCHAIN_CLUSTER": "devnet"'));
  assert.ok(text.includes(root));
  assert.ok(text.includes(agent));
  assert.ok(text.includes(relayer));
  assert.deepEqual(snippet.mcpServers.grokchain.args, ["-y", "github:grokloop/grokchain-mcp", "grokchain-mcp"]);

  assert.ok(!text.includes("secretKey"));
  assert.ok(!text.includes("privateKey"));
  assert.ok(!text.includes("seed"));
  assert.ok(!text.includes("mnemonic"));
  assert.ok(!/\bsecret\b/i.test(text));
  // no Solana secret-key array of 64 numbers
  assert.ok(!/\[[\s\d,]{80,}\]/.test(text));

  const plan = planSetupDevnet({
    nowUnix: 1_700_000_000,
    rootPath: root,
    agentPath: agent,
    relayerPath: relayer,
    agentExists: true,
    relayerExists: true,
  });
  assert.equal(plan.cluster, "devnet");
  assert.equal(plan.coreProgramId, DEVNET_CORE_PROGRAM_ID);
  assert.equal(plan.intentsProgramId, DEVNET_INTENTS_PROGRAM_ID);
  assert.equal(plan.mcp.mcpServers.grokchain.env.GROKCHAIN_CLUSTER, "devnet");
  assert.equal(plan.mcp.mcpServers.grokchain.env.GROKCHAIN_ROOT_KEYPAIR, path.resolve(root));
  assert.equal(plan.oneLiner, buildSetupOneLiner(path.resolve(root)));
  assert.ok(plan.oneLiner.includes("GROKCHAIN_CLUSTER=devnet"));
  assert.ok(plan.oneLiner.includes("grokchain setup --devnet"));
  const planText = JSON.stringify(plan.mcp);
  assert.ok(!planText.includes("secretKey"));
  assert.ok(!/\[[\s\d,]{80,}\]/.test(planText));
});

test("setup --devnet and setup devnet are equivalent; --yes is optional", () => {
  assert.equal(isSetupDevnet(["setup"], { devnet: true }), true);
  assert.equal(isSetupDevnet(["setup", "devnet"], {}), true);
  assert.equal(isSetupDevnet(["setup", "devnet"], { yes: true }), true);
  assert.equal(isSetupDevnet(["setup"], { devnet: true, yes: true }), true);
  assert.equal(isSetupDevnet(["setup"], {}), false);
  assert.equal(isSetupDevnet(["status"], { devnet: true }), false);
});

test("looksAlreadyExists recognizes GrantAlreadyActive without failing setup", () => {
  assert.equal(looksAlreadyExists("GrantAlreadyActive"), true);
  assert.equal(looksAlreadyExists("custom program error: account already in use"), true);
  assert.equal(looksAlreadyExists("already initialized"), true);
  assert.equal(looksAlreadyExists("need SOL on the root"), false);
});

test("setup planner does not send a pay and does not mention pay as an action", () => {
  const plan = planSetupDevnet({
    nowUnix: 1_700_000_000,
    rootPath: "/abs/path/to/id.json",
    agentPath: "/tmp/agent.json",
    relayerPath: "/tmp/relayer.json",
    agentExists: true,
    relayerExists: true,
  });
  const dumped = JSON.stringify(plan);
  assert.ok(!dumped.includes('"pay"'));
  assert.ok(plan.grant.allowed_programs[0] === DEVNET_INTENTS_PROGRAM_ID);
});

test("npx github:... grokchain setup --devnet strips the leading bin name", () => {
  assert.deepEqual(normalizeCliCmd(["grokchain", "setup"]), ["setup"]);
  assert.deepEqual(normalizeCliCmd(["grokchain", "setup", "devnet"]), ["setup", "devnet"]);
  assert.deepEqual(normalizeCliCmd(["grokchain-mcp", "setup"]), ["setup"]);
  assert.deepEqual(normalizeCliCmd(["setup"]), ["setup"]);
  assert.equal(isSetupDevnet(normalizeCliCmd(["grokchain", "setup"]), { devnet: true }), true);
  assert.equal(isSetupDevnet(normalizeCliCmd(["grokchain", "setup", "devnet"]), {}), true);
  assert.equal(isSetupDevnet(normalizeCliCmd(["setup"]), { devnet: true }), true);
});

test("setup source never imports or calls pay", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/setup.ts", import.meta.url), "utf8");
  assert.equal(src.includes("payTool"), false);
  assert.equal(src.includes("tools/pay"), false);
  assert.equal(src.includes("INTENTS_DISC.pay"), false);
});
