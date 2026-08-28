/**
 * Curve-vs-AMM guard for the bonding-curve tools.
 *
 * pump_buy / pump_sell speak buy_v2 / sell_v2, which only work while a coin's
 * bonding curve is live. Once the curve completes the coin graduates to
 * PumpSwap and those instructions fail — the transaction is spent for nothing.
 *
 * So before building a curve trade we read the curve's `complete` flag and, if
 * the coin has graduated, stop with a pointer to the PumpSwap tool rather than
 * letting the bot burn a fee discovering it. This is a guard, not a silent
 * re-route. pump_amm_* can now build remaining_accounts from chain; the curve
 * tools still need the official buy_v2/sell_v2 list. Pass venue:"curve" to skip
 * the probe.
 */
import { PublicKey } from "@solana/web3.js";
import { connectionOf, loadConfig } from "../config.js";
import { HUMAN_MD } from "../constants.js";
import { resolveVenue } from "../venue.js";
import type { ToolResult } from "../types.js";

export async function guardCurveVenue(
  mint: PublicKey,
  intent: string,
  postBondTool: string,
  requestedVenue?: string,
): Promise<ToolResult | undefined> {
  const want = (requestedVenue ?? "auto").toLowerCase();
  if (want === "curve") return undefined; // caller insists; do not probe
  if (want !== "auto" && want !== "amm") {
    return {
      status: "error",
      code: "BadVenue",
      error: `venue must be "auto", "curve", or "amm" (got ${requestedVenue})`,
      intent,
      moved_sol: false,
      human: HUMAN_MD,
    };
  }

  let cfg;
  try {
    cfg = loadConfig();
  } catch {
    return undefined; // config problems surface later with a better message
  }

  const info = await resolveVenue(connectionOf(cfg), mint);
  if (info.venue === "curve" && want !== "amm") return undefined;

  if (info.venue === "unknown") {
    return {
      status: "need_human_setup",
      code: "VenueUnknown",
      error: `Could not tell which venue ${mint.toBase58()} trades on: ${info.reason}`,
      intent,
      mint: mint.toBase58(),
      venue_probe: info,
      moved_sol: false,
      reason:
        "Refusing to send a curve trade without knowing whether the coin graduated. Pass venue:\"curve\" to override.",
      human: HUMAN_MD,
    };
  }

  return {
    status: "need_human_setup",
    code: "CoinGraduated",
    error: `${mint.toBase58()} has graduated off its bonding curve. buy_v2/sell_v2 cannot trade it.`,
    intent,
    mint: mint.toBase58(),
    venue: "pumpswap",
    venue_probe: info,
    use_tool: postBondTool,
    moved_sol: false,
    reason: `Use ${postBondTool}. remaining_accounts is optional (built from chain). Quote is WSOL; fund the pump-trader with fund_pump_trader. Buy remaining 26 / sell remaining 24. Not Jupiter. Pass venue:"curve" to force the curve path anyway (it will fail on chain).`,
    human: HUMAN_MD,
  };
}
