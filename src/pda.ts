import { PublicKey } from "@solana/web3.js";
import { SEED_GRANT, SEED_GROK_ACCOUNT, SEED_PAYMASTER, SEED_PUMP_TRADER, SEED_SPEND_VAULT } from "./constants.js";

/** GrokAccount PDA = findProgramAddress(["grok-account", root], CORE programId) */
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
 * Grant PDA = findProgramAddress(["grant", grokAccountPda, agent], CORE programId)
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

/** SpendVault PDA = findProgramAddress(["spend-vault", grokAccount], INTENTS programId) */
export function spendVaultPda(
  intentsProgramId: PublicKey,
  grokAccount: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_SPEND_VAULT, grokAccount.toBuffer()],
    intentsProgramId,
  );
}

/** Paymaster PDA = findProgramAddress(["paymaster", grokAccount], INTENTS programId) */
export function paymasterPda(
  intentsProgramId: PublicKey,
  grokAccount: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_PAYMASTER, grokAccount.toBuffer()],
    intentsProgramId,
  );
}

/** PumpTrader PDA = findProgramAddress(["pump-trader", grokAccount], INTENTS programId) */
export function pumpTraderPda(
  intentsProgramId: PublicKey,
  grokAccount: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_PUMP_TRADER, grokAccount.toBuffer()],
    intentsProgramId,
  );
}
