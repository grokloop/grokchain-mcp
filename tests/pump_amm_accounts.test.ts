import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  BONDING_CURVE_COMPLETE_OFFSET,
  BONDING_CURVE_DISCRIMINATOR,
  GROK_TOKEN_MINT,
  PUMP_AMM_PROGRAM_ID,
  PUMP_AMM_USER_INDEX,
  TOKEN_PROGRAM_ID,
  WSOL_MINT,
} from "../src/constants.js";
import {
  ataFor,
  b58decode,
  decodePool,
  poolAuthorityPda,
  poolPda,
  userVolumeAccumulator,
} from "../src/pump_amm_accounts.js";
import { bondingCurvePda, decodeBondingCurve } from "../src/venue.js";

test("pool derivation reproduces the real $GrokChain pool", () => {
  // Confirmed on mainnet: this pool exists and is owned by the AMM.
  const mint = new PublicKey(GROK_TOKEN_MINT);
  assert.equal(poolAuthorityPda(mint).toBase58(), "7T49P2V9achbxmoDMLFsnhXy6J2uxGg98kaXFPsEf8rt");
  assert.equal(poolPda(mint).toBase58(), "ASS7KfEW3Xeh4u3Kj5Rtq4n4Mx4PxXdeYQFi3CD3we1q");
});

test("decodePool matches the live pool's fields", () => {
  const buf = Buffer.alloc(301);
  buf.writeUInt16LE(0, 9);
  const put = (o: number, b58: string) => new PublicKey(b58).toBuffer().copy(buf, o);
  put(11, "7T49P2V9achbxmoDMLFsnhXy6J2uxGg98kaXFPsEf8rt");
  put(43, GROK_TOKEN_MINT);
  put(75, WSOL_MINT);
  put(139, "61sb2FcrPUMde54LMUHdXbedTSKtUCDKF4YFBNxtroTt");
  put(171, "9KTQ2VMSQjL98GvzmRqGk92Q7virT7AZH6CpXFSiK3QQ");
  put(211, "6wkDT8rP2orwtx7CrnDTvU18GAoe6BzZzVXSRMWcXkSk");
  const p = decodePool(buf)!;
  assert.equal(p.baseMint, GROK_TOKEN_MINT);
  assert.equal(p.quoteMint, WSOL_MINT);
  assert.equal(p.poolBaseTokenAccount, "61sb2FcrPUMde54LMUHdXbedTSKtUCDKF4YFBNxtroTt");
  assert.equal(p.coinCreator, "6wkDT8rP2orwtx7CrnDTvU18GAoe6BzZzVXSRMWcXkSk");
  assert.equal(decodePool(Buffer.alloc(100)), undefined, "short data must not decode");
});

test("Token-2022 mints derive a different ATA than classic SPL", () => {
  const owner = new PublicKey("BGzLYcFcUZkW5GPZZAYK4Jxyf1W7aigyHQbvmKsQeeuq");
  const mint = new PublicKey(GROK_TOKEN_MINT);
  const T22 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
  // The live buy used the Token-2022 derivation for this mint.
  assert.equal(ataFor(owner, mint, T22).toBase58(), "AT2Ly8b4JR5z4ZiWatPGF9xhZCWPrELdMhgdoJQH463Q");
  assert.notEqual(
    ataFor(owner, mint, new PublicKey(TOKEN_PROGRAM_ID)).toBase58(),
    ataFor(owner, mint, T22).toBase58(),
    "the wrong token program silently yields the wrong account",
  );
});

test("user_volume_accumulator matches the live transaction", () => {
  const user = new PublicKey("BGzLYcFcUZkW5GPZZAYK4Jxyf1W7aigyHQbvmKsQeeuq");
  assert.equal(
    userVolumeAccumulator(user).toBase58(),
    "7SEjF3ex7eS5tSLXYdiJN4dCcRZSakSCP4AioUA4qDhE",
  );
});

test("AMM user index is 1, not the curve's 13", () => {
  assert.equal(PUMP_AMM_USER_INDEX, 1);
  assert.notEqual(PUMP_AMM_USER_INDEX, 13);
  assert.equal(PUMP_AMM_PROGRAM_ID, "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
});

test("bonding curve layout decodes as verified against mainnet", () => {
  const creator = Keypair.generate().publicKey;
  const buf = Buffer.alloc(151);
  BONDING_CURVE_DISCRIMINATOR.copy(buf, 0);
  creator.toBuffer().copy(buf, 49);
  buf[BONDING_CURVE_COMPLETE_OFFSET] = 0;
  assert.equal(decodeBondingCurve(buf)?.complete, false);
  buf[BONDING_CURVE_COMPLETE_OFFSET] = 1;
  assert.equal(decodeBondingCurve(buf)?.complete, true, "complete=1 => graduated");
  assert.equal(decodeBondingCurve(Buffer.alloc(151)), undefined, "foreign bytes must not decode");
});

test("bondingCurvePda finds the curve $GrokChain graduated from", () => {
  assert.equal(
    bondingCurvePda(new PublicKey(GROK_TOKEN_MINT))[0].toBase58(),
    "FUm2yJLeSccee1DxGQRWcVsxJDPbzkAfPzZEwR4JqU3s",
  );
});

test("base58 decoder round-trips known pubkeys", () => {
  for (const b58 of [GROK_TOKEN_MINT, WSOL_MINT, PUMP_AMM_PROGRAM_ID]) {
    assert.equal(new PublicKey(b58decode(b58)).toBase58(), b58);
  }
  assert.equal(b58decode("11111111111111111111111111111111").length, 32);
});
