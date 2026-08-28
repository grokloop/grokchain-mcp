/**
 * Venue routing: pump.fun bonding curve vs the PumpSwap AMM.
 *
 * A pump.fun coin trades on its bonding curve until the curve completes, then it
 * "graduates" and liquidity moves to PumpSwap. buy_v2 / sell_v2 fail from that
 * moment — which is exactly why the curve-only pump_buy cannot buy $GrokChain:
 * its curve is complete and drained.
 *
 * The bot should not have to track that. It names a coin; this picks the mouth.
 *
 * Read from chain state, never guessed:
 *   curve account missing  -> amm     (migrated, or never a pump coin)
 *   curve.complete === 1   -> amm     (graduated)
 *   curve.complete === 0   -> curve   (still bonding)
 *   unreadable / foreign   -> unknown (callers must NOT default)
 */
import { Connection, PublicKey } from "@solana/web3.js";
import {
  BONDING_CURVE_COMPLETE_OFFSET,
  BONDING_CURVE_CREATOR_OFFSET,
  BONDING_CURVE_DISCRIMINATOR,
  PUMP_PROGRAM_ID,
} from "./constants.js";

export type Venue = "curve" | "amm" | "unknown";

export type VenueInfo = {
  venue: Venue;
  bonding_curve: string;
  complete?: boolean;
  creator?: string;
  reason: string;
};

export function bondingCurvePda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), mint.toBuffer()],
    new PublicKey(PUMP_PROGRAM_ID),
  );
}

/**
 * Decode only what routing needs. Returns undefined when the bytes are not a
 * BondingCurve account rather than guessing at an unverified layout.
 */
export function decodeBondingCurve(
  data: Buffer,
): { complete: boolean; creator: string } | undefined {
  if (data.length < BONDING_CURVE_CREATOR_OFFSET + 32) return undefined;
  if (!data.subarray(0, 8).equals(BONDING_CURVE_DISCRIMINATOR)) return undefined;
  return {
    complete: data[BONDING_CURVE_COMPLETE_OFFSET] === 1,
    creator: new PublicKey(
      data.subarray(BONDING_CURVE_CREATOR_OFFSET, BONDING_CURVE_CREATOR_OFFSET + 32),
    ).toBase58(),
  };
}

export async function resolveVenue(
  connection: Connection,
  mint: PublicKey,
): Promise<VenueInfo> {
  const [curve] = bondingCurvePda(mint);
  let info;
  try {
    info = await connection.getAccountInfo(curve, "confirmed");
  } catch (e) {
    return {
      venue: "unknown",
      bonding_curve: curve.toBase58(),
      reason: `could not read the bonding curve (${
        e instanceof Error ? e.message : String(e)
      }). Refusing to guess a venue; pass venue explicitly if you know it.`,
    };
  }
  if (!info) {
    return {
      venue: "amm",
      bonding_curve: curve.toBase58(),
      reason:
        "no bonding curve account for this mint — post-bond, or never a pump.fun coin. Route to PumpSwap.",
    };
  }
  if (!info.owner.equals(new PublicKey(PUMP_PROGRAM_ID))) {
    return {
      venue: "unknown",
      bonding_curve: curve.toBase58(),
      reason: `derived bonding curve is owned by ${info.owner.toBase58()}, not pump.fun. Refusing to route.`,
    };
  }
  const decoded = decodeBondingCurve(Buffer.from(info.data));
  if (!decoded) {
    return {
      venue: "unknown",
      bonding_curve: curve.toBase58(),
      reason:
        "bonding curve did not match the verified layout. Refusing to guess; pass venue explicitly.",
    };
  }
  return {
    venue: decoded.complete ? "amm" : "curve",
    bonding_curve: curve.toBase58(),
    complete: decoded.complete,
    creator: decoded.creator,
    reason: decoded.complete
      ? "bonding curve is complete: this coin graduated. buy_v2/sell_v2 would fail, so route to PumpSwap."
      : "bonding curve is still active: route to the pump.fun curve.",
  };
}
