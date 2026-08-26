import { PublicKey, type Connection } from "@solana/web3.js";
import { ACCOUNT_DISC } from "./constants.js";
import { decodeLabel } from "./encode.js";

export type DecodedGrokAccount = {
  root: string;
  bump: number;
  created_at_unix: number;
  grant_count: number;
};

export type DecodedGrant = {
  grok_account: string;
  root: string;
  agent: string;
  spend_cap_lamports: string;
  spent_lamports: string;
  remaining_lamports: string;
  allowed_programs: string[];
  expires_at_unix: number;
  revoked: boolean;
  sponsor_eligible: boolean;
  bump: number;
  generation: number;
  issued_at_unix: number;
  label: string;
  label_untrusted: true;
};

function requireDisc(data: Buffer, expected: Buffer, name: string): void {
  if (data.length < 8 || !data.subarray(0, 8).equals(expected)) {
    throw new Error(`account data is not a ${name}`);
  }
}

export function decodeGrokAccount(data: Buffer): DecodedGrokAccount {
  requireDisc(data, Buffer.from(ACCOUNT_DISC.GrokAccount), "GrokAccount");
  let o = 8;
  const root = new PublicKey(data.subarray(o, o + 32));
  o += 32;
  const bump = data[o]!;
  o += 1;
  const created_at_unix = Number(data.readBigInt64LE(o));
  o += 8;
  const grant_count = data.readUInt32LE(o);
  return {
    root: root.toBase58(),
    bump,
    created_at_unix,
    grant_count,
  };
}

export function decodeGrant(data: Buffer): DecodedGrant {
  requireDisc(data, Buffer.from(ACCOUNT_DISC.Grant), "Grant");
  let o = 8;
  const grok_account = new PublicKey(data.subarray(o, o + 32));
  o += 32;
  const root = new PublicKey(data.subarray(o, o + 32));
  o += 32;
  const agent = new PublicKey(data.subarray(o, o + 32));
  o += 32;
  const spend_cap_lamports = data.readBigUInt64LE(o);
  o += 8;
  const spent_lamports = data.readBigUInt64LE(o);
  o += 8;
  const n = data.readUInt32LE(o);
  o += 4;
  const allowed_programs: string[] = [];
  for (let i = 0; i < n; i++) {
    allowed_programs.push(new PublicKey(data.subarray(o, o + 32)).toBase58());
    o += 32;
  }
  const expires_at_unix = Number(data.readBigInt64LE(o));
  o += 8;
  const revoked = data[o] !== 0;
  o += 1;
  const sponsor_eligible = data[o] !== 0;
  o += 1;
  const bump = data[o]!;
  o += 1;
  const generation = data.readUInt32LE(o);
  o += 4;
  const issued_at_unix = Number(data.readBigInt64LE(o));
  o += 8;
  const label = decodeLabel(data.subarray(o, o + 32));
  const remaining = spend_cap_lamports - spent_lamports;
  return {
    grok_account: grok_account.toBase58(),
    root: root.toBase58(),
    agent: agent.toBase58(),
    spend_cap_lamports: spend_cap_lamports.toString(),
    spent_lamports: spent_lamports.toString(),
    remaining_lamports: remaining.toString(),
    allowed_programs,
    expires_at_unix,
    revoked,
    sponsor_eligible,
    bump,
    generation,
    issued_at_unix,
    label,
    label_untrusted: true,
  };
}

export async function fetchGrokAccount(
  connection: Connection,
  address: PublicKey,
): Promise<DecodedGrokAccount | null> {
  const info = await connection.getAccountInfo(address);
  if (!info) return null;
  return decodeGrokAccount(Buffer.from(info.data));
}

export async function fetchGrant(
  connection: Connection,
  address: PublicKey,
): Promise<DecodedGrant | null> {
  const info = await connection.getAccountInfo(address);
  if (!info) return null;
  return decodeGrant(Buffer.from(info.data));
}
