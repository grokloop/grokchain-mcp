import { PublicKey } from "@solana/web3.js";
import { loadConfig, type AppConfig } from "./config.js";
import { HUMAN_MD } from "./constants.js";
import { loadKeyFromEnvPath, parsePubkey, type LoadedKey } from "./keys.js";
import { PolicyError, rejectSecretFields } from "./policy.js";
import { needHumanSetup } from "./send.js";
import type { ToolResult } from "./types.js";

export type Ctx = {
  cfg: AppConfig;
  root: LoadedKey;
  agent: LoadedKey;
};

export function openCtx(args?: Record<string, unknown>): Ctx {
  rejectSecretFields(args);
  const cfg = loadConfig();
  return {
    cfg,
    root: loadKeyFromEnvPath("GROKCHAIN_ROOT_KEYPAIR"),
    agent: loadKeyFromEnvPath("GROKCHAIN_AGENT_KEYPAIR"),
  };
}

export function resolveRootPubkey(ctx: Ctx, explicit?: string): PublicKey | undefined {
  if (explicit) return parsePubkey(explicit, "root");
  return ctx.root.pubkey;
}

export function resolveAgentPubkey(ctx: Ctx, explicit?: string): PublicKey | undefined {
  if (explicit) return parsePubkey(explicit, "agent");
  return ctx.agent.pubkey;
}

export function missingRoot(ctx: Ctx, extra: Record<string, unknown> = {}): ToolResult {
  return needHumanSetup(
    ctx.cfg,
    ctx.root.reason ??
      `Root pubkey unknown. Set GROKCHAIN_ROOT_KEYPAIR (path) or pass root as a public key. ${HUMAN_MD}.`,
    extra,
  );
}

export function asError(e: unknown, extra: Record<string, unknown> = {}): ToolResult {
  if (e instanceof PolicyError) {
    return {
      status: "error",
      error: e.message,
      code: e.code,
      human: HUMAN_MD,
      ...extra,
    };
  }
  return {
    status: "error",
    error: e instanceof Error ? e.message : String(e),
    human: HUMAN_MD,
    ...extra,
  };
}

export function jsonResult(result: ToolResult): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
