/**
 * CORE + INTENTS wire constants.
 *
 * LOCAL-ONLY program ids are defaults ONLY when cluster=localnet.
 * They are not a deployed program. Not on devnet. Not on mainnet.
 * Do not advertise these ids as live.
 *
 * DEVNET program ids are the grokchain-devnet deployed programs.
 * Used ONLY when cluster=devnet (via config/devnet.json / explicit default).
 * Never use them on localnet. Never use the local-only pair on devnet.
 */
export const LOCAL_ONLY_PROGRAM_ID =
  "8WDhHSfrz6hMkmX7WteAAmyuWFLryHM2Kfc1r4k8EFXE";

/** INTENTS crate grok_chain_intents. LOCAL-ONLY. Not deployed. Not on devnet. */
export const LOCAL_ONLY_INTENTS_PROGRAM_ID =
  "AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2";

/** grokchain-devnet deployed CORE. Used only when cluster=devnet. */
export const DEVNET_CORE_PROGRAM_ID =
  "7UtafKBBWNHEXC9PaNXu8USdZqL6VEWupsL7rS6LeVDj";

/** grokchain-devnet deployed INTENTS (devnet router). Used only when cluster=devnet. */
export const DEVNET_INTENTS_PROGRAM_ID =
  "EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz";

export const SEED_GROK_ACCOUNT = Buffer.from("grok-account");
export const SEED_GRANT = Buffer.from("grant");
export const SEED_SPEND_VAULT = Buffer.from("spend-vault");
export const SEED_PAYMASTER = Buffer.from("paymaster");

export const MAX_ALLOWED_PROGRAMS = 8;
export const LABEL_LEN = 32;
export const MAX_SPONSOR_LAMPORTS = 10_000_000;
export const SPEND_VAULT_SPACE = 73;
export const PAYMASTER_SPACE = 106;

/** Anchor instruction discriminators (first 8 bytes of ix data). CORE. */
export const DISC = {
  create_account: Buffer.from([0x63, 0x14, 0x82, 0x77, 0xc4, 0xeb, 0x83, 0x95]),
  issue_grant: Buffer.from([0x41, 0xbe, 0x63, 0x4b, 0x47, 0x46, 0x14, 0x6b]),
  revise_grant: Buffer.from([0x05, 0xe1, 0x47, 0x7f, 0xcd, 0xf6, 0xea, 0x3b]),
  revoke_grant: Buffer.from([0x86, 0xb4, 0x39, 0x27, 0x98, 0x07, 0x9a, 0x62]),
  check_grant: Buffer.from([0xdf, 0xac, 0x83, 0x8c, 0x0f, 0x85, 0xd1, 0xfa]),
} as const;

/** Anchor instruction discriminators. INTENTS (SPEC §5.4). */
export const INTENTS_DISC = {
  init_spend_vault: Buffer.from([241, 173, 7, 179, 120, 124, 213, 61]),
  fund_spend_vault: Buffer.from([105, 178, 22, 113, 64, 88, 201, 233]),
  withdraw_spend_vault: Buffer.from([41, 235, 152, 150, 129, 122, 224, 37]),
  init_paymaster: Buffer.from([23, 62, 252, 40, 178, 70, 114, 54]),
  fund_paymaster: Buffer.from([84, 67, 136, 170, 168, 163, 220, 103]),
  withdraw_paymaster: Buffer.from([54, 60, 197, 226, 34, 179, 149, 189]),
  set_relayer: Buffer.from([23, 243, 33, 88, 110, 84, 196, 37]),
  pause_paymaster: Buffer.from([97, 26, 152, 173, 59, 148, 244, 77]),
  unpause_paymaster: Buffer.from([143, 248, 211, 216, 98, 113, 49, 251]),
  pay: Buffer.from([119, 18, 216, 65, 192, 117, 122, 220]),
  swap: Buffer.from([248, 198, 158, 145, 225, 117, 135, 200]),
  deploy: Buffer.from([67, 36, 143, 118, 36, 164, 92, 217]),
  call: Buffer.from([181, 94, 56, 161, 194, 221, 200, 3]),
} as const;

/** Anchor account discriminators. */
export const ACCOUNT_DISC = {
  GrokAccount: Buffer.from([59, 163, 255, 43, 255, 145, 237, 105]),
  Grant: Buffer.from([161, 166, 11, 205, 204, 135, 205, 54]),
} as const;

export const INTENTS_ACCOUNT_DISC = {
  SpendVault: Buffer.from([75, 166, 253, 76, 235, 57, 134, 93]),
  Paymaster: Buffer.from([79, 131, 123, 96, 75, 37, 131, 106]),
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
