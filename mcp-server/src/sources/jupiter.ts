import { config } from "../config";
import { cached, RateLimiter } from "../lib/cache";
import { fetchJson } from "../lib/http";

/**
 * Jupiter APIs (https://developers.jup.ag). Endpoints and response shapes follow Jupiter's
 * published OpenAPI specs: Tokens V2, Price V3 and Swap V2 (/order without a taker = quote only).
 * Keyless access on api.jup.ag is limited to 0.5 RPS, so calls are serialized and cached.
 */

export const JUPITER_SOURCE = "Jupiter API (api.jup.ag)";

const limiter = new RateLimiter(config.jupiterApiKey ? 1_100 : 2_100);

function jupiterGet<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(path, config.jupiterApiBase);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const headers: Record<string, string> = {};
  if (config.jupiterApiKey) headers["x-api-key"] = config.jupiterApiKey;
  return limiter.schedule(() => fetchJson<T>(url.toString(), { source: JUPITER_SOURCE, headers, retries: 2 }));
}

export interface JupiterToken {
  id: string;
  name: string;
  symbol: string;
  icon?: string;
  decimals: number;
  tags?: string[];
  isVerified?: boolean;
  usdPrice?: number;
  liquidity?: number;
  mcap?: number;
  fdv?: number;
  organicScore?: number;
  organicScoreLabel?: string;
  stats24h?: { priceChange?: number; buyVolume?: number; sellVolume?: number };
  updatedAt?: string;
}

/** Tokens V2 returns a bare array per its spec; accept a wrapped list too and report anything else verbatim. */
function tokenList(body: unknown, what: string): JupiterToken[] {
  if (Array.isArray(body)) return body as JupiterToken[];
  if (body && typeof body === "object") {
    for (const key of ["tokens", "data", "result", "items"]) {
      const value = (body as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value as JupiterToken[];
    }
  }
  throw new Error(`${JUPITER_SOURCE}: unexpected ${what} response: ${JSON.stringify(body).slice(0, 200)}`);
}

/** Token metadata + live USD price for up to 100 mints per request (Tokens V2 search). */
export async function getTokensByMint(mints: string[]): Promise<Map<string, JupiterToken>> {
  const unique = [...new Set(mints)].sort();
  const result = new Map<string, JupiterToken>();
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    const tokens = await cached(`jup:tokens:${batch.join(",")}`, 60_000, async () =>
      tokenList(await jupiterGet<unknown>("/tokens/v2/search", { query: batch.join(",") }), "token search"),
    );
    for (const t of tokens) result.set(t.id, t);
  }
  return result;
}

/** Search tokens by symbol or name (Jupiter returns up to 20 matches, ranked). */
export function searchTokens(query: string): Promise<JupiterToken[]> {
  return cached(`jup:search:${query.toLowerCase()}`, 300_000, async () =>
    tokenList(await jupiterGet<unknown>("/tokens/v2/search", { query }), "token search"),
  );
}

const isStock = (t: JupiterToken) => t.tags?.includes("stocks") || /xstock/i.test(`${t.name} ${t.symbol}`);

/**
 * Every token Jupiter tags as a tokenized stock (xStocks and similar), with live prices. If the
 * `stocks` tag endpoint fails or is empty, falls back to a Tokens V2 search for xStocks.
 */
export function getTokenizedStocks(): Promise<JupiterToken[]> {
  return cached("jup:tag:stocks", 300_000, async () => {
    let tagError: unknown = null;
    try {
      const tagged = tokenList(await jupiterGet<unknown>("/tokens/v2/tag", { query: "stocks" }), "stocks tag");
      if (tagged.length > 0) return tagged;
    } catch (err) {
      tagError = err;
    }
    const found = (await searchTokens("xStock")).filter(isStock);
    if (found.length === 0 && tagError) throw tagError;
    return found;
  });
}

export interface JupiterPrice {
  usdPrice: number;
  liquidity: number;
  decimals: number;
  priceChange24h: number | null;
  blockId: number | null;
  createdAt: string;
}

/** Live USD prices (Price V3). Tokens without a reliable price are omitted by Jupiter. */
export async function getPrices(mints: string[]): Promise<Map<string, JupiterPrice>> {
  const unique = [...new Set(mints)].sort();
  const result = new Map<string, JupiterPrice>();
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const prices = await cached(`jup:price:${batch.join(",")}`, 20_000, () =>
      jupiterGet<Record<string, JupiterPrice>>("/price/v3", { ids: batch.join(",") }),
    );
    for (const [mint, price] of Object.entries(prices)) result.set(mint, price);
  }
  return result;
}

export interface JupiterOrderQuote {
  mode?: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  inUsdValue?: number;
  outUsdValue?: number;
  /** Percentage points, e.g. -0.1 = -0.1%. */
  priceImpact?: number;
  otherAmountThreshold?: string;
  slippageBps?: number;
  routePlan?: Array<{ swapInfo: { label: string; ammKey: string }; percent: number; bps?: number }>;
  feeBps?: number;
  feeMint?: string;
  router?: string;
  signatureFeeLamports?: number;
  prioritizationFeeLamports?: number;
  rentFeeLamports?: number;
  gasless?: boolean;
  requestId?: string;
  totalTime?: number;
  expireAt?: string;
  errorCode?: number;
  errorMessage?: string;
  error?: string;
}

/**
 * A live swap quote from Jupiter Swap V2 `/order`. No `taker` is sent, so Jupiter returns
 * a quote without an assembled transaction — RANUS never builds, signs or submits swaps.
 */
export function getSwapQuote(params: {
  inputMint: string;
  outputMint: string;
  amountRaw: string;
  slippageBps?: number;
}): Promise<JupiterOrderQuote> {
  return jupiterGet<JupiterOrderQuote>("/swap/v2/order", {
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amountRaw,
    slippageBps: params.slippageBps,
  });
}
