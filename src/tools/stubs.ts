import { HUMAN_MD } from "../constants.js";
import { rejectSecretFields } from "../policy.js";
import { asError } from "../resolve.js";
import type { ToolResult } from "../types.js";

function stub(intent: "swap" | "deploy" | "call", args: Record<string, unknown>): ToolResult {
  rejectSecretFields(args);
  return {
    status: "stub",
    intent,
    error: "IntentStub",
    moved_sol: false,
    reason:
      `${intent} is an honest MCP stub. The INTENTS program returns IntentStub for this instruction. This did not move SOL and did not call a DEX or deploy anything. pay is implemented.`,
    human: HUMAN_MD,
    notes: [
      "swap / deploy / call are stubs (IntentStub).",
      "pay is the implemented INTENTS client (local-only intents id).",
      "Bot never holds SOL. Relayer is the fee payer.",
    ],
  };
}

export async function swapTool(args: Record<string, unknown> = {}): Promise<ToolResult> {
  try {
    return stub("swap", args);
  } catch (e) {
    return asError(e);
  }
}

export async function deployTool(args: Record<string, unknown> = {}): Promise<ToolResult> {
  try {
    return stub("deploy", args);
  } catch (e) {
    return asError(e);
  }
}

export async function callTool(args: Record<string, unknown> = {}): Promise<ToolResult> {
  try {
    return stub("call", args);
  } catch (e) {
    return asError(e);
  }
}
