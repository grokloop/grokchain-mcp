#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { jsonResult } from "./resolve.js";
import { checkGrantTool } from "./tools/check_grant.js";
import { createAccountTool } from "./tools/create_account.js";
import { issueGrantTool } from "./tools/issue_grant.js";
import { payTool } from "./tools/pay.js";
import { callTool } from "./tools/call.js";
import { deployTool } from "./tools/deploy.js";
import { swapTool } from "./tools/swap.js";
import { pumpBuyTool } from "./tools/pump_buy.js";
import { pumpSellTool } from "./tools/pump_sell.js";
import { pumpCreateTool } from "./tools/pump_create.js";
import { pumpAmmBuyTool } from "./tools/pump_amm_buy.js";
import { pumpAmmDeriveTool } from "./tools/pump_amm_derive.js";
import { pumpAmmSellTool } from "./tools/pump_amm_sell.js";
import { getAccountTool, getGrantTool } from "./tools/reads.js";
import { reviseGrantTool } from "./tools/revise_grant.js";
import { revokeGrantTool } from "./tools/revoke_grant.js";
import { payTokenTool } from "./tools/pay_token.js";
import {
  cancelSubscriptionTool,
  createSubscriptionTool,
  listSubscriptionsTool,
  payRequestTool,
  paySubscriptionTool,
} from "./tools/payments.js";
import { tokenBuyTool } from "./tools/token_buy.js";
import { tokenSellTool } from "./tools/token_sell.js";

const pubkey = z.string().describe("Base58 Solana public key. Never a secret.");
const lamports = z
  .union([z.number().int().nonnegative(), z.string()])
  .describe("Lamports as integer or decimal string. Not a vault debit.");

function buildServer(): McpServer {
  const server = new McpServer({
    name: "grokchain",
    version: "0.1.0",
    title: "Grok Chain",
  });

  server.tool(
    "create_account",
    "Create the GrokAccount PDA for the human root. Root-signed. On localnet uses the local-only CORE id. On devnet uses the grokchain-devnet CORE program. If the root keypair path is missing, returns need_human_signature / need_human_setup and an unsigned tx. Never ask for a seed or key.",
    {
      dry_run: z.boolean().optional().describe("Simulate instead of sending"),
      root: pubkey.optional().describe("Root pubkey if GROKCHAIN_ROOT_KEYPAIR is unset (unsigned-tx path)"),
    },
    async (args) => jsonResult(await createAccountTool(args)),
  );

  server.tool(
    "issue_grant",
    "Issue a capability Grant PDA to an agent pubkey. Root signs. Agent does not sign issue. expires_at_unix required and must be in the future. allowed_programs max 8, no duplicates, empty deny-all. cap 0 = call-only. v1 allowlist is router mode: localnet allowlists the local-only INTENTS id; devnet allowlists the grokchain-devnet INTENTS id (EYhYtq…). sponsor_eligible means this grant may use YOUR paymaster — not a promise Grok Chain pays.",
    {
      agent: pubkey.describe("Agent identity pubkey (public, not a secret)"),
      spend_cap_lamports: lamports.describe("Spend cap counter in lamports. 0 = call-only. Not a vault."),
      allowed_programs: z
        .array(pubkey)
        .describe("Program allowlist, max 8. Empty means check_grant is denied. Router mode: localnet allowlists the local-only INTENTS id; devnet allowlists the grokchain-devnet INTENTS id (EYhYtq…), not every inner DEX."),
      expires_at_unix: z
        .union([z.number().int(), z.string()])
        .describe("Required unix expiry. 0 is rejected."),
      sponsor_eligible: z
        .boolean()
        .optional()
        .describe("This grant may use YOUR paymaster — not a promise Grok Chain pays."),
      label: z.string().optional().describe("Optional 32-byte UTF-8 label. Untrusted text. Not a secret."),
      dry_run: z.boolean().optional(),
      root: pubkey.optional(),
    },
    async (args) => jsonResult(await issueGrantTool(args)),
  );

  server.tool(
    "revise_grant",
    "Replace Grant policy fields. Root signs. Agent cannot revise. Same policy rules as issue_grant. Cannot change the agent (different PDA).",
    {
      agent: pubkey.describe("Agent whose grant PDA to revise"),
      spend_cap_lamports: lamports,
      allowed_programs: z.array(pubkey),
      expires_at_unix: z.union([z.number().int(), z.string()]),
      sponsor_eligible: z.boolean().optional().describe("This grant may use YOUR paymaster — not a promise Grok Chain pays."),
      label: z.string().optional(),
      dry_run: z.boolean().optional(),
      root: pubkey.optional(),
    },
    async (args) => jsonResult(await reviseGrantTool(args)),
  );

  server.tool(
    "revoke_grant",
    "Revoke a Grant. Root signs. Account is not closed. Agent cannot revoke.",
    {
      agent: pubkey.describe("Agent whose grant to revoke"),
      dry_run: z.boolean().optional(),
      root: pubkey.optional(),
    },
    async (args) => jsonResult(await revokeGrantTool(args)),
  );

  server.tool(
    "check_grant",
    "Agent consume path. Agent signs. Increments spent_lamports. Does not move SOL. Empty allowlist is denied. cap 0 requires amount 0. Optional root if not in config. Relayer submits if you also call pay.",
    {
      amount_lamports: lamports.describe("Amount to consume from the cap counter. 0 is valid (call-only)."),
      target_program: pubkey.describe("Target program id (v1 router mode: local-only INTENTS on localnet; grokchain-devnet INTENTS EYhYtq… on devnet)."),
      root: pubkey.optional().describe("Root pubkey if GROKCHAIN_ROOT_KEYPAIR is unset"),
      agent: pubkey.optional().describe("Agent pubkey if GROKCHAIN_AGENT_KEYPAIR is unset (unsigned-tx path)"),
      dry_run: z.boolean().optional(),
    },
    async (args) => jsonResult(await checkGrantTool(args)),
  );

  server.tool(
    "pay",
    "Implemented INTENTS pay. On localnet uses the local-only intents id. On devnet builds against the grokchain-devnet INTENTS program. Agent signs. Relayer is the outer fee payer. Bot never holds SOL. Human-funded SpendVault is the SOL source. Optional sponsor reimburses the relayer from YOUR paymaster. Lands only if the human has rooted the account, issued a grant allowlisting the INTENTS id, funded SpendVault + Paymaster, and set RELAYER_KEYPAIR. Otherwise need_human_signature / need_human_setup.",
    {
      to: pubkey.describe("Recipient pubkey"),
      amount_lamports: z
        .union([z.number().int().positive(), z.string()])
        .describe("Lamports to pay from SpendVault. Must be > 0."),
      sponsor_lamports: z
        .union([z.number().int().nonnegative(), z.string()])
        .optional()
        .describe("Optional reimbursement to the relayer from YOUR paymaster. 0 = none. Max 10000000."),
      root: pubkey.optional().describe("Root pubkey if GROKCHAIN_ROOT_KEYPAIR is unset"),
      dry_run: z.boolean().optional(),
    },
    async (args) => jsonResult(await payTool(args)),
  );

  server.tool(
    "swap",
    "Implemented INTENTS swap. Grant-gated SOL send with min_out. Not a DEX. Not Jupiter. Not SPL. Agent signs. Relayer fee-pays. Bot never holds SOL. Lands on localnet only if the local validator is running this binary. This source was not upgraded on grokchain-devnet — do not claim the new ix is live on public Solana.",
    {
      to: pubkey.describe("out_destination pubkey (SOL credit)"),
      amount_in_lamports: z
        .union([z.number().int().positive(), z.string()])
        .describe("Lamports to send from SpendVault. Must be > 0."),
      min_out_lamports: z
        .union([z.number().int().nonnegative(), z.string()])
        .optional()
        .describe("Require amount_in >= min_out. Honest min check, not an AMM quote. Defaults to amount_in."),
      sponsor_lamports: z
        .union([z.number().int().nonnegative(), z.string()])
        .optional()
        .describe("Optional reimbursement to the relayer from YOUR paymaster. 0 = none. Max 10000000."),
      root: pubkey.optional(),
      dry_run: z.boolean().optional(),
    },
    async (args) => jsonResult(await swapTool(args)),
  );

  server.tool(
    "pump_buy",
    "Tight INTENTS pump.fun buy_v2 adapter. Grant-gated. Live on MAINNET INTENTS 3HCErAF. Pump-trader PDA is pump user (invoke_signed trader seeds). remaining_accounts must be the official 27-account buy_v2 list with user=pump-trader (not SpendVault). Agent signs. Relayer fee-pays. Bot never holds SOL. Not a general router. Not Jupiter. 27 remaining accounts need a v0 tx + address lookup table on public RPC. Complete bonding curves cannot buy_v2.",
    {
      mint: pubkey.optional().describe("Base mint. Defaults to the documented Grok token CA (Token-2022)."),
      amount: z
        .union([z.number().int().positive(), z.string()])
        .describe("Base tokens to buy (raw units). Must be > 0."),
      max_sol_cost: z
        .union([z.number().int().positive(), z.string()])
        .describe("Max SOL (lamports) the vault will spend. This is the grant budget."),
      remaining_accounts: z
        .array(z.union([pubkey, z.object({ pubkey, isSigner: z.boolean().optional(), isWritable: z.boolean().optional() })]))
        .describe("Official buy_v2 account list (27). user slot (13) must be the pump-trader PDA, not SpendVault. Last account must be pump.fun."),
      venue: z.enum(["auto", "curve", "amm"]).optional().describe('auto (default) probes the curve complete flag and returns CoinGraduated naming pump_amm_buy if graduated. "curve" forces the old path. "amm" rejects.'),
      sponsor_lamports: z
        .union([z.number().int().nonnegative(), z.string()])
        .optional(),
      root: pubkey.optional(),
      dry_run: z.boolean().optional(),
    },
    async (args) => jsonResult(await pumpBuyTool(args)),
  );

  server.tool(
    "pump_sell",
    "Tight INTENTS pump.fun sell_v2 adapter. Live on MAINNET INTENTS 3HCErAF. Grant amount is 0 (tokens out, not SOL). Pump-trader PDA is pump user. remaining_accounts must be the official 26-account sell_v2 list with user=pump-trader. Not a general router. Limit orders are not implemented.",
    {
      mint: pubkey.optional().describe("Base mint. Defaults to the documented Grok token CA (Token-2022)."),
      amount: z
        .union([z.number().int().positive(), z.string()])
        .describe("Base tokens to sell (raw units). Must be > 0."),
      min_sol_output: z
        .union([z.number().int().nonnegative(), z.string()])
        .optional()
        .describe("Minimum quote (lamports) after fees. 0 = accept any."),
      remaining_accounts: z
        .array(z.union([pubkey, z.object({ pubkey, isSigner: z.boolean().optional(), isWritable: z.boolean().optional() })]))
        .describe("Official sell_v2 account list (26). user slot (13) must be the pump-trader PDA, not SpendVault. Last account must be pump.fun."),
      venue: z.enum(["auto", "curve", "amm"]).optional().describe('auto (default) probes the curve complete flag and returns CoinGraduated naming pump_amm_sell if graduated. "curve" forces the old path. "amm" rejects.'),
      sponsor_lamports: z
        .union([z.number().int().nonnegative(), z.string()])
        .optional(),
      root: pubkey.optional(),
      dry_run: z.boolean().optional(),
    },
    async (args) => jsonResult(await pumpSellTool(args)),
  );


  server.tool(
    "pump_create",
    "Tight INTENTS pump.fun create_v2 adapter. Live on MAINNET INTENTS 3HCErAF. Grant-gated coin launch. Mint is a NEW Token-2022 keypair signed by the client (relayer/root) — this MCP never accepts or prints mint secret/keypair JSON. Pump-trader PDA is pump user (remaining[5]). SpendVault is never user. Creator on-chain is grok_account.root. remaining_accounts must be the official 16-account create_v2 list (or 19 with quote remaining). Agent signs. Relayer fee-pays. Bot never holds SOL. Not a general router.",
    {
      mint: pubkey.describe("New Token-2022 mint pubkey. Client signs this keypair on the outer tx. Never a secret."),
      name: z.string().describe("Coin name. Maximum 32 characters."),
      symbol: z.string().describe("Coin symbol. Maximum 13 characters."),
      uri: z.string().describe("Metadata URI. Maximum 200 characters."),
      max_sol_cost: z
        .union([z.number().int().positive(), z.string()])
        .describe("Max SOL (lamports) the vault will spend for rent + create fees. This is the grant budget."),
      remaining_accounts: z
        .array(z.union([pubkey, z.object({ pubkey, isSigner: z.boolean().optional(), isWritable: z.boolean().optional() })]))
        .describe("Official create_v2 account list (16, or 19 with quote remaining). mint slot (0) must be a signer. user slot (5) must be the pump-trader PDA, not SpendVault. remaining[15] must be pump.fun."),
      is_mayhem_mode: z.boolean().optional().describe("Official create_v2 is_mayhem_mode. Default false."),
      is_cashback_enabled: z.boolean().optional().describe("Official create_v2 OptionBool cashback flag. Default false."),
      sponsor_lamports: z
        .union([z.number().int().nonnegative(), z.string()])
        .optional(),
      root: pubkey.optional(),
      dry_run: z.boolean().optional(),
    },
    async (args) => jsonResult(await pumpCreateTool(args)),
  );

  server.tool(
    "pump_amm_derive",
    "Read-only. Resolve a coin's PumpSwap pool and build the ordered account list this vault's pump-trader would use. pump_amm_buy/sell call the same builder internally when remaining_accounts is omitted, so you rarely need this — use it to inspect what would be submitted. Signs nothing.",
    {
      mint: pubkey.optional().describe("Base mint. Defaults to the documented Grok token CA."),
      kind: z.enum(["buy", "sell"]).optional().describe("Which list to build. Default buy."),
      root: pubkey.optional(),
    },
    async (args) => jsonResult(await pumpAmmDeriveTool(args)),
  );

  server.tool(
    "pump_amm_buy",
    "Tight INTENTS PumpSwap buy_exact_quote_in adapter. Grant-gated. Live on MAINNET INTENTS 3HCErAF. Pump-trader PDA is remaining[1] user. SpendVault is never user. remaining_accounts is OPTIONAL — omit it and the list is built from chain state for this vault's pump-trader. If supplied it must be the official PumpSwap buy list 26 (non-cashback) or 27 (cashback). Do not use sell's 24. Agent signs. Relayer fee-pays. Agent stays 0 SOL. Not a general router. Not Jupiter. Curve pump_buy cannot hit a graduated mint.",
    {
      mint: pubkey.optional().describe("Base mint. Defaults to the documented Grok token CA (Token-2022)."),
      spendable_quote_in: z
        .union([z.number().int().positive(), z.string()])
        .describe("Quote (lamports) wrapped onto trader WSOL and spent. Must be > 0."),
      min_base_amount_out: z
        .union([z.number().int().nonnegative(), z.string()])
        .optional()
        .describe("Minimum base tokens out. 0 = accept any."),
      max_sol_cost: z
        .union([z.number().int().positive(), z.string()])
        .optional()
        .describe("Grant SOL budget. Must be >= spendable_quote_in. Defaults to spendable_quote_in."),
      remaining_accounts: z
        .array(z.union([pubkey, z.object({ pubkey, isSigner: z.boolean().optional(), isWritable: z.boolean().optional() })]))
        .optional()
        .describe("OPTIONAL. Official PumpSwap buy list (26 or 27). Omit to build from chain for this vault's pump-trader. If supplied, user slot (1) must be the pump-trader PDA, not SpendVault. remaining[16] must be PumpSwap."),
      sponsor_lamports: z
        .union([z.number().int().nonnegative(), z.string()])
        .optional(),
      root: pubkey.optional(),
      dry_run: z.boolean().optional(),
    },
    async (args) => jsonResult(await pumpAmmBuyTool(args)),
  );

  server.tool(
    "pump_amm_sell",
    "Tight INTENTS PumpSwap sell adapter. Live on MAINNET INTENTS 3HCErAF. Grant amount is 0 (tokens out, not SOL). Pump-trader PDA is remaining[1] user. remaining_accounts is OPTIONAL — omit it and the list is built from chain state for this vault's pump-trader. If supplied it must be the official PumpSwap sell list 24 (no volume accs). Do not pass buy's 26/27. Quote unwrap stays on the trader, not the vault. Agent stays 0 SOL. Not a general router. Not Jupiter.",
    {
      mint: pubkey.optional().describe("Base mint. Defaults to the documented Grok token CA (Token-2022)."),
      base_amount_in: z
        .union([z.number().int().positive(), z.string()])
        .describe("Base tokens to sell (raw units). Must be > 0."),
      min_quote_amount_out: z
        .union([z.number().int().nonnegative(), z.string()])
        .optional()
        .describe("Minimum quote (lamports) after fees. 0 = accept any."),
      remaining_accounts: z
        .array(z.union([pubkey, z.object({ pubkey, isSigner: z.boolean().optional(), isWritable: z.boolean().optional() })]))
        .optional()
        .describe("OPTIONAL. Official PumpSwap sell list (24). Omit to build from chain for this vault's pump-trader. If supplied, user slot (1) must be the pump-trader PDA, not SpendVault. remaining[16] must be PumpSwap. Do not pass buy's 26."),
      sponsor_lamports: z
        .union([z.number().int().nonnegative(), z.string()])
        .optional(),
      root: pubkey.optional(),
      dry_run: z.boolean().optional(),
    },
    async (args) => jsonResult(await pumpAmmSellTool(args)),
  );

  server.tool(
    "token_buy",
    "Tight INTENTS Jupiter v6 token_buy. Grant-gated. Fetches Jupiter quote + swap-instructions (lite-api.jup.ag/swap/v1, fallback quote-api.jup.ag/v6). remaining from that response. User/trader = pump-trader PDA. wrapAndUnwrapSol as needed; adapter wraps native SOL, does not unwrap. Quote mint may be WSOL, official USDC, or another SPL/Token-2022 mint. Paying with SOL/WSOL: check_grant(sol_in). Paying with USDC/other already on the trader: check_grant(0). Do not debit SpendVault for tokens already on the trader. Old swap is still a SOL send, not Jupiter. Agent signs. Relayer fee-pays. Agent stays 0 SOL. Not PumpPortal.",
    {
      input_mint: pubkey.optional().describe("Input mint. Defaults to WSOL (native SOL / wrapped SOL)."),
      output_mint: pubkey.optional().describe("Output mint. Defaults to official USDC EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v."),
      in_amount: z.union([z.number().int().positive(), z.string()]).describe("Exact in amount (raw units / lamports). Must match Jupiter inAmount."),
      min_out: z.union([z.number().int().nonnegative(), z.string()]).optional().describe("Minimum out. Defaults to Jupiter otherAmountThreshold / outAmount."),
      slippage_bps: z.union([z.number().int().nonnegative(), z.string()]).optional().describe("Jupiter slippage bps. Default 50."),
      wrap_sol: z.boolean().optional().describe("Wrap native SOL onto trader WSOL ATA. Default true when input is WSOL."),
      remaining_accounts: z
        .array(z.union([pubkey, z.object({ pubkey, isSigner: z.boolean().optional(), isWritable: z.boolean().optional() })]))
        .optional()
        .describe("OPTIONAL. Jupiter swapInstruction accounts. Omit to fetch swap-instructions. Must include pump-trader. Must not include spend_vault."),
      jupiter_data: z.string().optional().describe("OPTIONAL. Base64 Jupiter swapInstruction.data. Omit to fetch. Never empty on chain."),
      sponsor_lamports: z.union([z.number().int().nonnegative(), z.string()]).optional(),
      root: pubkey.optional(),
      dry_run: z.boolean().optional(),
    },
    async (args) => jsonResult(await tokenBuyTool(args)),
  );

  server.tool(
    "token_sell",
    "Tight INTENTS Jupiter v6 token_sell. Grant-gated. Fetches Jupiter quote + swap-instructions. remaining from that response. User/trader = pump-trader PDA. Selling tokens for quote: check_grant(0). Selling WSOL/SOL for USDC: check_grant the SOL spent. Do not unwrap or sweep. Old swap is still a SOL send. Agent signs. Relayer fee-pays. Agent stays 0 SOL. Not PumpPortal.",
    {
      input_mint: pubkey.optional().describe("Input mint (token being sold). Defaults to official USDC."),
      output_mint: pubkey.optional().describe("Output mint. Defaults to WSOL."),
      in_amount: z.union([z.number().int().positive(), z.string()]).describe("Exact in amount (raw units). Must match Jupiter inAmount."),
      min_out: z.union([z.number().int().nonnegative(), z.string()]).optional(),
      slippage_bps: z.union([z.number().int().nonnegative(), z.string()]).optional(),
      wrap_sol: z.boolean().optional().describe("Wrap native SOL when selling SOL. Default true when input is WSOL."),
      remaining_accounts: z
        .array(z.union([pubkey, z.object({ pubkey, isSigner: z.boolean().optional(), isWritable: z.boolean().optional() })]))
        .optional(),
      jupiter_data: z.string().optional(),
      sponsor_lamports: z.union([z.number().int().nonnegative(), z.string()]).optional(),
      root: pubkey.optional(),
      dry_run: z.boolean().optional(),
    },
    async (args) => jsonResult(await tokenSellTool(args)),
  );

  server.tool(
    "deploy",
    "Implemented INTENTS deploy request. check_grant(0) + DeployRequested event. NOT a BPF deploy. No ELF uploaded. Agent signs. Relayer fee-pays. Bot never holds SOL. Not upgraded on grokchain-devnet in this change.",
    {
      program_id: pubkey.describe("Requested program id recorded in DeployRequested. Not deployed."),
      sponsor_lamports: z
        .union([z.number().int().nonnegative(), z.string()])
        .optional(),
      root: pubkey.optional(),
      dry_run: z.boolean().optional(),
    },
    async (args) => jsonResult(await deployTool(args)),
  );

  server.tool(
    "call",
    "Implemented INTENTS call. Grant-gated router. amount 0 = policy ping (no vault debit). amount > 0 debits SpendVault. remaining_accounts empty = grant-checked only. CORE allowlists INTENTS, not the inner target. Not upgraded on grokchain-devnet in this change.",
    {
      target_program: pubkey.describe("Inner program remaining_accounts are invoked into. CORE still allowlists INTENTS."),
      amount_lamports: lamports.optional().describe("0 = policy ping. >0 debits SpendVault to `to`."),
      to: pubkey.optional().describe("Recipient when amount_lamports > 0. Defaults to target_program."),
      sponsor_lamports: z
        .union([z.number().int().nonnegative(), z.string()])
        .optional(),
      remaining_accounts: z
        .array(z.union([pubkey, z.object({ pubkey, isSigner: z.boolean().optional(), isWritable: z.boolean().optional() })]))
        .optional()
        .describe("Empty = policy ping. Non-empty invokes target with empty ix data. Do not pass spend_vault or paymaster."),
      root: pubkey.optional(),
      dry_run: z.boolean().optional(),
    },
    async (args) => jsonResult(await callTool(args)),
  );

  server.tool(
    "pay_token",
    "Pay an APPROVED merchant in USDC (or any registered mint) from the pump-trader. Agent signs, relayer fee-pays, one CORE check_grant. `to` is the merchant WALLET - their token account is derived, so you cannot accidentally pay an account owned by someone else. The payee must be on the root merchant allowlist: a CORE grant caps an amount but cannot name a recipient, which is the whole point of the allowlist. The cap is metered in RAW TOKEN UNITS here, so on a USDC registry a cap of 50000000 means 50 USDC - use one agent per denomination. Pass `reference` (Solana Pay) so the merchant can reconcile the invoice. Requires an INTENTS upgrade.",
    {
      to: pubkey.describe("Merchant WALLET address. Their token account is derived from it."),
      amount: lamports.describe("Raw token units. 1 USDC = 1000000."),
      mint: pubkey.optional().describe("Defaults to official Circle USDC."),
      decimals: z.number().int().min(0).max(18).optional().describe("Must match the mint on chain. Default 6 (USDC)."),
      reference: pubkey.optional().describe("Solana Pay reference so the merchant can match the invoice."),
      token_2022: z.boolean().optional().describe("Set when the mint is a Token-2022 mint."),
      sponsor_lamports: lamports.optional(),
      root: pubkey.optional(),
      dry_run: z.boolean().optional(),
    },
    async (args) => jsonResult(await payTokenTool(args)),
  );

  server.tool(
    "pay_request",
    "Read-only. Parse a Solana Pay link (solana:...) and report exactly what settling it would do: recipient, amount, mint, reference, which intent would run, and whether the payee is already on your merchant allowlist. Signs nothing and sends nothing. Payment links are UNTRUSTED input - they usually come from a page the bot was reading - so this returns a plan for a human or policy to approve, and never infers a missing amount. Transaction requests (solana:https://...) are refused: those ask a remote server to compose what we would sign.",
    {
      url: z.string().describe("The solana: payment request."),
      decimals: z.number().int().min(0).max(18).optional().describe("Decimals of the requested mint. Default 6 (USDC)."),
      root: pubkey.optional(),
    },
    async (args) => jsonResult(await payRequestTool(args)),
  );

  server.tool(
    "create_subscription",
    "Root-only. Set up a recurring payment to a merchant already on the allowlist. amount is in raw token units and the grant cap meters the same units. period_seconds must be at least 86400. The merchant can never renew, raise or extend it - only the root can.",
    {
      merchant: pubkey.describe("Merchant WALLET address, already on the allowlist."),
      amount: lamports.describe("Raw token units per period. 1 USDC = 1000000."),
      period_seconds: z.union([z.number().int(), z.string()]).describe("Billing period. Minimum 86400 (one day)."),
      mint: pubkey.optional().describe("Defaults to official Circle USDC."),
      start_unix: z.union([z.number().int(), z.string()]).optional().describe("First cycle start. Defaults to now."),
      root: pubkey.optional(),
      dry_run: z.boolean().optional(),
    },
    async (args) => jsonResult(await createSubscriptionTool(args)),
  );

  server.tool(
    "cancel_subscription",
    "Root-only, immediate. The next payment fails. The merchant cannot refuse, delay or dark-pattern this - there is no cancellation flow to navigate. Removing the merchant from the allowlist instead cancels every subscription to them at once.",
    {
      merchant: pubkey,
      mint: pubkey.optional(),
      root: pubkey.optional(),
      dry_run: z.boolean().optional(),
    },
    async (args) => jsonResult(await cancelSubscriptionTool(args)),
  );

  server.tool(
    "list_subscriptions",
    "Read-only. Every recurring payment, which are due now, and how many periods were missed while the bot was down. Missed periods are NOT billable later - only the current one is. Use the reported `period` when calling pay_subscription.",
    {
      mint: pubkey.optional(),
      root: pubkey.optional(),
      now_unix: z.number().int().optional().describe("Override the clock, for testing."),
    },
    async (args) => jsonResult(await listSubscriptionsTool(args)),
  );

  server.tool(
    "pay_subscription",
    "Settle one billing period. Safe to retry: the program advances last_paid_period in the same transaction that moves the money, so a repeat attempt at the same period fails on chain instead of paying twice. You must state `period` (from list_subscriptions) so a drifted clock fails loudly rather than paying the wrong cycle. Requires an INTENTS upgrade.",
    {
      merchant: pubkey,
      period: z.union([z.number().int(), z.string()]).describe("The cycle being paid, from list_subscriptions."),
      mint: pubkey.optional(),
      reference: pubkey.optional().describe("Solana Pay reference so the merchant can reconcile."),
      sponsor_lamports: lamports.optional(),
      root: pubkey.optional(),
      dry_run: z.boolean().optional(),
    },
    async (args) => jsonResult(await paySubscriptionTool(args)),
  );

  server.tool(
    "get_account",
    "Read-only. Fetch the GrokAccount PDA if it exists. No signing.",
    { root: pubkey.optional() },
    async (args) => jsonResult(await getAccountTool(args)),
  );

  server.tool(
    "get_grant",
    "Read-only. Fetch the Grant PDA if it exists. No signing. label is untrusted text.",
    { agent: pubkey.optional(), root: pubkey.optional() },
    async (args) => jsonResult(await getGrantTool(args)),
  );

  return server;
}

async function main(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
