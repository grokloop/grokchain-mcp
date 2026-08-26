import { PublicKey } from "@solana/web3.js";
import { SEED_GRANT, SEED_GROK_ACCOUNT } from "./constants.js";

/** GrokAccount PDA = findProgramAddress(["grok-account", root], programId) */
export function grokAccountPda(
  programId: PublicKey,
  root: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_GROK_ACCOUNT, root.toBuffer()],
    programId,
  );
}

/**
 * Grant PDA = findProgramAddress(["grant", grokAccountPda, agent], programId)
 * Seeded with the account PDA, NOT the root.
 */
export function grantPda(
  programId: PublicKey,
  grokAccount: PublicKey,
  agent: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_GRANT, grokAccount.toBuffer(), agent.toBuffer()],
    programId,
  );
}
