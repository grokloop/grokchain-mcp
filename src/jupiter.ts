/**
 * Jupiter v6 quote + swap-instructions. No keys. Not PumpPortal.
 * Primary: lite-api.jup.ag/swap/v1. Fallback: quote-api.jup.ag/v6.
 */
import { PublicKey, type AccountMeta } from "@solana/web3.js";
import { JUPITER_V6_PROGRAM_ID, WSOL_MINT } from "./constants.js";

export const JUPITER_LITE_QUOTE = "https://lite-api.jup.ag/swap/v1/quote";
export const JUPITER_LITE_SWAP_IX = "https://lite-api.jup.ag/swap/v1/swap-instructions";
export const JUPITER_V6_QUOTE = "https://quote-api.jup.ag/v6/quote";
export const JUPITER_V6_SWAP_IX = "https://quote-api.jup.ag/v6/swap-instructions";

export type JupiterQuote = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold?: string;
  slippageBps?: number;
  routePlan?: unknown[];
  [k: string]: unknown;
};

export type JupiterSwapIx = {
  programId: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: string;
};

export type JupiterSwapInstructions = {
  swapInstruction: JupiterSwapIx;
  setupInstructions?: JupiterSwapIx[];
  cleanupInstruction?: JupiterSwapIx | null;
  addressLookupTableAddresses?: string[];
  computeBudgetInstructions?: JupiterSwapIx[];
};

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`Jupiter GET ${url.split("?")[0]} failed: ${res.status}`);
  }
  return res.json();
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Jupiter POST ${url} failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function fetchJupiterQuote(opts: {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;
}): Promise<{ quote: JupiterQuote; endpoint: string }> {
  const q =
    `inputMint=${encodeURIComponent(opts.inputMint)}` +
    `&outputMint=${encodeURIComponent(opts.outputMint)}` +
    `&amount=${encodeURIComponent(opts.amount)}` +
    `&slippageBps=${opts.slippageBps}`;
  try {
    const quote = (await getJson(`${JUPITER_LITE_QUOTE}?${q}`)) as JupiterQuote;
    if (!quote?.inAmount) throw new Error("lite quote missing inAmount");
    return { quote, endpoint: JUPITER_LITE_QUOTE };
  } catch (e) {
    const quote = (await getJson(`${JUPITER_V6_QUOTE}?${q}`)) as JupiterQuote;
    if (!quote?.inAmount) throw new Error(`v6 quote failed after lite: ${e}`);
    return { quote, endpoint: JUPITER_V6_QUOTE };
  }
}

export async function fetchJupiterSwapInstructions(opts: {
  quote: JupiterQuote;
  userPublicKey: string;
  wrapAndUnwrapSol: boolean;
}): Promise<{ ixs: JupiterSwapInstructions; endpoint: string }> {
  const body = {
    quoteResponse: opts.quote,
    userPublicKey: opts.userPublicKey,
    wrapAndUnwrapSol: opts.wrapAndUnwrapSol,
    dynamicComputeUnitLimit: true,
  };
  try {
    const ixs = (await postJson(JUPITER_LITE_SWAP_IX, body)) as JupiterSwapInstructions;
    if (!ixs?.swapInstruction?.data) throw new Error("lite swap-instructions missing swapInstruction");
    return { ixs, endpoint: JUPITER_LITE_SWAP_IX };
  } catch (e) {
    const ixs = (await postJson(JUPITER_V6_SWAP_IX, body)) as JupiterSwapInstructions;
    if (!ixs?.swapInstruction?.data) throw new Error(`v6 swap-instructions failed after lite: ${e}`);
    return { ixs, endpoint: JUPITER_V6_SWAP_IX };
  }
}

export function remainingFromSwapInstruction(ix: JupiterSwapIx): {
  remaining: AccountMeta[];
  jupiterData: Buffer;
} {
  if (ix.programId !== JUPITER_V6_PROGRAM_ID) {
    throw new Error(
      `Jupiter swapInstruction.programId must be ${JUPITER_V6_PROGRAM_ID} (got ${ix.programId}). Do not take a raw client program id.`,
    );
  }
  if (!ix.data) {
    throw new Error("Jupiter swapInstruction.data is empty");
  }
  const remaining = ix.accounts.map((a) => ({
    pubkey: new PublicKey(a.pubkey),
    isSigner: a.isSigner === true,
    isWritable: a.isWritable === true,
  }));
  const jupiterData = Buffer.from(ix.data, "base64");
  if (jupiterData.length === 0) {
    throw new Error("Jupiter swapInstruction.data decoded empty");
  }
  return { remaining, jupiterData };
}

export function isSolMint(mint: string): boolean {
  return mint === WSOL_MINT || mint === "So11111111111111111111111111111111111111112";
}
