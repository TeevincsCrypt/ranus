import { isAddress, type Address } from "@solana/kit";
import { cached } from "../lib/cache";
import { UpstreamError } from "../lib/http";
import { getKaminoMarketSnapshot } from "./kamino";
import { searchTokens } from "./jupiter";
import { resolveKnownSymbol, SOL_MINT } from "./registry";
import { rpc } from "./solana";

export interface ResolvedToken {
  mint: string;
  symbol: string;
  decimals: number;
  resolvedVia: string;
}

/** Reads a mint's decimals from its on-chain mint account. */
async function getMintDecimals(mint: string): Promise<number> {
  return cached(`decimals:${mint}`, 24 * 3600_000, async () => {
    const res = await rpc.getAccountInfo(mint as Address, { encoding: "jsonParsed" }).send();
    const data = res.value?.data as { parsed?: { type?: string; info?: { decimals?: number } } } | undefined;
    if (data?.parsed?.type !== "mint" || typeof data.parsed.info?.decimals !== "number") {
      throw new UpstreamError("Solana RPC", `${mint} is not an SPL token mint`);
    }
    return data.parsed.info.decimals;
  });
}

/**
 * Resolves a symbol ("USDC", "SOL", "TSLAx") or mint address to a mint + decimals.
 * Order: explicit mint → RANUS registry → Kamino reserve symbols → Jupiter token search.
 */
export async function resolveToken(symbolOrMint: string): Promise<ResolvedToken> {
  const input = symbolOrMint.trim();
  if (isAddress(input)) {
    return { mint: input, symbol: input === SOL_MINT ? "SOL" : input, decimals: await getMintDecimals(input), resolvedVia: "mint address" };
  }

  const known = resolveKnownSymbol(input);
  if (known) {
    return { mint: known, symbol: input.toUpperCase() === "WSOL" ? "SOL" : input, decimals: await getMintDecimals(known), resolvedVia: "RANUS registry" };
  }

  try {
    const kamino = await getKaminoMarketSnapshot();
    const reserve = kamino.reserves.find((r) => r.symbol.toLowerCase() === input.toLowerCase());
    if (reserve) return { mint: reserve.mint, symbol: reserve.symbol, decimals: reserve.decimals, resolvedVia: "Kamino reserve" };
  } catch {
    // Fall through to Jupiter search.
  }

  const matches = await searchTokens(input);
  const exact = matches
    .filter((t) => t.symbol.toLowerCase() === input.toLowerCase())
    .sort((a, b) => Number(Boolean(b.isVerified)) - Number(Boolean(a.isVerified)) || (b.liquidity ?? 0) - (a.liquidity ?? 0));
  const best = exact[0];
  if (!best) {
    throw new Error(`Could not find a token with symbol "${input}". Pass the mint address instead.`);
  }
  if (!best.isVerified) {
    throw new Error(`"${input}" matches only unverified tokens on Jupiter (e.g. ${best.id}). Pass the exact mint address to proceed.`);
  }
  return { mint: best.id, symbol: best.symbol, decimals: best.decimals, resolvedVia: "Jupiter token search (verified)" };
}
