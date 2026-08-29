/**
 * `pay_token` + merchant allowlist clients.
 *
 * This is the half of the payment story the program could not do: `pay` moves
 * lamports, and the Jupiter path can only land value back on the trader, so
 * until now an agent could acquire USDC and never spend it.
 *
 * Same mouth as every other intent — agent signs, relayer fee-pays, one CORE
 * check_grant — with two additions that only matter when you are paying people
 * rather than trading:
 *
 *   * the destination's OWNER must be on a root-owned allowlist, because a CORE
 *     grant can cap an amount but cannot name a payee;
 *   * a Solana Pay `reference` rides along read-only, so the merchant can match
 *     the transfer to an invoice.
 *
 * These require an INTENTS upgrade before they land. Sources and merge steps are
 * in grokchain-programs/upgrade-pay-token.
 */
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";
import {
  INTENTS_DISC,
  SEED_MERCHANTS,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "./constants.js";
import { encodePubkey, encodeU64 } from "./encode.js";
import { deriveIntentsAddrs, type VaultAddrs } from "./intents.js";
import { ataFor } from "./pump_amm_accounts.js";

/** Local copy: intents.ts keeps its own `meta` private. */
function meta(pubkey: PublicKey, isSigner: boolean, isWritable: boolean): AccountMeta {
  return { pubkey, isSigner, isWritable };
}

export function merchantRegistryPda(
  intentsProgramId: PublicKey,
  grokAccount: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_MERCHANTS, grokAccount.toBuffer()],
    intentsProgramId,
  );
}

/** PayTokenArgs: u64 amount + u8 decimals + u64 sponsor_lamports. */
export function encodePayTokenArgs(a: {
  amount: bigint | number | string;
  decimals: number;
  sponsorLamports: bigint | number | string;
}): Buffer {
  return Buffer.concat([
    encodeU64(a.amount),
    Buffer.from([a.decimals]),
    encodeU64(a.sponsorLamports),
  ]);
}

export type PayTokenAddrs = VaultAddrs & {
  merchantRegistry: PublicKey;
  source: PublicKey;
  destination: PublicKey;
};

/**
 * Build a payment. `destinationOwner` is the merchant's WALLET, not their token
 * account — the ATA is derived here so a caller cannot accidentally pay a token
 * account whose owner is not the merchant they meant.
 */
export function buildPayTokenIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  agent: PublicKey;
  mint: PublicKey;
  destinationOwner: PublicKey;
  amount: bigint | number | string;
  decimals: number;
  sponsorLamports?: bigint | number | string;
  /** Solana Pay reference. Read-only; the merchant matches the invoice by it. */
  reference?: PublicKey;
  tokenProgram?: PublicKey;
  feePayer?: PublicKey;
}): { ix: TransactionInstruction } & PayTokenAddrs {
  const addrs = deriveIntentsAddrs({ ...opts, agent: opts.agent });
  const [merchantRegistry] = merchantRegistryPda(opts.intentsProgramId, addrs.grokAccount);
  const tokenProgram = opts.tokenProgram ?? new PublicKey(TOKEN_PROGRAM_ID);
  const source = ataFor(addrs.pumpTrader, opts.mint, tokenProgram);
  const destination = ataFor(opts.destinationOwner, opts.mint, tokenProgram);

  const keys: AccountMeta[] = [
    meta(opts.agent, true, false),
    meta(addrs.grokAccount, false, false),
    meta(addrs.grant, false, true),
    meta(opts.coreProgramId, false, false),
    meta(opts.intentsProgramId, false, false),
    meta(addrs.spendVault, false, false),
    meta(merchantRegistry, false, false),
    meta(addrs.pumpTrader, false, false),
    meta(source, false, true),
    meta(destination, false, true),
    meta(opts.mint, false, false),
    meta(tokenProgram, false, false),
    // Optional accounts keep their slot: the program id stands in for None so
    // the list length never changes.
    meta(opts.reference ?? opts.intentsProgramId, false, false),
    meta(addrs.paymaster, false, true),
    meta(opts.feePayer ?? opts.intentsProgramId, !!opts.feePayer, true),
  ];

  return {
    ...addrs,
    merchantRegistry,
    source,
    destination,
    ix: new TransactionInstruction({
      programId: opts.intentsProgramId,
      keys,
      data: Buffer.concat([
        Buffer.from(INTENTS_DISC.pay_token),
        encodePayTokenArgs({
          amount: opts.amount,
          decimals: opts.decimals,
          sponsorLamports: opts.sponsorLamports ?? 0,
        }),
      ]),
    }),
  };
}

/** Root-only: create the allowlist, pinned to one mint. */
export function buildInitMerchantRegistryIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  mint: PublicKey;
}): { ix: TransactionInstruction; merchantRegistry: PublicKey } & VaultAddrs {
  const addrs = deriveIntentsAddrs(opts);
  const [merchantRegistry] = merchantRegistryPda(opts.intentsProgramId, addrs.grokAccount);
  return {
    ...addrs,
    merchantRegistry,
    ix: new TransactionInstruction({
      programId: opts.intentsProgramId,
      keys: [
        meta(opts.root, true, true),
        meta(addrs.grokAccount, false, false),
        meta(merchantRegistry, false, true),
        meta(SystemProgram.programId, false, false),
      ],
      data: Buffer.concat([
        Buffer.from(INTENTS_DISC.init_merchant_registry),
        encodePubkey(opts.mint),
      ]),
    }),
  };
}

/** Root-only: approve or revoke one payee. Removal is the per-merchant cancel. */
export function buildMerchantIx(opts: {
  coreProgramId: PublicKey;
  intentsProgramId: PublicKey;
  root: PublicKey;
  merchant: PublicKey;
  remove?: boolean;
}): { ix: TransactionInstruction; merchantRegistry: PublicKey } & VaultAddrs {
  const addrs = deriveIntentsAddrs(opts);
  const [merchantRegistry] = merchantRegistryPda(opts.intentsProgramId, addrs.grokAccount);
  const disc = opts.remove
    ? INTENTS_DISC.remove_merchant
    : INTENTS_DISC.add_merchant;
  return {
    ...addrs,
    merchantRegistry,
    ix: new TransactionInstruction({
      programId: opts.intentsProgramId,
      keys: [
        meta(opts.root, true, false),
        meta(addrs.grokAccount, false, false),
        meta(merchantRegistry, false, true),
      ],
      data: Buffer.concat([Buffer.from(disc), encodePubkey(opts.merchant)]),
    }),
  };
}

export type DecodedRegistry = {
  grokAccount: string;
  root: string;
  mint: string;
  merchants: string[];
};

/** Layout: disc(8) + grok(32) + root(32) + mint(32) + bump(1) + vec<pubkey>. */
export function decodeMerchantRegistry(data: Buffer): DecodedRegistry | undefined {
  if (data.length < 8 + 32 + 32 + 32 + 1 + 4) return undefined;
  const pk = (o: number) => new PublicKey(data.subarray(o, o + 32)).toBase58();
  const count = data.readUInt32LE(105);
  if (data.length < 109 + count * 32) return undefined;
  const merchants: string[] = [];
  for (let i = 0; i < count; i++) merchants.push(pk(109 + i * 32));
  return { grokAccount: pk(8), root: pk(40), mint: pk(72), merchants };
}

/** Both token programs, so a Token-2022 stablecoin is not silently unsupported. */
export const TOKEN_PROGRAMS = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID] as const;
