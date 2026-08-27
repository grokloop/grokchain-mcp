import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";
import { INTENTS_DISC } from "./constants.js";
import { encodeCallArgs, encodeDeployArgs, encodePayArgs, encodePubkey, encodeSwapArgs, encodeU64 } from "./encode.js";
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

function sponsorKeys(opts: {
  intentsProgramId: PublicKey;
  paymaster: PublicKey;
  sponsorLamports: bigint | number | string;
  feePayer?: PublicKey;
}): { paymasterKey: PublicKey; feePayerKey: PublicKey; feePayerSigner: boolean } {
  const sponsor = BigInt(opts.sponsorLamports);
  const dummy = opts.intentsProgramId;
  return {
    paymasterKey: sponsor > 0n ? opts.paymaster : dummy,
    feePayerKey: sponsor > 0n ? (opts.feePayer ?? dummy) : dummy,
    feePayerSigner: sponsor > 0n && !!opts.feePayer,
  };
}

/** SPEC swap metas: pay shape with out_destination. */
export function buildSwapIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  agent: PublicKey;
  outDestination: PublicKey;
  amountInLamports: bigint | number | string;
  minOutLamports: bigint | number | string;
  sponsorLamports: bigint | number | string;
  feePayer?: PublicKey;
}): { ix: TransactionInstruction } & VaultAddrs {
  const addrs = deriveIntentsAddrs({ ...opts, agent: opts.agent });
  const sk = sponsorKeys({
    intentsProgramId: opts.intentsProgramId,
    paymaster: addrs.paymaster,
    sponsorLamports: opts.sponsorLamports,
    feePayer: opts.feePayer,
  });
  const keys: AccountMeta[] = [
    meta(opts.agent, true, false),
    meta(addrs.grokAccount, false, false),
    meta(addrs.grant, false, true),
    meta(opts.coreProgramId, false, false),
    meta(opts.intentsProgramId, false, false),
    meta(addrs.spendVault, false, true),
    meta(opts.outDestination, false, true),
    meta(SystemProgram.programId, false, false),
    meta(sk.paymasterKey, false, true),
    meta(sk.feePayerKey, sk.feePayerSigner, true),
  ];
  const data = Buffer.concat([
    Buffer.from(INTENTS_DISC.swap),
    encodeSwapArgs({
      amountInLamports: opts.amountInLamports,
      minOutLamports: opts.minOutLamports,
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

/** SPEC deploy metas. spend_vault is present and not writable. */
export function buildDeployIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  agent: PublicKey;
  programId: PublicKey;
  sponsorLamports: bigint | number | string;
  feePayer?: PublicKey;
}): { ix: TransactionInstruction } & VaultAddrs {
  const addrs = deriveIntentsAddrs({ ...opts, agent: opts.agent });
  const sk = sponsorKeys({
    intentsProgramId: opts.intentsProgramId,
    paymaster: addrs.paymaster,
    sponsorLamports: opts.sponsorLamports,
    feePayer: opts.feePayer,
  });
  const keys: AccountMeta[] = [
    meta(opts.agent, true, false),
    meta(addrs.grokAccount, false, false),
    meta(addrs.grant, false, true),
    meta(opts.coreProgramId, false, false),
    meta(opts.intentsProgramId, false, false),
    meta(addrs.spendVault, false, false),
    meta(SystemProgram.programId, false, false),
    meta(sk.paymasterKey, false, true),
    meta(sk.feePayerKey, sk.feePayerSigner, true),
  ];
  const data = Buffer.concat([
    Buffer.from(INTENTS_DISC.deploy),
    encodeDeployArgs({
      sponsorLamports: opts.sponsorLamports,
      programId: opts.programId,
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

/** SPEC call metas + optional remaining_accounts. */
export function buildCallIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  agent: PublicKey;
  recipient: PublicKey;
  targetProgram: PublicKey;
  amountLamports: bigint | number | string;
  sponsorLamports: bigint | number | string;
  feePayer?: PublicKey;
  remainingAccounts?: AccountMeta[];
}): { ix: TransactionInstruction } & VaultAddrs {
  const addrs = deriveIntentsAddrs({ ...opts, agent: opts.agent });
  const sk = sponsorKeys({
    intentsProgramId: opts.intentsProgramId,
    paymaster: addrs.paymaster,
    sponsorLamports: opts.sponsorLamports,
    feePayer: opts.feePayer,
  });
  const keys: AccountMeta[] = [
    meta(opts.agent, true, false),
    meta(addrs.grokAccount, false, false),
    meta(addrs.grant, false, true),
    meta(opts.coreProgramId, false, false),
    meta(opts.intentsProgramId, false, false),
    meta(addrs.spendVault, false, true),
    meta(opts.recipient, false, true),
    meta(SystemProgram.programId, false, false),
    meta(opts.targetProgram, false, false),
    meta(sk.paymasterKey, false, true),
    meta(sk.feePayerKey, sk.feePayerSigner, true),
    ...prependTargetForInvoke(opts.targetProgram, opts.remainingAccounts ?? []),
  ];
  const data = Buffer.concat([
    Buffer.from(INTENTS_DISC.call),
    encodeCallArgs({
      amountLamports: opts.amountLamports,
      sponsorLamports: opts.sponsorLamports,
      targetProgram: opts.targetProgram,
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

function prependTargetForInvoke(target: PublicKey, remaining: AccountMeta[]): AccountMeta[] {
  if (remaining.length === 0) return [];
  if (remaining.some((a) => a.pubkey.equals(target))) return remaining;
  return [meta(target, false, false), ...remaining];
}
