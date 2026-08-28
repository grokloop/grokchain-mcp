import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { clusterNotes, loadConfig } from "../src/config.js";
import {
  DEVNET_CORE_PROGRAM_ID,
  DEVNET_INTENTS_PROGRAM_ID,
  LOCAL_ONLY_INTENTS_PROGRAM_ID,
  LOCAL_ONLY_PROGRAM_ID,
} from "../src/constants.js";

// TEST FIXTURES only — well-known Solana program ids. Not Grok Chain deployments.
const FIXTURE_CORE = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const FIXTURE_INTENTS = "Memo111111111111111111111111111111111111111";

const ENV_KEYS = [
  "GROKCHAIN_CLUSTER",
  "GROKCHAIN_RPC_URL",
  "GROKCHAIN_PROGRAM_ID",
  "GROKCHAIN_INTENTS_PROGRAM_ID",
  "GROKCHAIN_CONFIG",
] as const;

type EnvSnap = Record<(typeof ENV_KEYS)[number], string | undefined>;

function snapshotEnv(): EnvSnap {
  const snap = {} as EnvSnap;
  for (const k of ENV_KEYS) snap[k] = process.env[k];
  return snap;
}

function restoreEnv(snap: EnvSnap): void {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

function clearIds(): void {
  delete process.env.GROKCHAIN_PROGRAM_ID;
  delete process.env.GROKCHAIN_INTENTS_PROGRAM_ID;
  delete process.env.GROKCHAIN_CONFIG;
  delete process.env.GROKCHAIN_RPC_URL;
}

function writeTempConfig(obj: unknown): string {
  const dir = mkdtempSync(path.join(tmpdir(), "grokchain-cfg-"));
  const p = path.join(dir, "devnet.json");
  writeFileSync(p, JSON.stringify(obj, null, 2));
  return p;
}

const REPO_DEVNET_JSON = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../config/devnet.json",
);

test("localnet still defaults to the two local-only ids", () => {
  const snap = snapshotEnv();
  try {
    clearIds();
    process.env.GROKCHAIN_CLUSTER = "localnet";
    const cfg = loadConfig();
    assert.equal(cfg.cluster, "localnet");
    assert.equal(cfg.programId.toBase58(), LOCAL_ONLY_PROGRAM_ID);
    assert.equal(cfg.intentsProgramId.toBase58(), LOCAL_ONLY_INTENTS_PROGRAM_ID);
    assert.equal(cfg.localOnlyProgram, true);
    assert.equal(cfg.localOnlyIntents, true);
  } finally {
    restoreEnv(snap);
  }
});

test("cluster=devnet auto-loads config/devnet.json real deployed ids", () => {
  const snap = snapshotEnv();
  try {
    clearIds();
    process.env.GROKCHAIN_CLUSTER = "devnet";
    const cfg = loadConfig();
    assert.equal(cfg.cluster, "devnet");
    assert.equal(cfg.rpcUrl, "https://api.devnet.solana.com");
    assert.equal(cfg.programId.toBase58(), DEVNET_CORE_PROGRAM_ID);
    assert.equal(cfg.intentsProgramId.toBase58(), DEVNET_INTENTS_PROGRAM_ID);
    assert.equal(cfg.programId.toBase58(), "7UtafKBBWNHEXC9PaNXu8USdZqL6VEWupsL7rS6LeVDj");
    assert.equal(cfg.intentsProgramId.toBase58(), "EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz");
    assert.equal(cfg.localOnlyProgram, false);
    assert.equal(cfg.localOnlyIntents, false);
    const notes = clusterNotes(cfg).join("\n");
    assert.match(notes, /7UtafKBBWNHEXC9PaNXu8USdZqL6VEWupsL7rS6LeVDj/);
    assert.match(notes, /EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz/);
    assert.match(notes, /grokchain-devnet deployed programs/);
    assert.match(notes, /no seed export/i);
    assert.doesNotMatch(notes, /8WDhHSfrz6hMkmX7WteAAmyuWFLryHM2Kfc1r4k8EFXE/);
    assert.doesNotMatch(notes, /AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2/);
  } finally {
    restoreEnv(snap);
  }
});

const MAINNET_CORE = "44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd";
const MAINNET_INTENTS = "3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw";

test("cluster=mainnet-beta auto-loads config/mainnet.json real deployed ids", () => {
  const snap = snapshotEnv();
  try {
    clearIds();
    process.env.GROKCHAIN_CLUSTER = "mainnet-beta";
    const cfg = loadConfig();
    assert.equal(cfg.cluster, "mainnet-beta");
    assert.equal(cfg.rpcUrl, "https://api.mainnet-beta.solana.com");
    assert.equal(cfg.programId.toBase58(), MAINNET_CORE);
    assert.equal(cfg.intentsProgramId.toBase58(), MAINNET_INTENTS);
    assert.equal(cfg.localOnlyProgram, false);
    assert.equal(cfg.localOnlyIntents, false);
    const notes = clusterNotes(cfg).join("\n");
    assert.match(notes, /44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd/);
    assert.match(notes, /3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw/);
    assert.match(notes, /grokchain-mainnet deployed programs/);
    assert.match(notes, /no seed export/i);
    assert.doesNotMatch(notes, /8WDhHSfrz6hMkmX7WteAAmyuWFLryHM2Kfc1r4k8EFXE/);
    assert.doesNotMatch(notes, /AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2/);
  } finally {
    restoreEnv(snap);
  }
});

test("cluster=devnet + CORE local-only id is refused (8WDh...)", () => {
  const snap = snapshotEnv();
  try {
    clearIds();
    process.env.GROKCHAIN_CLUSTER = "devnet";
    process.env.GROKCHAIN_PROGRAM_ID = LOCAL_ONLY_PROGRAM_ID;
    process.env.GROKCHAIN_INTENTS_PROGRAM_ID = FIXTURE_INTENTS;
    assert.throws(
      () => loadConfig(),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /8WDhHSfrz6hMkmX7WteAAmyuWFLryHM2Kfc1r4k8EFXE/);
        assert.match(err.message, /local-only/);
        assert.match(err.message, /not a deployed program/);
        assert.match(err.message, /not valid on devnet/);
        return true;
      },
    );
  } finally {
    restoreEnv(snap);
  }
});

test("cluster=devnet + INTENTS local-only id is refused (AXprc...)", () => {
  const snap = snapshotEnv();
  try {
    clearIds();
    process.env.GROKCHAIN_CLUSTER = "devnet";
    process.env.GROKCHAIN_PROGRAM_ID = FIXTURE_CORE;
    process.env.GROKCHAIN_INTENTS_PROGRAM_ID = LOCAL_ONLY_INTENTS_PROGRAM_ID;
    assert.throws(
      () => loadConfig(),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2/);
        assert.match(err.message, /local-only/);
        assert.match(err.message, /not a deployed program/);
        assert.match(err.message, /not valid on devnet/);
        return true;
      },
    );
  } finally {
    restoreEnv(snap);
  }
});

test("cluster=devnet + swapping local-only ids is refused", () => {
  const snap = snapshotEnv();
  try {
    clearIds();
    process.env.GROKCHAIN_CLUSTER = "devnet";
    process.env.GROKCHAIN_PROGRAM_ID = LOCAL_ONLY_INTENTS_PROGRAM_ID;
    process.env.GROKCHAIN_INTENTS_PROGRAM_ID = FIXTURE_INTENTS;
    assert.throws(
      () => loadConfig(),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2/);
        assert.match(err.message, /local-only/);
        return true;
      },
    );

    process.env.GROKCHAIN_PROGRAM_ID = FIXTURE_CORE;
    process.env.GROKCHAIN_INTENTS_PROGRAM_ID = LOCAL_ONLY_PROGRAM_ID;
    assert.throws(
      () => loadConfig(),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /8WDhHSfrz6hMkmX7WteAAmyuWFLryHM2Kfc1r4k8EFXE/);
        assert.match(err.message, /local-only/);
        return true;
      },
    );
  } finally {
    restoreEnv(snap);
  }
});

test("cluster=devnet + two valid fixture pubkeys that are not banned succeeds", () => {
  const snap = snapshotEnv();
  try {
    clearIds();
    process.env.GROKCHAIN_CLUSTER = "devnet";
    process.env.GROKCHAIN_PROGRAM_ID = FIXTURE_CORE;
    process.env.GROKCHAIN_INTENTS_PROGRAM_ID = FIXTURE_INTENTS;
    const cfg = loadConfig();
    assert.equal(cfg.cluster, "devnet");
    assert.equal(cfg.programId.toBase58(), FIXTURE_CORE);
    assert.equal(cfg.intentsProgramId.toBase58(), FIXTURE_INTENTS);
    assert.equal(cfg.localOnlyProgram, false);
    assert.equal(cfg.localOnlyIntents, false);
    const notes = clusterNotes(cfg).join("\n");
    assert.match(notes, /grokchain-devnet config \/ env/);
    assert.match(notes, /treated as deployed/);
    assert.match(notes, /no seed export/i);
    assert.match(notes, /Relayer is the only address reimbursed/);
  } finally {
    restoreEnv(snap);
  }
});

test("loading config/devnet.json loads real grokchain-devnet ids", () => {
  const snap = snapshotEnv();
  try {
    clearIds();
    process.env.GROKCHAIN_CONFIG = REPO_DEVNET_JSON;
    const cfg = loadConfig();
    assert.equal(cfg.cluster, "devnet");
    assert.equal(cfg.programId.toBase58(), DEVNET_CORE_PROGRAM_ID);
    assert.equal(cfg.intentsProgramId.toBase58(), DEVNET_INTENTS_PROGRAM_ID);
    assert.equal(cfg.localOnlyProgram, false);
    assert.equal(cfg.localOnlyIntents, false);
  } finally {
    restoreEnv(snap);
  }
});

test("a temp json with null ids on mainnet-beta uses MAINNET defaults", () => {
  const snap = snapshotEnv();
  try {
    clearIds();
    const p = writeTempConfig({
      cluster: "mainnet-beta",
      rpcUrl: "https://api.mainnet-beta.solana.com",
      coreProgramId: null,
      intentsProgramId: null,
    });
    process.env.GROKCHAIN_CONFIG = p;
    const cfg = loadConfig();
    assert.equal(cfg.cluster, "mainnet-beta");
    assert.equal(cfg.programId.toBase58(), MAINNET_CORE);
    assert.equal(cfg.intentsProgramId.toBase58(), MAINNET_INTENTS);
  } finally {
    restoreEnv(snap);
  }
});

test("a temp json with a banned id is refused", () => {
  const snap = snapshotEnv();
  try {
    clearIds();
    const p = writeTempConfig({
      cluster: "devnet",
      rpcUrl: "https://api.devnet.solana.com",
      coreProgramId: LOCAL_ONLY_PROGRAM_ID,
      intentsProgramId: FIXTURE_INTENTS,
    });
    process.env.GROKCHAIN_CONFIG = p;
    assert.throws(
      () => loadConfig(),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /8WDhHSfrz6hMkmX7WteAAmyuWFLryHM2Kfc1r4k8EFXE/);
        assert.match(err.message, /local-only/);
        assert.match(err.message, /not valid on devnet/);
        return true;
      },
    );
  } finally {
    restoreEnv(snap);
  }
});

test("a temp json with two fixture ids is accepted", () => {
  const snap = snapshotEnv();
  try {
    clearIds();
    const p = writeTempConfig({
      cluster: "devnet",
      rpcUrl: "https://api.devnet.solana.com",
      coreProgramId: FIXTURE_CORE,
      intentsProgramId: FIXTURE_INTENTS,
    });
    process.env.GROKCHAIN_CONFIG = p;
    const cfg = loadConfig();
    assert.equal(cfg.cluster, "devnet");
    assert.equal(cfg.rpcUrl, "https://api.devnet.solana.com");
    assert.equal(cfg.programId.toBase58(), FIXTURE_CORE);
    assert.equal(cfg.intentsProgramId.toBase58(), FIXTURE_INTENTS);
    assert.equal(cfg.localOnlyProgram, false);
    assert.equal(cfg.localOnlyIntents, false);
  } finally {
    restoreEnv(snap);
  }
});
