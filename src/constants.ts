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
/** Root-owned payee allowlist. CORE grants cannot constrain a recipient. */
export const SEED_MERCHANTS = Buffer.from("merchants");
export const MAX_MERCHANTS = 32;
/** One subscription per (merchant, mint) under a GrokAccount. */
export const SEED_SUBSCRIPTION = Buffer.from("subscription");

export const SEED_PUMP_TRADER = Buffer.from("pump-trader");

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
  pump_buy: Buffer.from([82, 225, 119, 231, 78, 29, 45, 70]),
  pump_sell: Buffer.from([93, 88, 60, 34, 91, 18, 86, 197]),
  init_pump_trader: Buffer.from([92, 98, 75, 2, 93, 219, 250, 5]),
  fund_pump_trader: Buffer.from([63, 189, 216, 54, 81, 101, 241, 97]),
  pump_create: Buffer.from([24, 176, 142, 141, 243, 152, 56, 128]),
  pump_amm_buy: Buffer.from([129, 59, 179, 195, 110, 135, 61, 2]),
  pump_amm_sell: Buffer.from([238, 234, 142, 38, 107, 206, 76, 195]),
  withdraw_pump_trader: Buffer.from([188, 237, 135, 114, 143, 224, 45, 178]),
  // pay_token + merchant allowlist. Require an INTENTS upgrade.
  pay_token: Buffer.from([165, 233, 248, 250, 110, 155, 215, 142]),
  init_merchant_registry: Buffer.from([50, 15, 122, 207, 163, 181, 242, 7]),
  add_merchant: Buffer.from([198, 82, 166, 156, 165, 93, 203, 72]),
  remove_merchant: Buffer.from([55, 213, 255, 172, 106, 179, 207, 38]),
  create_subscription: Buffer.from([65, 71, 10, 60, 249, 82, 197, 12]),
  cancel_subscription: Buffer.from([60, 139, 189, 242, 191, 208, 143, 18]),
  pay_subscription: Buffer.from([214, 139, 186, 253, 169, 248, 196, 11]),
  token_buy: Buffer.from([116, 167, 118, 40, 127, 96, 55, 234]),
  token_sell: Buffer.from([154, 76, 173, 221, 122, 208, 158, 103]),
} as const;

/** Official pump.fun program. Only inner program pump_buy/pump_sell/pump_create CPI into. */
export const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

/** Documented Grok token CA (Token-2022). Adapter is mint-agnostic. */
export const GROK_TOKEN_MINT = "2x4iY5AaiGyRfxzHzSY1KzQJ7K82SDqmkMApwbcRpump";

/** Official pump.fun instruction discriminators. */
export const PUMP_DISC = {
  buy_v2: Buffer.from([0xb8, 0x17, 0xee, 0x61, 0x67, 0xc5, 0xd3, 0x3d]),
  sell_v2: Buffer.from([0x5d, 0xf6, 0x82, 0x3c, 0xe7, 0xe9, 0x40, 0xb2]),
  create_v2: Buffer.from([0xd6, 0x90, 0x4c, 0xec, 0x5f, 0x8b, 0x31, 0xb4]),
} as const;

/** wSOL: PumpSwap's quote asset for pump coins. */
export const WSOL_MINT = "So11111111111111111111111111111111111111112";
/** Official Circle USDC. token_buy/token_sell quote mint MAY be this, WSOL, or another mint. */
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
/** Official Jupiter v6. Only inner program token_buy/token_sell CPI into. */
export const JUPITER_V6_PROGRAM_ID = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
export const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
/** pump.fun mayhem program. create_v2 carries its PDAs (state, vaults, params). */
export const MAYHEM_PROGRAM_ID = "MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e";
export const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

/**
 * BondingCurve layout, decoded from a live mainnet account:
 * disc(8) + virtual_token(8) + virtual_sol(8) + real_token(8) + real_sol(8)
 * + total_supply(8) + complete(1) + creator(32).
 *
 * complete === 1 means the coin graduated and must trade on the AMM. The reserve
 * offsets are what marks a position; routing only needs the flag.
 */
export const BC_VIRTUAL_TOKEN_OFFSET = 8;
export const BC_VIRTUAL_SOL_OFFSET = 16;
export const BC_REAL_TOKEN_OFFSET = 24;
export const BC_REAL_SOL_OFFSET = 32;
export const BC_TOTAL_SUPPLY_OFFSET = 40;

export const BONDING_CURVE_DISCRIMINATOR = Buffer.from([23, 183, 248, 55, 96, 216, 172, 96]);
export const BONDING_CURVE_COMPLETE_OFFSET = 48;
export const BONDING_CURVE_CREATOR_OFFSET = 49;

export const PUMP_BUY_V2_ACCOUNT_COUNT = 27;
export const PUMP_SELL_V2_ACCOUNT_COUNT = 26;
export const PUMP_USER_INDEX = 13;
export const PUMP_CREATE_V2_ACCOUNT_COUNT = 16;
export const PUMP_CREATE_V2_ACCOUNT_COUNT_WITH_QUOTE = 19;
export const PUMP_CREATE_MINT_INDEX = 0;
export const PUMP_CREATE_USER_INDEX = 5;
export const PUMP_CREATE_NAME_MAX = 32;
export const PUMP_CREATE_SYMBOL_MAX = 13;
export const PUMP_CREATE_URI_MAX = 200;

/** Official PumpSwap AMM (post-graduation). Only inner program pump_amm_* CPI into. */
export const PUMP_AMM_PROGRAM_ID = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";

/** Official PumpSwap buy_exact_quote_in / sell discs (constructed on-chain). */
export const PUMP_AMM_DISC = {
  buy_exact_quote_in: Buffer.from([198, 46, 21, 82, 180, 217, 232, 112]),
  sell: Buffer.from([51, 230, 133, 164, 1, 127, 131, 173]),
} as const;

/** Official PumpSwap buy remaining: 26 non-cashback, 27 cashback. Sell remaining: 24 (no volume accs). */
export const PUMP_AMM_BUY_ACCOUNT_COUNT = 26;
export const PUMP_AMM_BUY_ACCOUNT_COUNT_CASHBACK = 27;
export const PUMP_AMM_SELL_ACCOUNT_COUNT = 24;
export const PUMP_AMM_USER_INDEX = 1;
export const PUMP_AMM_PROGRAM_INDEX = 16;

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
