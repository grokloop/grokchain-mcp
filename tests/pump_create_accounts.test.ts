import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MAYHEM_PROGRAM_ID,
  PUMP_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "../src/constants.js";
import {
  IDX_ASSOCIATED_BONDING_CURVE,
  IDX_BONDING_CURVE,
  IDX_MAYHEM_STATE,
  IDX_MAYHEM_TOKEN_VAULT,
  IDX_MINT,
  IDX_USER,
  PUMP_CREATE_V2_DISC,
  ata2022,
  buildPumpCreateAccounts,
  deriveCreateAddresses,
} from "../src/pump_create_accounts.js";

const MINT = new PublicKey("2x4iY5AaiGyRfxzHzSY1KzQJ7K82SDqmkMApwbcRpump");

test("create_v2 discriminator matches sha256(global:create_v2)[..8]", async () => {
  const { createHash } = await import("node:crypto");
  const want = createHash("sha256").update("global:create_v2").digest().subarray(0, 8);
  assert.deepEqual(Buffer.from(PUMP_CREATE_V2_DISC), want);
  // The literal INTENTS pins, so a rename on either side is caught here.
  assert.deepEqual([...PUMP_CREATE_V2_DISC], [0xd6, 0x90, 0x4c, 0xec, 0x5f, 0x8b, 0x31, 0xb4]);
});

test("PDAs derive exactly the way the program re-derives them", () => {
  const a = deriveCreateAddresses(MINT);
  const pump = new PublicKey(PUMP_PROGRAM_ID);
  const mayhem = new PublicKey(MAYHEM_PROGRAM_ID);
  const pda = (seeds: (Buffer | Uint8Array)[], id: PublicKey) =>
    PublicKey.findProgramAddressSync(seeds, id)[0].toBase58();

  assert.equal(a.mintAuthority.toBase58(), pda([Buffer.from("mint-authority")], pump));
  assert.equal(
    a.bondingCurve.toBase58(),
    pda([Buffer.from("bonding-curve"), MINT.toBuffer()], pump),
  );
  assert.equal(a.global.toBase58(), pda([Buffer.from("global")], pump));
  assert.equal(a.eventAuthority.toBase58(), pda([Buffer.from("__event_authority")], pump));
  assert.equal(a.globalParams.toBase58(), pda([Buffer.from("global-params")], mayhem));
  assert.equal(a.solVault.toBase58(), pda([Buffer.from("sol-vault")], mayhem));
  assert.equal(
    a.mayhemState.toBase58(),
    pda([Buffer.from("mayhem-state"), MINT.toBuffer()], mayhem),
  );
});

test("the two ATAs are Token-2022 ATAs, not classic SPL", () => {
  const a = deriveCreateAddresses(MINT);
  // Same owner+mint under the classic token program gives a DIFFERENT address.
  // Sending a classic ATA here would pass the length check and fail on chain.
  const classic = PublicKey.findProgramAddressSync(
    [
      a.bondingCurve.toBuffer(),
      new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA").toBuffer(),
      MINT.toBuffer(),
    ],
    new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID),
  )[0];
  assert.notEqual(a.associatedBondingCurve.toBase58(), classic.toBase58());
  assert.equal(a.associatedBondingCurve.toBase58(), ata2022(a.bondingCurve, MINT).toBase58());
  assert.equal(a.mayhemTokenVault.toBase58(), ata2022(a.solVault, MINT).toBase58());
  // And the token program in the seeds really is Token-2022.
  assert.equal(TOKEN_2022_PROGRAM_ID, "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
});

test("every per-mint PDA actually changes with the mint", () => {
  // A builder that ignored the mint would still return a plausible-looking list.
  const a = deriveCreateAddresses(MINT);
  const b = deriveCreateAddresses(Keypair.generate().publicKey);
  assert.notEqual(a.bondingCurve.toBase58(), b.bondingCurve.toBase58());
  assert.notEqual(a.associatedBondingCurve.toBase58(), b.associatedBondingCurve.toBase58());
  assert.notEqual(a.mayhemState.toBase58(), b.mayhemState.toBase58());
  assert.notEqual(a.mayhemTokenVault.toBase58(), b.mayhemTokenVault.toBase58());
  // The mint-independent ones must NOT move.
  assert.equal(a.global.toBase58(), b.global.toBase58());
  assert.equal(a.solVault.toBase58(), b.solVault.toBase58());
  assert.equal(a.mintAuthority.toBase58(), b.mintAuthority.toBase58());
});

/** A create_v2 template shaped like one pump.fun accepted, for the offline tests. */
function fakeTemplate(mint: PublicKey, user: PublicKey) {
  const a = deriveCreateAddresses(mint);
  const meta = (pubkey: PublicKey, isWritable: boolean, isSigner = false) => ({
    pubkey,
    isSigner,
    isWritable,
  });
  return [
    meta(mint, true, true),
    meta(a.mintAuthority, false),
    meta(a.bondingCurve, true),
    meta(a.associatedBondingCurve, true),
    meta(a.global, false),
    meta(user, true, true),
    meta(PublicKey.default, false),
    meta(new PublicKey(TOKEN_2022_PROGRAM_ID), false),
    meta(new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID), false),
    meta(new PublicKey(MAYHEM_PROGRAM_ID), false),
    meta(a.globalParams, false),
    meta(a.solVault, true),
    meta(a.mayhemState, true),
    meta(a.mayhemTokenVault, true),
    meta(a.eventAuthority, false),
    meta(new PublicKey(PUMP_PROGRAM_ID), false),
  ];
}

/** Minimal Connection stand-in: only what fetchCreateTemplate touches. */
function stubConnection(accounts: ReturnType<typeof fakeTemplate> | undefined) {
  const sig = "TeMpLaTeSiGnAtUrE11111111111111111111111111111111111111111111111111111111111111111111";
  if (!accounts) return { getSignaturesForAddress: async () => [] } as never;
  const keys = accounts.map((a) => a.pubkey).concat(new PublicKey(PUMP_PROGRAM_ID));
  return {
    getSignaturesForAddress: async () => [{ signature: sig, err: null }],
    getTransaction: async () => ({
      transaction: {
        message: {
          staticAccountKeys: keys,
          compiledInstructions: [
            {
              programIdIndex: keys.length - 1,
              accountKeyIndexes: accounts.map((_, i) => i),
              data: Buffer.concat([Buffer.from(PUMP_CREATE_V2_DISC), Buffer.alloc(64)]),
            },
          ],
          isAccountSigner: (i: number) => accounts[i]?.isSigner ?? false,
          isAccountWritable: (i: number) => accounts[i]?.isWritable ?? false,
        },
      },
      meta: { innerInstructions: [], loadedAddresses: { writable: [], readonly: [] } },
    }),
  } as never;
}

test("the built list substitutes this launch's mint and trader, keeping template flags", async () => {
  const trader = Keypair.generate().publicKey;
  const spendVault = Keypair.generate().publicKey;
  const templateMint = Keypair.generate().publicKey;
  const templateUser = Keypair.generate().publicKey;
  const ourMint = Keypair.generate().publicKey;

  const built = await buildPumpCreateAccounts({
    connection: stubConnection(fakeTemplate(templateMint, templateUser)),
    mint: ourMint,
    trader,
    spendVault,
  });

  assert.equal(built.accounts.length, 16);
  // Ours, not the template's.
  assert.equal(built.accounts[IDX_MINT]!.pubkey.toBase58(), ourMint.toBase58());
  assert.equal(built.accounts[IDX_USER]!.pubkey.toBase58(), trader.toBase58());
  assert.notEqual(built.accounts[IDX_MINT]!.pubkey.toBase58(), templateMint.toBase58());
  assert.notEqual(built.accounts[IDX_USER]!.pubkey.toBase58(), templateUser.toBase58());

  // The per-mint PDAs follow OUR mint, not the one in the template.
  const a = deriveCreateAddresses(ourMint);
  assert.equal(built.accounts[IDX_BONDING_CURVE]!.pubkey.toBase58(), a.bondingCurve.toBase58());
  assert.equal(
    built.accounts[IDX_ASSOCIATED_BONDING_CURVE]!.pubkey.toBase58(),
    a.associatedBondingCurve.toBase58(),
  );
  assert.equal(built.accounts[IDX_MAYHEM_STATE]!.pubkey.toBase58(), a.mayhemState.toBase58());
  assert.equal(
    built.accounts[IDX_MAYHEM_TOKEN_VAULT]!.pubkey.toBase58(),
    a.mayhemTokenVault.toBase58(),
  );

  // INTENTS forces these; the list must already agree.
  assert.equal(built.accounts[IDX_MINT]!.isSigner, true);
  assert.equal(built.accounts[IDX_MINT]!.isWritable, true);
  assert.equal(built.accounts[IDX_USER]!.isSigner, true);
  assert.equal(built.accounts[IDX_USER]!.isWritable, true);
});

test("refuses rather than guessing when no template can be found", async () => {
  await assert.rejects(
    () =>
      buildPumpCreateAccounts({
        connection: stubConnection(undefined),
        mint: Keypair.generate().publicKey,
        trader: Keypair.generate().publicKey,
        spendVault: Keypair.generate().publicKey,
      }),
    /Refusing to guess the account flags/,
    "a guessed flag burns the mint keypair and the launch fee — refusing is cheaper",
  );
});

test("a template whose fixed accounts disagree is rejected, not silently used", async () => {
  const tpl = fakeTemplate(Keypair.generate().publicKey, Keypair.generate().publicKey);
  // Simulate pump.fun moving `global` — the shape still looks right.
  tpl[4] = { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: false };
  await assert.rejects(
    () =>
      buildPumpCreateAccounts({
        connection: stubConnection(tpl),
        mint: Keypair.generate().publicKey,
        trader: Keypair.generate().publicKey,
        spendVault: Keypair.generate().publicKey,
      }),
    /template disagrees with the derived global/,
  );
});

test("SpendVault can never be the pump user", async () => {
  const same = Keypair.generate().publicKey;
  await assert.rejects(
    () =>
      buildPumpCreateAccounts({
        connection: stubConnection(fakeTemplate(same, same)),
        mint: Keypair.generate().publicKey,
        trader: same,
        spendVault: same,
      }),
    /never SpendVault/,
  );
});
