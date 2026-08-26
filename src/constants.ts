/**
 * CORE wire constants. The local-only program id is the default ONLY when
 * cluster=localnet. CORE is not deployed. Not on devnet. Not on mainnet.
 * Do not advertise this id as live.
 */
export const LOCAL_ONLY_PROGRAM_ID =
  "8WDhHSfrz6hMkmX7WteAAmyuWFLryHM2Kfc1r4k8EFXE";

export const SEED_GROK_ACCOUNT = Buffer.from("grok-account");
export const SEED_GRANT = Buffer.from("grant");

export const MAX_ALLOWED_PROGRAMS = 8;
export const LABEL_LEN = 32;

/** Anchor instruction discriminators (first 8 bytes of ix data). */
export const DISC = {
  create_account: Buffer.from([0x63, 0x14, 0x82, 0x77, 0xc4, 0xeb, 0x83, 0x95]),
  issue_grant: Buffer.from([0x41, 0xbe, 0x63, 0x4b, 0x47, 0x46, 0x14, 0x6b]),
  revise_grant: Buffer.from([0x05, 0xe1, 0x47, 0x7f, 0xcd, 0xf6, 0xea, 0x3b]),
  revoke_grant: Buffer.from([0x86, 0xb4, 0x39, 0x27, 0x98, 0x07, 0x9a, 0x62]),
  check_grant: Buffer.from([0xdf, 0xac, 0x83, 0x8c, 0x0f, 0x85, 0xd1, 0xfa]),
} as const;

/** Anchor account discriminators. */
export const ACCOUNT_DISC = {
  GrokAccount: Buffer.from([59, 163, 255, 43, 255, 145, 237, 105]),
  Grant: Buffer.from([161, 166, 11, 205, 204, 135, 205, 54]),
} as const;

export const HUMAN_MD = "HUMAN.md";

export const FORBIDDEN_SECRET_FIELDS = [
  "seed",
  "mnemonic",
  "privateKey",
  "secretKey",
  "keypair",
  "private_key",
  "secret_key",
  "seedPhrase",
  "seed_phrase",
  "secret",
] as const;
