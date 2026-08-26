import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";
import { DISC } from "./constants.js";
import {
  encodeCheckGrantArgs,
  encodeGrantPolicyArgs,
  type GrantPolicyArgs,
} from "./encode.js";
import { grantPda, grokAccountPda } from "./pda.js";

function meta(pubkey: PublicKey, isSigner: boolean, isWritable: boolean): AccountMeta {
  return { pubkey, isSigner, isWritable };
}

export function buildCreateAccountIx(opts: {
  programId: PublicKey;
  root: PublicKey;
}): { ix: TransactionInstruction; grokAccount: PublicKey } {
  const [grokAccount] = grokAccountPda(opts.programId, opts.root);
  const keys: AccountMeta[] = [
    meta(opts.root, true, true),
    meta(grokAccount, false, true),
    meta(SystemProgram.programId, false, false),
  ];
  return {
    grokAccount,
    ix: new TransactionInstruction({
      programId: opts.programId,
      keys,
      data: Buffer.from(DISC.create_account),
    }),
  };
}

export function buildIssueGrantIx(opts: {
  programId: PublicKey;
  root: PublicKey;
  agent: PublicKey;
  policy: GrantPolicyArgs;
}): { ix: TransactionInstruction; grokAccount: PublicKey; grant: PublicKey } {
  const [grokAccount] = grokAccountPda(opts.programId, opts.root);
  const [grant] = grantPda(opts.programId, grokAccount, opts.agent);
  const keys: AccountMeta[] = [
    meta(opts.root, true, true),
    meta(grokAccount, false, true),
    meta(opts.agent, false, false),
    meta(grant, false, true),
    meta(SystemProgram.programId, false, false),
  ];
  const data = Buffer.concat([
    Buffer.from(DISC.issue_grant),
    encodeGrantPolicyArgs(opts.policy),
  ]);
  return {
    grokAccount,
    grant,
    ix: new TransactionInstruction({ programId: opts.programId, keys, data }),
  };
}

export function buildReviseGrantIx(opts: {
  programId: PublicKey;
  root: PublicKey;
  agent: PublicKey;
  policy: GrantPolicyArgs;
}): { ix: TransactionInstruction; grokAccount: PublicKey; grant: PublicKey } {
  const [grokAccount] = grokAccountPda(opts.programId, opts.root);
  const [grant] = grantPda(opts.programId, grokAccount, opts.agent);
  const keys: AccountMeta[] = [
    meta(opts.root, true, false),
    meta(grokAccount, false, false),
    meta(grant, false, true),
  ];
  const data = Buffer.concat([
    Buffer.from(DISC.revise_grant),
    encodeGrantPolicyArgs(opts.policy),
  ]);
  return {
    grokAccount,
    grant,
    ix: new TransactionInstruction({ programId: opts.programId, keys, data }),
  };
}

export function buildRevokeGrantIx(opts: {
  programId: PublicKey;
  root: PublicKey;
  agent: PublicKey;
}): { ix: TransactionInstruction; grokAccount: PublicKey; grant: PublicKey } {
  const [grokAccount] = grokAccountPda(opts.programId, opts.root);
  const [grant] = grantPda(opts.programId, grokAccount, opts.agent);
  const keys: AccountMeta[] = [
    meta(opts.root, true, false),
    meta(grokAccount, false, false),
    meta(grant, false, true),
  ];
  return {
    grokAccount,
    grant,
    ix: new TransactionInstruction({
      programId: opts.programId,
      keys,
      data: Buffer.from(DISC.revoke_grant),
    }),
  };
}

export function buildCheckGrantIx(opts: {
  programId: PublicKey;
  root: PublicKey;
  agent: PublicKey;
  targetProgram: PublicKey;
  amountLamports: bigint | number | string;
}): { ix: TransactionInstruction; grokAccount: PublicKey; grant: PublicKey } {
  const [grokAccount] = grokAccountPda(opts.programId, opts.root);
  const [grant] = grantPda(opts.programId, grokAccount, opts.agent);
  const keys: AccountMeta[] = [
    meta(grokAccount, false, false),
    meta(grant, false, true),
    meta(opts.agent, true, false),
    meta(opts.targetProgram, false, false),
  ];
  const data = Buffer.concat([
    Buffer.from(DISC.check_grant),
    encodeCheckGrantArgs(opts.amountLamports),
  ]);
  return {
    grokAccount,
    grant,
    ix: new TransactionInstruction({ programId: opts.programId, keys, data }),
  };
}
