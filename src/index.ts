#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { jsonResult } from "./resolve.js";
import { checkGrantTool } from "./tools/check_grant.js";
import { createAccountTool } from "./tools/create_account.js";
import { issueGrantTool } from "./tools/issue_grant.js";
import { payTool } from "./tools/pay.js";
import { callTool, deployTool, swapTool } from "./tools/stubs.js";
import { getAccountTool, getGrantTool } from "./tools/reads.js";
import { reviseGrantTool } from "./tools/revise_grant.js";
import { revokeGrantTool } from "./tools/revoke_grant.js";

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
    "Create the GrokAccount PDA for the human root. Root-signed. CORE is local-only today — not a live deployment. If the root keypair path is missing, returns need_human_signature / need_human_setup and an unsigned tx. Never ask for a seed or key.",
    {
      dry_run: z.boolean().optional().describe("Simulate instead of sending"),
      root: pubkey.optional().describe("Root pubkey if GROKCHAIN_ROOT_KEYPAIR is unset (unsigned-tx path)"),
    },
    async (args) => jsonResult(await createAccountTool(args)),
  );

  server.tool(
    "issue_grant",
    "Issue a capability Grant PDA to an agent pubkey. Root signs. Agent does not sign issue. expires_at_unix required and must be in the future. allowed_programs max 8, no duplicates, empty deny-all. cap 0 = call-only. v1 allowlist is router mode (allowlist the local-only INTENTS program id). sponsor_eligible means this grant may use YOUR paymaster — not a promise Grok Chain pays.",
    {
      agent: pubkey.describe("Agent identity pubkey (public, not a secret)"),
      spend_cap_lamports: lamports.describe("Spend cap counter in lamports. 0 = call-only. Not a vault."),
      allowed_programs: z
        .array(pubkey)
        .describe("Program allowlist, max 8. Empty means check_grant is denied. Router mode: allowlist the local-only INTENTS program id, not every inner DEX."),
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
      target_program: pubkey.describe("Target program id (v1 router mode: the local-only INTENTS program id)."),
      root: pubkey.optional().describe("Root pubkey if GROKCHAIN_ROOT_KEYPAIR is unset"),
      agent: pubkey.optional().describe("Agent pubkey if GROKCHAIN_AGENT_KEYPAIR is unset (unsigned-tx path)"),
      dry_run: z.boolean().optional(),
    },
    async (args) => jsonResult(await checkGrantTool(args)),
  );

  server.tool(
    "pay",
    "Implemented INTENTS pay (local-only intents id). Agent signs. Relayer is the outer fee payer. Bot never holds SOL. Human-funded SpendVault is the SOL source. Optional sponsor reimburses the relayer from YOUR paymaster. Lands only if both local CORE and INTENTS programs are running.",
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
    "Honest STUB. INTENTS swap returns IntentStub. Not implemented. Does not call a DEX.",
    {},
    async (args) => jsonResult(await swapTool(args)),
  );

  server.tool(
    "deploy",
    "Honest STUB. INTENTS deploy returns IntentStub. Not implemented.",
    {},
    async (args) => jsonResult(await deployTool(args)),
  );

  server.tool(
    "call",
    "Honest STUB. INTENTS call returns IntentStub. Not implemented.",
    {},
    async (args) => jsonResult(await callTool(args)),
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
