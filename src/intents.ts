import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";
import { INTENTS_DISC } from "./constants.js";
import { encodePayArgs, encodePubkey, encodeU64 } from "./encode.js";
import { grantPda, grokAccountPda, paymasterPda, spendVaultPda } from "./pda.js";

function meta(pubkey: PublicKey, isSigner: boolean, isWritable: boolean): AccountMeta {
  return { pubkey, isSigner, isWritable };
}

export type VaultAddrs = {
  grokAccount: PublicKey;
  spendVault: PublicKey;
  paymaster: PublicKey;
  grant: PublicKey;
};

export function deriveIntentsAddrs(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  agent?: PublicKey;
}): VaultAddrs {
  const [grokAccount] = grokAccountPda(opts.coreProgramId, opts.root);
  const [spendVault] = spendVaultPda(opts.intentsProgramId, grokAccount);
  const [paymaster] = paymasterPda(opts.intentsProgramId, grokAccount);
  const [grant] = opts.agent
    ? grantPda(opts.coreProgramId, grokAccount, opts.agent)
    : [PublicKey.default, 0];
  return { grokAccount, spendVault, paymaster, grant };
}

function vaultInitKeys(opts: {
  root: PublicKey;
  grokAccount: PublicKey;
  vault: PublicKey;
}): AccountMeta[] {
  return [
    meta(opts.root, true, true),
    meta(opts.grokAccount, false, false),
    meta(opts.vault, false, true),
    meta(SystemProgram.programId, false, false),
  ];
}

function vaultFundKeys(opts: {
  root: PublicKey;
  grokAccount: PublicKey;
  vault: PublicKey;
}): AccountMeta[] {
  return vaultInitKeys(opts);
}

function vaultWithdrawKeys(opts: {
  root: PublicKey;
  grokAccount: PublicKey;
  vault: PublicKey;
}): AccountMeta[] {
  return [
    meta(opts.root, true, true),
    meta(opts.grokAccount, false, false),
    meta(opts.vault, false, true),
  ];
}

function paymasterAdminKeys(opts: {
  root: PublicKey;
  grokAccount: PublicKey;
  paymaster: PublicKey;
}): AccountMeta[] {
  return [
    meta(opts.root, true, false),
    meta(opts.grokAccount, false, false),
    meta(opts.paymaster, false, true),
  ];
}

export function buildInitSpendVaultIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
}): { ix: TransactionInstruction } & VaultAddrs {
  const addrs = deriveIntentsAddrs(opts);
  return {
    ...addrs,
    ix: new TransactionInstruction({
      programId: opts.intentsProgramId,
      keys: vaultInitKeys({ root: opts.root, grokAccount: addrs.grokAccount, vault: addrs.spendVault }),
      data: Buffer.from(INTENTS_DISC.init_spend_vault),
    }),
  };
}

export function buildFundSpendVaultIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  lamports: bigint | number | string;
}): { ix: TransactionInstruction } & VaultAddrs {
  const addrs = deriveIntentsAddrs(opts);
  return {
    ...addrs,
    ix: new TransactionInstruction({
      programId: opts.intentsProgramId,
      keys: vaultFundKeys({ root: opts.root, grokAccount: addrs.grokAccount, vault: addrs.spendVault }),
      data: Buffer.concat([Buffer.from(INTENTS_DISC.fund_spend_vault), encodeU64(opts.lamports)]),
    }),
  };
}

export function buildWithdrawSpendVaultIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  lamports: bigint | number | string;
}): { ix: TransactionInstruction } & VaultAddrs {
  const addrs = deriveIntentsAddrs(opts);
  return {
    ...addrs,
    ix: new TransactionInstruction({
      programId: opts.intentsProgramId,
      keys: vaultWithdrawKeys({ root: opts.root, grokAccount: addrs.grokAccount, vault: addrs.spendVault }),
      data: Buffer.concat([Buffer.from(INTENTS_DISC.withdraw_spend_vault), encodeU64(opts.lamports)]),
    }),
  };
}

export function buildInitPaymasterIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  relayer: PublicKey;
}): { ix: TransactionInstruction } & VaultAddrs {
  const addrs = deriveIntentsAddrs(opts);
  return {
    ...addrs,
    ix: new TransactionInstruction({
      programId: opts.intentsProgramId,
      keys: vaultInitKeys({ root: opts.root, grokAccount: addrs.grokAccount, vault: addrs.paymaster }),
      data: Buffer.concat([Buffer.from(INTENTS_DISC.init_paymaster), encodePubkey(opts.relayer)]),
    }),
  };
}

export function buildFundPaymasterIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  lamports: bigint | number | string;
}): { ix: TransactionInstruction } & VaultAddrs {
  const addrs = deriveIntentsAddrs(opts);
  return {
    ...addrs,
    ix: new TransactionInstruction({
      programId: opts.intentsProgramId,
      keys: vaultFundKeys({ root: opts.root, grokAccount: addrs.grokAccount, vault: addrs.paymaster }),
      data: Buffer.concat([Buffer.from(INTENTS_DISC.fund_paymaster), encodeU64(opts.lamports)]),
    }),
  };
}

export function buildWithdrawPaymasterIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  lamports: bigint | number | string;
}): { ix: TransactionInstruction } & VaultAddrs {
  const addrs = deriveIntentsAddrs(opts);
  return {
    ...addrs,
    ix: new TransactionInstruction({
      programId: opts.intentsProgramId,
      keys: vaultWithdrawKeys({ root: opts.root, grokAccount: addrs.grokAccount, vault: addrs.paymaster }),
      data: Buffer.concat([Buffer.from(INTENTS_DISC.withdraw_paymaster), encodeU64(opts.lamports)]),
    }),
  };
}

export function buildSetRelayerIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  relayer: PublicKey;
}): { ix: TransactionInstruction } & VaultAddrs {
  const addrs = deriveIntentsAddrs(opts);
  return {
    ...addrs,
    ix: new TransactionInstruction({
      programId: opts.intentsProgramId,
      keys: paymasterAdminKeys({ root: opts.root, grokAccount: addrs.grokAccount, paymaster: addrs.paymaster }),
      data: Buffer.concat([Buffer.from(INTENTS_DISC.set_relayer), encodePubkey(opts.relayer)]),
    }),
  };
}

export function buildPausePaymasterIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
}): { ix: TransactionInstruction } & VaultAddrs {
  const addrs = deriveIntentsAddrs(opts);
  return {
    ...addrs,
    ix: new TransactionInstruction({
      programId: opts.intentsProgramId,
      keys: paymasterAdminKeys({ root: opts.root, grokAccount: addrs.grokAccount, paymaster: addrs.paymaster }),
      data: Buffer.from(INTENTS_DISC.pause_paymaster),
    }),
  };
}

export function buildUnpausePaymasterIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
}): { ix: TransactionInstruction } & VaultAddrs {
  const addrs = deriveIntentsAddrs(opts);
  return {
    ...addrs,
    ix: new TransactionInstruction({
      programId: opts.intentsProgramId,
      keys: paymasterAdminKeys({ root: opts.root, grokAccount: addrs.grokAccount, paymaster: addrs.paymaster }),
      data: Buffer.from(INTENTS_DISC.unpause_paymaster),
    }),
  };
}

/**
 * SPEC §10 pay metas.
 * When sponsor_lamports == 0, optional paymaster + fee_payer are the intents program id (Anchor Option dummy).
 * When sponsor_lamports > 0, paymaster + relayer fee_payer (writable signer) are required.
 */
export function buildPayIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  agent: PublicKey;
  recipient: PublicKey;
  amountLamports: bigint | number | string;
  sponsorLamports: bigint | number | string;
  feePayer?: PublicKey;
}): { ix: TransactionInstruction } & VaultAddrs {
  const addrs = deriveIntentsAddrs({ ...opts, agent: opts.agent });
  const sponsor = BigInt(opts.sponsorLamports);
  const dummy = opts.intentsProgramId;
  const paymasterKey = sponsor > 0n ? addrs.paymaster : dummy;
  const feePayerKey = sponsor > 0n ? (opts.feePayer ?? dummy) : dummy;
  const feePayerSigner = sponsor > 0n && !!opts.feePayer;
  const keys: AccountMeta[] = [
    meta(opts.agent, true, false),
    meta(addrs.grokAccount, false, false),
    meta(addrs.grant, false, true),
    meta(opts.coreProgramId, false, false),
    meta(opts.intentsProgramId, false, false),
    meta(addrs.spendVault, false, true),
    meta(opts.recipient, false, true),
    meta(SystemProgram.programId, false, false),
    meta(paymasterKey, false, true),
    meta(feePayerKey, feePayerSigner, true),
  ];
  const data = Buffer.concat([
    Buffer.from(INTENTS_DISC.pay),
    encodePayArgs({
      amountLamports: opts.amountLamports,
      sponsorLamports: opts.sponsorLamports,
    }),
  ]);
  return {
    ...addrs,
    ix: new TransactionInstruction({
      programId: opts.intentsProgramId,
      keys,
      data,
    }),
  };
}

export function buildStubIntentIx(opts: {
  intentsProgramId: PublicKey;
  agent: PublicKey;
  kind: "swap" | "deploy" | "call";
}): { ix: TransactionInstruction } {
  return {
    ix: new TransactionInstruction({
      programId: opts.intentsProgramId,
      keys: [meta(opts.agent, true, false)],
      data: Buffer.from(INTENTS_DISC[opts.kind]),
    }),
  };
}
