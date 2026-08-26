import { HUMAN_MD } from "../constants.js";
import { rejectSecretFields } from "../policy.js";
import { asError } from "../resolve.js";
import type { ToolResult } from "../types.js";

/**
 * Honest STUB. PROGRAMS intent router is not shipped.
 * Do not send a system transfer disguised as pay.
 */
export async function payTool(args: {
  to: string;
  amount_lamports: number | string;
  memo?: string;
}): Promise<ToolResult> {
  try {
    rejectSecretFields(args);
    return {
      status: "stub",
      moved_sol: false,
      to: args.to,
      amount_lamports: String(args.amount_lamports),
      memo: args.memo,
      reason:
        "pay is a stub. PROGRAMS is not shipped. CORE is not a vault. This did not move SOL. When PROGRAMS ships it will CPI check_grant then the pay body in the same transaction. Human pays gas. See HUMAN.md.",
      human: HUMAN_MD,
      notes: [
        "Do not disguise a system transfer as pay.",
        "spend_cap_lamports is a counter, not a vault.",
        "CORE is local-only today.",
      ],
    };
  } catch (e) {
    return asError(e);
  }
}
