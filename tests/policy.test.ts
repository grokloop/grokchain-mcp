import assert from "node:assert/strict";
import { test } from "node:test";
import { SystemProgram } from "@solana/web3.js";
import { PolicyError, rejectSecretFields, validateCall, validateCheckGrant, validateDeploy, validatePay, validatePolicy, validateSwap } from "../src/policy.js";
import { payTool } from "../src/tools/pay.js";
import {
  DEVNET_CORE_PROGRAM_ID,
  DEVNET_INTENTS_PROGRAM_ID,
  LOCAL_ONLY_INTENTS_PROGRAM_ID,
  LOCAL_ONLY_PROGRAM_ID,
  MAX_SPONSOR_LAMPORTS,
} from "../src/constants.js";
import { callTool } from "../src/tools/call.js";
import { deployTool } from "../src/tools/deploy.js";
import { swapTool } from "../src/tools/swap.js";

test("rejects expiry 0, expiry not in future, allowlist too long, duplicates", () => {
  const now = 1_700_000_000;
  assert.throws(
    () =>
      validatePolicy({
        spendCapLamports: 1n,
        allowedPrograms: [SystemProgram.programId],
        expiresAtUnix: 0,
        nowUnix: now,
      }),
    (e: unknown) => e instanceof PolicyError && e.code === "ExpiryRequired",
  );
  assert.throws(
    () =>
      validatePolicy({
        spendCapLamports: 1n,
        allowedPrograms: [SystemProgram.programId],
        expiresAtUnix: now,
        nowUnix: now,
      }),
    (e: unknown) => e instanceof PolicyError && e.code === "ExpiryNotInFuture",
  );
  const nine = Array.from({ length: 9 }, () => SystemProgram.programId);
  assert.throws(
    () =>
      validatePolicy({
        spendCapLamports: 1n,
        allowedPrograms: nine,
        expiresAtUnix: now + 10,
        nowUnix: now,
      }),
    (e: unknown) => e instanceof PolicyError && e.code === "AllowlistTooLong",
  );
  assert.throws(
    () =>
      validatePolicy({
        spendCapLamports: 1n,
        allowedPrograms: [SystemProgram.programId, SystemProgram.programId],
        expiresAtUnix: now + 10,
        nowUnix: now,
      }),
    (e: unknown) => e instanceof PolicyError && e.code === "AllowlistDuplicate",
  );
});

test("empty allowlist and cap 0 produce warnings; check_grant denies empty", () => {
  const now = 1_700_000_000;
  const { warnings } = validatePolicy({
    spendCapLamports: 0n,
    allowedPrograms: [],
    expiresAtUnix: now + 10,
    nowUnix: now,
  });
  assert.ok(warnings.some((w) => w.includes("empty allowlist")));
  assert.ok(warnings.some((w) => w.includes("call-only")));
  assert.throws(
    () => validateCheckGrant({ amountLamports: 0n, allowedEmpty: true }),
    (e: unknown) => e instanceof PolicyError && e.code === "GrantProgramDenied",
  );
  assert.throws(
    () => validateCheckGrant({ amountLamports: 1n, spendCapLamports: 0n }),
    (e: unknown) => e instanceof PolicyError && e.code === "GrantCapExceeded",
  );
});

test("secret-named fields are rejected and not part of tool schemas", () => {
  assert.throws(
    () => rejectSecretFields({ seed: "x" }),
    (e: unknown) => e instanceof PolicyError && e.code === "SecretFieldRejected",
  );
  assert.throws(() => rejectSecretFields({ mnemonic: "x" }));
  assert.throws(() => rejectSecretFields({ privateKey: "x" }));
  assert.throws(() => rejectSecretFields({ secretKey: "x" }));
  assert.throws(() => rejectSecretFields({ keypair: "x" }));
});

test("pay client rejects amount 0 and sponsor over cap", async () => {
  assert.throws(
    () => validatePay({ amountLamports: 0n, sponsorLamports: 0n }),
    (e: unknown) => e instanceof PolicyError && e.code === "ZeroPayAmount",
  );
  assert.throws(
    () => validatePay({ amountLamports: 1n, sponsorLamports: BigInt(MAX_SPONSOR_LAMPORTS) + 1n }),
    (e: unknown) => e instanceof PolicyError && e.code === "SponsorCapExceeded",
  );
  const zero = await payTool({
    to: SystemProgram.programId.toBase58(),
    amount_lamports: 0,
  });
  assert.equal(zero.status, "error");
  assert.equal(zero.code, "ZeroPayAmount");
  const over = await payTool({
    to: SystemProgram.programId.toBase58(),
    amount_lamports: 1,
    sponsor_lamports: MAX_SPONSOR_LAMPORTS + 1,
  });
  assert.equal(over.status, "error");
  assert.equal(over.code, "SponsorCapExceeded");
});

test("pay is implemented, not a stub; missing relayer is need_human_setup", async () => {
  const r = await payTool({
    to: SystemProgram.programId.toBase58(),
    amount_lamports: 1,
    root: SystemProgram.programId.toBase58(),
  });
  assert.notEqual(r.status, "stub");
  assert.equal(r.moved_sol ?? false, false);
  assert.ok(r.status === "need_human_setup" || r.status === "need_human_signature" || r.status === "error");
  assert.match(JSON.stringify(r), /HUMAN\.md|never holds SOL|RELAYER|AGENT/i);
});

test("swap/deploy/call are real clients, not IntentStub; missing setup is need_human_*", async () => {
  const dest = SystemProgram.programId.toBase58();
  const swapZero = await swapTool({ to: dest, amount_in_lamports: 0, min_out_lamports: 0, root: dest });
  assert.equal(swapZero.status, "error");
  assert.equal(swapZero.code, "ZeroAmount");

  const minFail = await swapTool({ to: dest, amount_in_lamports: 10, min_out_lamports: 11, root: dest });
  assert.equal(minFail.status, "error");
  assert.equal(minFail.code, "MinOutNotMet");

  const swap = await swapTool({ to: dest, amount_in_lamports: 10, min_out_lamports: 10, root: dest });
  assert.notEqual(swap.status, "stub");
  assert.notEqual(swap.error, "IntentStub");
  assert.equal(swap.moved_sol ?? false, false);
  assert.ok(swap.status === "need_human_setup" || swap.status === "need_human_signature" || swap.status === "error");
  assert.match(JSON.stringify(swap), /HUMAN\.md|never holds SOL|RELAYER|AGENT|not a DEX|localnet|devnet/i);

  const deploy = await deployTool({ program_id: dest, root: dest });
  assert.notEqual(deploy.status, "stub");
  assert.notEqual(deploy.error, "IntentStub");
  assert.equal(deploy.bpf_deployed, false);
  assert.equal(deploy.elf_uploaded, false);
  assert.ok(deploy.status === "need_human_setup" || deploy.status === "need_human_signature" || deploy.status === "error");

  const callPing = await callTool({ target_program: dest, amount_lamports: 0, root: dest });
  assert.notEqual(callPing.status, "stub");
  assert.notEqual(callPing.error, "IntentStub");
  assert.equal(callPing.moved_sol ?? false, false);
  assert.ok(callPing.status === "need_human_setup" || callPing.status === "need_human_signature" || callPing.status === "error");
});

test("swap/call/deploy policy helpers", () => {
  assert.throws(
    () => validateSwap({ amountInLamports: 0n, minOutLamports: 0n, sponsorLamports: 0n }),
    (e: unknown) => e instanceof PolicyError && e.code === "ZeroAmount",
  );
  assert.throws(
    () => validateSwap({ amountInLamports: 5n, minOutLamports: 6n, sponsorLamports: 0n }),
    (e: unknown) => e instanceof PolicyError && e.code === "MinOutNotMet",
  );
  assert.ok(validateSwap({ amountInLamports: 5n, minOutLamports: 5n, sponsorLamports: 0n }).warnings.some((w) => w.includes("Not a DEX")));
  assert.ok(validateCall({ amountLamports: 0n, sponsorLamports: 0n }).warnings.some((w) => w.includes("policy ping")));
  assert.ok(validateDeploy({ sponsorLamports: 0n }).warnings.some((w) => w.includes("Not a BPF deploy")));
});

test("local-only program ids are the documented localnet default strings", () => {
  assert.equal(LOCAL_ONLY_PROGRAM_ID, "8WDhHSfrz6hMkmX7WteAAmyuWFLryHM2Kfc1r4k8EFXE");
  assert.equal(LOCAL_ONLY_INTENTS_PROGRAM_ID, "AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2");
});

test("devnet program ids are the grokchain-devnet deployed strings", () => {
  assert.equal(DEVNET_CORE_PROGRAM_ID, "7UtafKBBWNHEXC9PaNXu8USdZqL6VEWupsL7rS6LeVDj");
  assert.equal(DEVNET_INTENTS_PROGRAM_ID, "EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz");
});

const KEY_ENV = [
  "GROKCHAIN_CLUSTER",
  "GROKCHAIN_RPC_URL",
  "GROKCHAIN_PROGRAM_ID",
  "GROKCHAIN_INTENTS_PROGRAM_ID",
  "GROKCHAIN_CONFIG",
  "GROKCHAIN_ROOT_KEYPAIR",
  "GROKCHAIN_AGENT_KEYPAIR",
  "GROKCHAIN_RELAYER_KEYPAIR",
] as const;

test("cluster=devnet pay builds against real INTENTS and returns need_human without faking a send", async () => {
  const snap: Record<string, string | undefined> = {};
  for (const k of KEY_ENV) snap[k] = process.env[k];
  try {
    for (const k of KEY_ENV) delete process.env[k];
    process.env.GROKCHAIN_CLUSTER = "devnet";
    const r = await payTool({
      to: SystemProgram.programId.toBase58(),
      amount_lamports: 1,
      root: SystemProgram.programId.toBase58(),
    });
    assert.notEqual(r.status, "stub");
    assert.notEqual(r.status, "ok");
    assert.equal(r.moved_sol ?? false, false);
    assert.ok(r.status === "need_human_setup" || r.status === "need_human_signature");
    assert.equal(r.cluster, "devnet");
    assert.equal(r.program_id, DEVNET_CORE_PROGRAM_ID);
    assert.equal(r.intents_program_id, DEVNET_INTENTS_PROGRAM_ID);
    assert.match(JSON.stringify(r), /HUMAN\.md|never holds SOL|RELAYER|AGENT/i);
  } finally {
    for (const k of KEY_ENV) {
      if (snap[k] === undefined) delete process.env[k];
      else process.env[k] = snap[k];
    }
  }
});
