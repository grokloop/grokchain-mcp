import assert from "node:assert/strict";
import { test } from "node:test";
import { SystemProgram } from "@solana/web3.js";
import { PolicyError, rejectSecretFields, validateCheckGrant, validatePay, validatePolicy } from "../src/policy.js";
import { payTool } from "../src/tools/pay.js";
import { LOCAL_ONLY_INTENTS_PROGRAM_ID, LOCAL_ONLY_PROGRAM_ID, MAX_SPONSOR_LAMPORTS } from "../src/constants.js";
import { swapTool } from "../src/tools/stubs.js";

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

test("swap is an honest IntentStub", async () => {
  const r = await swapTool({});
  assert.equal(r.status, "stub");
  assert.equal(r.error, "IntentStub");
  assert.equal(r.moved_sol, false);
});

test("local-only program ids are the documented localnet default strings", () => {
  assert.equal(LOCAL_ONLY_PROGRAM_ID, "8WDhHSfrz6hMkmX7WteAAmyuWFLryHM2Kfc1r4k8EFXE");
  assert.equal(LOCAL_ONLY_INTENTS_PROGRAM_ID, "AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2");
});
