import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import { USDC_MINT } from "../src/constants.js";
import {
  DEFAULT_GRANT_TTL_SECONDS,
  DEFAULT_USDC_CAP,
  MAINNET_CORE,
  MAINNET_INTENTS,
  assertMainnet,
  looksAlreadyCreated,
  looksLikeMissingInstruction,
  renderPlan,
  type MainnetPlan,
} from "../src/setup_mainnet.js";

function cfg(over: Record<string, unknown> = {}) {
  return {
    cluster: "mainnet-beta",
    programId: new PublicKey(MAINNET_CORE),
    intentsProgramId: new PublicKey(MAINNET_INTENTS),
    ...over,
  } as never;
}

test("setup refuses to run against anything that is not mainnet", () => {
  assert.doesNotThrow(() => assertMainnet(cfg()));

  // Wrong cluster: the most likely way to point real-money setup at the wrong chain.
  assert.throws(() => assertMainnet(cfg({ cluster: "devnet" })), /requires GROKCHAIN_CLUSTER=mainnet-beta/);

  // Right cluster, wrong programs — e.g. a stale devnet config with the cluster flipped.
  assert.throws(
    () => assertMainnet(cfg({ programId: new PublicKey("7UtafKBBWNHEXC9PaNXu8USdZqL6VEWupsL7rS6LeVDj") })),
    /expected mainnet/,
  );
  assert.throws(
    () => assertMainnet(cfg({ intentsProgramId: new PublicKey("EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz") })),
    /expected mainnet/,
  );
});

test("the default cap is denominated in USDC units, not lamports", () => {
  // 50_000_000 raw = $50. Reading it as lamports would be 0.05 SOL — the exact
  // confusion this default exists to make impossible to have silently.
  assert.equal(DEFAULT_USDC_CAP, 50_000_000);
  assert.equal(DEFAULT_USDC_CAP / 1e6, 50);
  // A month: useful, but neglect ends it rather than leaving it open forever.
  assert.equal(DEFAULT_GRANT_TTL_SECONDS, 30 * 24 * 60 * 60);
});

test("the rendered plan states the money facts a human needs before agreeing", () => {
  const plan: MainnetPlan = {
    cluster: "mainnet-beta",
    core: MAINNET_CORE,
    intents: MAINNET_INTENTS,
    rootPath: "/root.json",
    agentPath: "/agent.json",
    relayerPath: "/relayer.json",
    usdcMint: USDC_MINT,
    grant: {
      cap_raw: "50000000",
      cap_human: "50.00 USDC",
      expires_at_unix: 1_800_000_000,
      allowed_programs: [MAINNET_INTENTS],
      label: "grok-payments",
    },
    accounts: [
      { name: "GrokAccount", address: Keypair.generate().publicKey.toBase58(), bytes: 53, rentSol: "0.001260", exists: false },
      { name: "SpendVault", address: Keypair.generate().publicKey.toBase58(), bytes: 73, rentSol: "0.001399", exists: true },
    ],
    paymasterSol: 0.02,
    totalSol: "0.039963",
    notes: ["cap is raw USDC units"],
  };

  let out = "";
  renderPlan(plan, (s) => { out += s; });

  assert.match(out, /REAL MONEY/, "the human must see this is not devnet");
  assert.match(out, /TOTAL to spend\s+0\.039963 SOL/);
  assert.match(out, /50000000 raw\s+= 50\.00 USDC/, "cap shown in both units");
  assert.match(out, /exists/, "already-created accounts are not re-charged");
  assert.match(out, /cap is raw USDC units/);
  // Every address is printed so it can be checked on an explorer first.
  for (const a of plan.accounts) assert.ok(out.includes(a.address));
});

test("an unknown instruction is told apart from an already-created account", () => {
  // The deployed binary predates pay_token: Anchor rejects the discriminator.
  assert.equal(looksLikeMissingInstruction("Error: InstructionFallbackNotFound"), true);
  assert.equal(looksLikeMissingInstruction("custom program error: 0x65"), true);
  assert.equal(looksLikeMissingInstruction("fallback functions are not supported"), true);

  // A re-run: the account is already there, which is success, not failure.
  assert.equal(looksAlreadyCreated("Allocate: account Address { .. } already in use"), true);
  assert.equal(looksAlreadyCreated("GrantAlreadyActive"), true);

  // The two must never be confused: one means "upgrade the program", the other
  // means "you already did this".
  assert.equal(looksLikeMissingInstruction("already in use"), false);
  assert.equal(looksAlreadyCreated("InstructionFallbackNotFound"), false);
  // And neither should swallow a real failure.
  assert.equal(looksLikeMissingInstruction("insufficient funds"), false);
  assert.equal(looksAlreadyCreated("insufficient funds"), false);
});
