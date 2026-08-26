import assert from "node:assert/strict";
import { test } from "node:test";
import { PublicKey } from "@solana/web3.js";
import { LOCAL_ONLY_PROGRAM_ID, SEED_GRANT, SEED_GROK_ACCOUNT } from "../src/constants.js";
import { grantPda, grokAccountPda } from "../src/pda.js";

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
