import assert from "node:assert/strict";
import { test } from "node:test";
import { SystemProgram } from "@solana/web3.js";
import { PolicyError, rejectSecretFields, validateCheckGrant, validatePolicy } from "../src/policy.js";
import { payTool } from "../src/tools/pay.js";
import { LOCAL_ONLY_PROGRAM_ID } from "../src/constants.js";

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

test("pay is an honest stub and does not move SOL", async () => {
  const r = await payTool({
    to: SystemProgram.programId.toBase58(),
    amount_lamports: 1,
    memo: "nope",
  });
  assert.equal(r.status, "stub");
  assert.equal(r.moved_sol, false);
  assert.match(String(r.reason), /PROGRAMS/);
  assert.match(String(r.reason), /did not move SOL/);
});

test("local-only program id is the documented localnet default string", () => {
  assert.equal(LOCAL_ONLY_PROGRAM_ID, "8WDhHSfrz6hMkmX7WteAAmyuWFLryHM2Kfc1r4k8EFXE");
});
