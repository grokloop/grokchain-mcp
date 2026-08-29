import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";
import { INTENTS_DISC, JUPITER_V6_PROGRAM_ID, PUMP_AMM_BUY_ACCOUNT_COUNT, PUMP_AMM_BUY_ACCOUNT_COUNT_CASHBACK, PUMP_AMM_PROGRAM_ID, PUMP_AMM_PROGRAM_INDEX, PUMP_AMM_SELL_ACCOUNT_COUNT, PUMP_AMM_USER_INDEX, PUMP_BUY_V2_ACCOUNT_COUNT, PUMP_CREATE_MINT_INDEX, PUMP_CREATE_USER_INDEX, PUMP_CREATE_V2_ACCOUNT_COUNT, PUMP_CREATE_V2_ACCOUNT_COUNT_WITH_QUOTE, PUMP_PROGRAM_ID, PUMP_SELL_V2_ACCOUNT_COUNT, PUMP_USER_INDEX, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "./constants.js";
import { encodeCallArgs, encodeDeployArgs, encodePayArgs, encodePubkey, encodePumpAmmBuyArgs, encodePumpAmmSellArgs, encodePumpBuyArgs, encodePumpCreateArgs, encodePumpSellArgs, encodeSwapArgs, encodeTokenTradeArgs, encodeU64 } from "./encode.js";
import { grantPda, grokAccountPda, paymasterPda, pumpTraderPda, spendVaultPda } from "./pda.js";

function meta(pubkey: PublicKey, isSigner: boolean, isWritable: boolean): AccountMeta {
  return { pubkey, isSigner, isWritable };
}

export type VaultAddrs = {
  grokAccount: PublicKey;
  spendVault: PublicKey;
  paymaster: PublicKey;
  grant: PublicKey;
  pumpTrader: PublicKey;
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
  const [pumpTrader] = pumpTraderPda(opts.intentsProgramId, grokAccount);
  const [grant] = opts.agent
    ? grantPda(opts.coreProgramId, grokAccount, opts.agent)
    : [PublicKey.default, 0];
  return { grokAccount, spendVault, paymaster, grant, pumpTrader };
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

function pumpMouthKeys(opts: {
  agent: PublicKey;
  grokAccount: PublicKey;
  grant: PublicKey;
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  spendVault: PublicKey;
  pumpTrader: PublicKey;
  paymaster: PublicKey;
  sponsorLamports: bigint | number | string;
  feePayer?: PublicKey;
}): AccountMeta[] {
  const sk = sponsorKeys({
    intentsProgramId: opts.intentsProgramId,
    paymaster: opts.paymaster,
    sponsorLamports: opts.sponsorLamports,
    feePayer: opts.feePayer,
  });
  // Always attach the relayer as fee_payer when present so ATA create can pay rent.
  const feePayerKey = opts.feePayer ?? sk.feePayerKey;
  const feePayerSigner = !!opts.feePayer;
  return [
    meta(opts.agent, true, false),
    meta(opts.grokAccount, false, false),
    meta(opts.grant, false, true),
    meta(opts.coreProgramId, false, false),
    meta(opts.intentsProgramId, false, false),
    meta(opts.spendVault, false, true),
    meta(opts.pumpTrader, false, true),
    meta(SystemProgram.programId, false, false),
    meta(new PublicKey(PUMP_PROGRAM_ID), false, false),
    meta(sk.paymasterKey, false, true),
    meta(feePayerKey, feePayerSigner, true),
  ];
}

function assertOfficialPumpAccounts(
  remaining: AccountMeta[],
  pumpTrader: PublicKey,
  spendVault: PublicKey,
  expected: number,
  kind: "buy" | "sell",
): void {
  if (remaining.length !== expected) {
    throw new Error(
      `pump_${kind} remaining_accounts must be the official ${expected}-account ${kind}_v2 list (got ${remaining.length})`,
    );
  }
  const user = remaining[PUMP_USER_INDEX];
  if (user && user.pubkey.equals(spendVault)) {
    throw new Error(`pump_${kind} remaining[${PUMP_USER_INDEX}] (user) must be the pump-trader PDA, not SpendVault`);
  }
  if (!user || !user.pubkey.equals(pumpTrader)) {
    throw new Error(`pump_${kind} remaining[${PUMP_USER_INDEX}] (user) must be the pump-trader PDA`);
  }
  const prog = remaining[expected - 1];
  if (!prog || prog.pubkey.toBase58() !== PUMP_PROGRAM_ID) {
    throw new Error(`pump_${kind} remaining last account must be official pump.fun ${PUMP_PROGRAM_ID}`);
  }
}

/** Tight INTENTS pump_buy. remaining_accounts = official buy_v2 list (27). */
export function buildPumpBuyIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  agent: PublicKey;
  amount: bigint | number | string;
  maxSolCost: bigint | number | string;
  sponsorLamports: bigint | number | string;
  feePayer?: PublicKey;
  remainingAccounts: AccountMeta[];
}): { ix: TransactionInstruction } & VaultAddrs {
  const addrs = deriveIntentsAddrs({ ...opts, agent: opts.agent });
  assertOfficialPumpAccounts(opts.remainingAccounts, addrs.pumpTrader, addrs.spendVault, PUMP_BUY_V2_ACCOUNT_COUNT, "buy");
  const keys: AccountMeta[] = [
    ...pumpMouthKeys({
      agent: opts.agent,
      grokAccount: addrs.grokAccount,
      grant: addrs.grant,
      coreProgramId: opts.coreProgramId,
      intentsProgramId: opts.intentsProgramId,
      spendVault: addrs.spendVault,
      pumpTrader: addrs.pumpTrader,
      paymaster: addrs.paymaster,
      sponsorLamports: opts.sponsorLamports,
      feePayer: opts.feePayer,
    }),
    ...opts.remainingAccounts,
  ];
  const data = Buffer.concat([
    Buffer.from(INTENTS_DISC.pump_buy),
    encodePumpBuyArgs({
      amount: opts.amount,
      maxSolCost: opts.maxSolCost,
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

/** Tight INTENTS pump_sell. remaining_accounts = official sell_v2 list (26). */
export function buildPumpSellIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  agent: PublicKey;
  amount: bigint | number | string;
  minSolOutput: bigint | number | string;
  sponsorLamports: bigint | number | string;
  feePayer?: PublicKey;
  remainingAccounts: AccountMeta[];
}): { ix: TransactionInstruction } & VaultAddrs {
  const addrs = deriveIntentsAddrs({ ...opts, agent: opts.agent });
  assertOfficialPumpAccounts(opts.remainingAccounts, addrs.pumpTrader, addrs.spendVault, PUMP_SELL_V2_ACCOUNT_COUNT, "sell");
  const keys: AccountMeta[] = [
    ...pumpMouthKeys({
      agent: opts.agent,
      grokAccount: addrs.grokAccount,
      grant: addrs.grant,
      coreProgramId: opts.coreProgramId,
      intentsProgramId: opts.intentsProgramId,
      spendVault: addrs.spendVault,
      pumpTrader: addrs.pumpTrader,
      paymaster: addrs.paymaster,
      sponsorLamports: opts.sponsorLamports,
      feePayer: opts.feePayer,
    }),
    ...opts.remainingAccounts,
  ];
  const data = Buffer.concat([
    Buffer.from(INTENTS_DISC.pump_sell),
    encodePumpSellArgs({
      amount: opts.amount,
      minSolOutput: opts.minSolOutput,
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

export function buildInitPumpTraderIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
}): { ix: TransactionInstruction } & VaultAddrs {
  const addrs = deriveIntentsAddrs(opts);
  return {
    ...addrs,
    ix: new TransactionInstruction({
      programId: opts.intentsProgramId,
      keys: [
        meta(opts.root, true, true),
        meta(addrs.grokAccount, false, false),
        meta(addrs.pumpTrader, false, true),
        meta(SystemProgram.programId, false, false),
      ],
      data: Buffer.from(INTENTS_DISC.init_pump_trader),
    }),
  };
}

export function buildFundPumpTraderIx(opts: {
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
      keys: [
        meta(opts.root, true, true),
        meta(addrs.grokAccount, false, false),
        meta(addrs.spendVault, false, true),
        meta(addrs.pumpTrader, false, true),
      ],
      data: Buffer.concat([Buffer.from(INTENTS_DISC.fund_pump_trader), encodeU64(opts.lamports)]),
    }),
  };
}


export function buildWithdrawPumpTraderIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  lamports: bigint | number | string;
  tokenPairs?: Array<{ from: PublicKey; to: PublicKey }>;
}): { ix: TransactionInstruction } & VaultAddrs {
  const addrs = deriveIntentsAddrs(opts);
  const pairs = opts.tokenPairs ?? [];
  const remaining: AccountMeta[] = [];
  for (const pair of pairs) {
    remaining.push(meta(pair.from, false, true));
    remaining.push(meta(pair.to, false, true));
  }
  return {
    ...addrs,
    ix: new TransactionInstruction({
      programId: opts.intentsProgramId,
      keys: [
        meta(opts.root, true, true),
        meta(addrs.grokAccount, false, false),
        meta(addrs.pumpTrader, false, true),
        meta(SystemProgram.programId, false, false),
        meta(new PublicKey(TOKEN_PROGRAM_ID), false, false),
        meta(new PublicKey(TOKEN_2022_PROGRAM_ID), false, false),
        ...remaining,
      ],
      data: Buffer.concat([Buffer.from(INTENTS_DISC.withdraw_pump_trader), encodeU64(opts.lamports)]),
    }),
  };
}


function assertOfficialPumpCreateAccounts(
  remaining: AccountMeta[],
  pumpTrader: PublicKey,
  spendVault: PublicKey,
  mint: PublicKey,
): void {
  const n = remaining.length;
  if (n !== PUMP_CREATE_V2_ACCOUNT_COUNT && n !== PUMP_CREATE_V2_ACCOUNT_COUNT_WITH_QUOTE) {
    throw new Error(
      `pump_create remaining_accounts must be the official ${PUMP_CREATE_V2_ACCOUNT_COUNT}-account create_v2 list (or ${PUMP_CREATE_V2_ACCOUNT_COUNT_WITH_QUOTE} with quote remaining); got ${n}`,
    );
  }
  const mintAcc = remaining[PUMP_CREATE_MINT_INDEX];
  if (!mintAcc || !mintAcc.pubkey.equals(mint)) {
    throw new Error("pump_create remaining[0] (mint) must be the client Token-2022 mint pubkey");
  }
  if (!mintAcc.isSigner) {
    throw new Error("pump_create remaining[0] (mint) must be a signer (client keypair, never vault)");
  }
  const user = remaining[PUMP_CREATE_USER_INDEX];
  if (user && user.pubkey.equals(spendVault)) {
    throw new Error("pump_create remaining[5] (user) must be the pump-trader PDA, not SpendVault");
  }
  if (!user || !user.pubkey.equals(pumpTrader)) {
    throw new Error("pump_create remaining[5] (user) must be the pump-trader PDA");
  }
  const prog = remaining[PUMP_CREATE_V2_ACCOUNT_COUNT - 1];
  if (!prog || prog.pubkey.toBase58() !== PUMP_PROGRAM_ID) {
    throw new Error(`pump_create remaining[15] must be official pump.fun ${PUMP_PROGRAM_ID}`);
  }
}

/** Tight INTENTS pump_create. remaining_accounts = official create_v2 list (16 or 19). */
export function buildPumpCreateIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  agent: PublicKey;
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  isMayhemMode: boolean;
  isCashbackEnabled: boolean;
  maxSolCost: bigint | number | string;
  sponsorLamports: bigint | number | string;
  feePayer?: PublicKey;
  remainingAccounts: AccountMeta[];
}): { ix: TransactionInstruction } & VaultAddrs {
  const addrs = deriveIntentsAddrs({ ...opts, agent: opts.agent });
  assertOfficialPumpCreateAccounts(opts.remainingAccounts, addrs.pumpTrader, addrs.spendVault, opts.mint);
  const keys: AccountMeta[] = [
    ...pumpMouthKeys({
      agent: opts.agent,
      grokAccount: addrs.grokAccount,
      grant: addrs.grant,
      coreProgramId: opts.coreProgramId,
      intentsProgramId: opts.intentsProgramId,
      spendVault: addrs.spendVault,
      pumpTrader: addrs.pumpTrader,
      paymaster: addrs.paymaster,
      sponsorLamports: opts.sponsorLamports,
      feePayer: opts.feePayer,
    }),
    ...opts.remainingAccounts,
  ];
  const data = Buffer.concat([
    Buffer.from(INTENTS_DISC.pump_create),
    encodePumpCreateArgs({
      name: opts.name,
      symbol: opts.symbol,
      uri: opts.uri,
      isMayhemMode: opts.isMayhemMode,
      isCashbackEnabled: opts.isCashbackEnabled,
      maxSolCost: opts.maxSolCost,
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

function pumpAmmMouthKeys(opts: {
  agent: PublicKey;
  grokAccount: PublicKey;
  grant: PublicKey;
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  spendVault: PublicKey;
  paymaster: PublicKey;
  sponsorLamports: bigint | number | string;
  feePayer?: PublicKey;
}): AccountMeta[] {
  const sk = sponsorKeys({
    intentsProgramId: opts.intentsProgramId,
    paymaster: opts.paymaster,
    sponsorLamports: opts.sponsorLamports,
    feePayer: opts.feePayer,
  });
  // Always attach the relayer as fee_payer when present so ATA create can pay rent.
  const feePayerKey = opts.feePayer ?? sk.feePayerKey;
  const feePayerSigner = !!opts.feePayer;
  return [
    meta(opts.agent, true, false),
    meta(opts.grokAccount, false, false),
    meta(opts.grant, false, true),
    meta(opts.coreProgramId, false, false),
    meta(opts.intentsProgramId, false, false),
    meta(opts.spendVault, false, true),
    meta(SystemProgram.programId, false, false),
    meta(new PublicKey(PUMP_AMM_PROGRAM_ID), false, false),
    meta(sk.paymasterKey, false, true),
    meta(feePayerKey, feePayerSigner, true),
  ];
}

function assertOfficialPumpAmmAccounts(
  remaining: AccountMeta[],
  pumpTrader: PublicKey,
  spendVault: PublicKey,
  kind: "buy" | "sell",
): void {
  const allowed =
    kind === "buy"
      ? [PUMP_AMM_BUY_ACCOUNT_COUNT, PUMP_AMM_BUY_ACCOUNT_COUNT_CASHBACK]
      : [PUMP_AMM_SELL_ACCOUNT_COUNT];
  if (!allowed.includes(remaining.length)) {
    throw new Error(
      kind === "buy"
        ? `pump_amm_buy remaining_accounts must be official PumpSwap buy list 26 (non-cashback) or 27 (cashback) (got ${remaining.length}). Do not use sell's 24.`
        : `pump_amm_sell remaining_accounts must be official PumpSwap sell list 24 (no volume accs) (got ${remaining.length}). Do not pass buy's 26/27.`,
    );
  }
  const user = remaining[PUMP_AMM_USER_INDEX];
  if (user && user.pubkey.equals(spendVault)) {
    throw new Error(`pump_amm_${kind} remaining[${PUMP_AMM_USER_INDEX}] (user) must be the pump-trader PDA, not SpendVault`);
  }
  if (!user || !user.pubkey.equals(pumpTrader)) {
    throw new Error(`pump_amm_${kind} remaining[${PUMP_AMM_USER_INDEX}] (user) must be the pump-trader PDA`);
  }
  const prog = remaining[PUMP_AMM_PROGRAM_INDEX];
  if (!prog || prog.pubkey.toBase58() !== PUMP_AMM_PROGRAM_ID) {
    throw new Error(`pump_amm_${kind} remaining[${PUMP_AMM_PROGRAM_INDEX}] must be official PumpSwap ${PUMP_AMM_PROGRAM_ID}`);
  }
}

/** Tight INTENTS pump_amm_buy. remaining_accounts = official PumpSwap buy list (26 or 27). Trader is remaining[1] only. */
export function buildPumpAmmBuyIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  agent: PublicKey;
  spendableQuoteIn: bigint | number | string;
  minBaseAmountOut: bigint | number | string;
  maxSolCost: bigint | number | string;
  sponsorLamports: bigint | number | string;
  feePayer?: PublicKey;
  remainingAccounts: AccountMeta[];
}): { ix: TransactionInstruction } & VaultAddrs {
  const addrs = deriveIntentsAddrs({ ...opts, agent: opts.agent });
  assertOfficialPumpAmmAccounts(opts.remainingAccounts, addrs.pumpTrader, addrs.spendVault, "buy");
  const keys: AccountMeta[] = [
    ...pumpAmmMouthKeys({
      agent: opts.agent,
      grokAccount: addrs.grokAccount,
      grant: addrs.grant,
      coreProgramId: opts.coreProgramId,
      intentsProgramId: opts.intentsProgramId,
      spendVault: addrs.spendVault,
      paymaster: addrs.paymaster,
      sponsorLamports: opts.sponsorLamports,
      feePayer: opts.feePayer,
    }),
    ...opts.remainingAccounts,
  ];
  const data = Buffer.concat([
    Buffer.from(INTENTS_DISC.pump_amm_buy),
    encodePumpAmmBuyArgs({
      spendableQuoteIn: opts.spendableQuoteIn,
      minBaseAmountOut: opts.minBaseAmountOut,
      maxSolCost: opts.maxSolCost,
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

/** Tight INTENTS pump_amm_sell. remaining_accounts = official PumpSwap sell list (24). Trader is remaining[1] only. */
export function buildPumpAmmSellIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  agent: PublicKey;
  baseAmountIn: bigint | number | string;
  minQuoteAmountOut: bigint | number | string;
  sponsorLamports: bigint | number | string;
  feePayer?: PublicKey;
  remainingAccounts: AccountMeta[];
}): { ix: TransactionInstruction } & VaultAddrs {
  const addrs = deriveIntentsAddrs({ ...opts, agent: opts.agent });
  assertOfficialPumpAmmAccounts(opts.remainingAccounts, addrs.pumpTrader, addrs.spendVault, "sell");
  const keys: AccountMeta[] = [
    ...pumpAmmMouthKeys({
      agent: opts.agent,
      grokAccount: addrs.grokAccount,
      grant: addrs.grant,
      coreProgramId: opts.coreProgramId,
      intentsProgramId: opts.intentsProgramId,
      spendVault: addrs.spendVault,
      paymaster: addrs.paymaster,
      sponsorLamports: opts.sponsorLamports,
      feePayer: opts.feePayer,
    }),
    ...opts.remainingAccounts,
  ];
  const data = Buffer.concat([
    Buffer.from(INTENTS_DISC.pump_amm_sell),
    encodePumpAmmSellArgs({
      baseAmountIn: opts.baseAmountIn,
      minQuoteAmountOut: opts.minQuoteAmountOut,
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

function tokenMouthKeys(opts: {
  agent: PublicKey;
  grokAccount: PublicKey;
  grant: PublicKey;
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  spendVault: PublicKey;
  paymaster: PublicKey;
  sponsorLamports: bigint | number | string;
  feePayer?: PublicKey;
}): AccountMeta[] {
  const sk = sponsorKeys({
    intentsProgramId: opts.intentsProgramId,
    paymaster: opts.paymaster,
    sponsorLamports: opts.sponsorLamports,
    feePayer: opts.feePayer,
  });
  const feePayerKey = opts.feePayer ?? sk.feePayerKey;
  const feePayerSigner = !!opts.feePayer;
  return [
    meta(opts.agent, true, false),
    meta(opts.grokAccount, false, false),
    meta(opts.grant, false, true),
    meta(opts.coreProgramId, false, false),
    meta(opts.intentsProgramId, false, false),
    meta(opts.spendVault, false, true),
    meta(SystemProgram.programId, false, false),
    meta(new PublicKey(JUPITER_V6_PROGRAM_ID), false, false),
    meta(sk.paymasterKey, false, true),
    meta(feePayerKey, feePayerSigner, true),
  ];
}

function assertTokenRemaining(
  remaining: AccountMeta[],
  pumpTrader: PublicKey,
  spendVault: PublicKey,
  kind: "buy" | "sell",
): void {
  if (remaining.length < 3) {
    throw new Error(`token_${kind} remaining_accounts must come from Jupiter swap-instructions (got ${remaining.length})`);
  }
  if (!remaining.some((a) => a.pubkey.equals(pumpTrader))) {
    throw new Error(`token_${kind} remaining_accounts must include the pump-trader PDA as Jupiter user`);
  }
  if (remaining.some((a) => a.pubkey.equals(spendVault))) {
    throw new Error(`token_${kind} remaining_accounts must not include SpendVault`);
  }
}

function buildTokenTradeIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  agent: PublicKey;
  inAmount: bigint | number | string;
  minOut: bigint | number | string;
  sponsorLamports: bigint | number | string;
  inputMint: PublicKey;
  outputMint: PublicKey;
  wrapSol: boolean;
  jupiterData: Uint8Array;
  feePayer?: PublicKey;
  remainingAccounts: AccountMeta[];
  kind: "buy" | "sell";
}): { ix: TransactionInstruction } & VaultAddrs {
  const addrs = deriveIntentsAddrs({ ...opts, agent: opts.agent });
  let remaining = opts.remainingAccounts;
  if (opts.wrapSol && !remaining.some((a) => a.pubkey.equals(SystemProgram.programId))) {
    remaining = [...remaining, meta(SystemProgram.programId, false, false)];
  }
  assertTokenRemaining(remaining, addrs.pumpTrader, addrs.spendVault, opts.kind);
  const disc = opts.kind === "buy" ? INTENTS_DISC.token_buy : INTENTS_DISC.token_sell;
  const keys: AccountMeta[] = [
    ...tokenMouthKeys({
      agent: opts.agent,
      grokAccount: addrs.grokAccount,
      grant: addrs.grant,
      coreProgramId: opts.coreProgramId,
      intentsProgramId: opts.intentsProgramId,
      spendVault: addrs.spendVault,
      paymaster: addrs.paymaster,
      sponsorLamports: opts.sponsorLamports,
      feePayer: opts.feePayer,
    }),
    ...remaining,
  ];
  const data = Buffer.concat([
    Buffer.from(disc),
    encodeTokenTradeArgs({
      inAmount: opts.inAmount,
      minOut: opts.minOut,
      sponsorLamports: opts.sponsorLamports,
      inputMint: opts.inputMint,
      outputMint: opts.outputMint,
      wrapSol: opts.wrapSol,
      jupiterData: opts.jupiterData,
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

/** Tight INTENTS token_buy. remaining = Jupiter swap-instructions accounts. Inner program hardcoded JUP6. */
export function buildTokenBuyIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  agent: PublicKey;
  inAmount: bigint | number | string;
  minOut: bigint | number | string;
  sponsorLamports: bigint | number | string;
  inputMint: PublicKey;
  outputMint: PublicKey;
  wrapSol: boolean;
  jupiterData: Uint8Array;
  feePayer?: PublicKey;
  remainingAccounts: AccountMeta[];
}): { ix: TransactionInstruction } & VaultAddrs {
  return buildTokenTradeIx({ ...opts, kind: "buy" });
}

/** Tight INTENTS token_sell. remaining = Jupiter swap-instructions accounts. Inner program hardcoded JUP6. */
export function buildTokenSellIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  agent: PublicKey;
  inAmount: bigint | number | string;
  minOut: bigint | number | string;
  sponsorLamports: bigint | number | string;
  inputMint: PublicKey;
  outputMint: PublicKey;
  wrapSol: boolean;
  jupiterData: Uint8Array;
  feePayer?: PublicKey;
  remainingAccounts: AccountMeta[];
}): { ix: TransactionInstruction } & VaultAddrs {
  return buildTokenTradeIx({ ...opts, kind: "sell" });
}
