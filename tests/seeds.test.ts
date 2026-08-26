import assert from "node:assert/strict";
import { test } from "node:test";
import { PublicKey } from "@solana/web3.js";
import {
  LOCAL_ONLY_INTENTS_PROGRAM_ID,
  LOCAL_ONLY_PROGRAM_ID,
  SEED_GRANT,
  SEED_GROK_ACCOUNT,
  SEED_PAYMASTER,
  SEED_SPEND_VAULT,
} from "../src/constants.js";
import { grantPda, grokAccountPda, paymasterPda, spendVaultPda } from "../src/pda.js";

test("grok-account seed bytes match spec", () => {
  assert.deepEqual(
    Array.from(SEED_GROK_ACCOUNT),
    [103, 114, 111, 107, 45, 97, 99, 99, 111, 117, 110, 116],
  );
  assert.equal(SEED_GROK_ACCOUNT.toString("utf8"), "grok-account");
});

test("grant seed bytes match spec", () => {
  assert.deepEqual(Array.from(SEED_GRANT), [103, 114, 97, 110, 116]);
  assert.equal(SEED_GRANT.toString("utf8"), "grant");
});

test("PDAs use findProgramAddress; grant is seeded with account PDA not root", () => {
  const programId = new PublicKey(LOCAL_ONLY_PROGRAM_ID);
  const root = new PublicKey("11111111111111111111111111111111");
  const agent = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

  const [account, accountBump] = grokAccountPda(programId, root);
  const [expectedAccount, expectedBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("grok-account"), root.toBuffer()],
    programId,
  );
  assert.equal(account.toBase58(), expectedAccount.toBase58());
  assert.equal(accountBump, expectedBump);

  const [grant] = grantPda(programId, account, agent);
  const [expectedGrant] = PublicKey.findProgramAddressSync(
    [Buffer.from("grant"), account.toBuffer(), agent.toBuffer()],
    programId,
  );
  assert.equal(grant.toBase58(), expectedGrant.toBase58());

  const [wrong] = PublicKey.findProgramAddressSync(
    [Buffer.from("grant"), root.toBuffer(), agent.toBuffer()],
    programId,
  );
  assert.notEqual(grant.toBase58(), wrong.toBase58());
});

test("spend-vault seed bytes match spec", () => {
  assert.deepEqual(
    Array.from(SEED_SPEND_VAULT),
    [115, 112, 101, 110, 100, 45, 118, 97, 117, 108, 116],
  );
  assert.equal(SEED_SPEND_VAULT.toString("utf8"), "spend-vault");
});

test("paymaster seed bytes match spec", () => {
  assert.deepEqual(
    Array.from(SEED_PAYMASTER),
    [112, 97, 121, 109, 97, 115, 116, 101, 114],
  );
  assert.equal(SEED_PAYMASTER.toString("utf8"), "paymaster");
});

test("vault PDAs use intents program id and grok_account, not root", () => {
  const core = new PublicKey(LOCAL_ONLY_PROGRAM_ID);
  const intents = new PublicKey(LOCAL_ONLY_INTENTS_PROGRAM_ID);
  const root = new PublicKey("11111111111111111111111111111111");
  const [account] = grokAccountPda(core, root);

  const [vault, vaultBump] = spendVaultPda(intents, account);
  const [expectedVault, expectedVaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("spend-vault"), account.toBuffer()],
    intents,
  );
  assert.equal(vault.toBase58(), expectedVault.toBase58());
  assert.equal(vaultBump, expectedVaultBump);

  const [pm] = paymasterPda(intents, account);
  const [expectedPm] = PublicKey.findProgramAddressSync(
    [Buffer.from("paymaster"), account.toBuffer()],
    intents,
  );
  assert.equal(pm.toBase58(), expectedPm.toBase58());

  const [wrongVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("spend-vault"), root.toBuffer()],
    intents,
  );
  assert.notEqual(vault.toBase58(), wrongVault.toBase58());

  const [wrongProgram] = PublicKey.findProgramAddressSync(
    [Buffer.from("spend-vault"), account.toBuffer()],
    core,
  );
  assert.notEqual(vault.toBase58(), wrongProgram.toBase58());
});

