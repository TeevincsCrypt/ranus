import { config } from "../config.js";
import { cached } from "../lib/cache.js";
import { fetchJson } from "../lib/http.js";

/**
 * DefiLlama Yields API (https://yields.llama.fi/pools) — a free, public aggregator of
 * protocol yields. RANUS uses it for Ondo USDY (tokenized Treasuries), Solana liquid-staking
 * yields and a cross-protocol view of Solana stablecoin yields. APYs are published in percent.
 */

export const DEFILLAMA_SOURCE = "DefiLlama Yields API (yields.llama.fi)";

export interface LlamaPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
  apyMean30d?: number | null;
  apyPct7D?: number | null;
  stablecoin?: boolean;
  exposure?: string;
  ilRisk?: string;
  poolMeta?: string | null;
  underlyingTokens?: string[] | null;
}

interface PoolsResponse {
  status: string;
  data: LlamaPool[];
}

const USD_STABLE_SYMBOLS = new Set(["USDC", "USDT", "PYUSD", "USDS", "USDG", "FDUSD", "USDE", "SUSDE", "AUSD", "USDH", "USD1"]);
const LST_SYMBOLS = new Set(["JITOSOL", "MSOL", "JUPSOL", "BNSOL", "INF", "BSOL", "DSOL", "HSOL"]);

/** Solana pools plus Ondo's yield assets, trimmed from the full DefiLlama dataset and cached for 10 minutes. */
function getRelevantPools(): Promise<LlamaPool[]> {
  return cached("llama:pools", 10 * 60_000, async () => {
    const res = await fetchJson<PoolsResponse>(config.defillamaYieldsUrl, {
      source: DEFILLAMA_SOURCE,
      timeoutMs: 45_000,
      retries: 1,
    });
    if (res.status !== "success" || !Array.isArray(res.data)) {
      throw new Error(`${DEFILLAMA_SOURCE}: unexpected response status "${res.status}"`);
    }
    return res.data.filter((p) => p.chain === "Solana" || p.project === "ondo-yield-assets");
  });
}

export function poolUrl(pool: LlamaPool): string {
  return `https://defillama.com/yields/pool/${pool.pool}`;
}

/** Single-asset USD stablecoin pools on Solana (lending/savings), largest first. */
export async function getSolanaStablecoinPools(minTvlUsd = 1_000_000): Promise<LlamaPool[]> {
  const pools = await getRelevantPools();
  return pools
    .filter(
      (p) =>
        p.chain === "Solana" &&
        p.exposure === "single" &&
        USD_STABLE_SYMBOLS.has(p.symbol.toUpperCase()) &&
        p.tvlUsd >= minTvlUsd &&
        typeof p.apy === "number",
    )
    .sort((a, b) => b.tvlUsd - a.tvlUsd);
}

/** Ondo USDY (tokenized short-term U.S. Treasuries) — prefers the Solana deployment's entry. */
export async function getUsdyPool(): Promise<LlamaPool | undefined> {
  const pools = await getRelevantPools();
  const usdy = pools
    .filter((p) => p.project === "ondo-yield-assets" && p.symbol.toUpperCase() === "USDY" && typeof p.apy === "number")
    .sort((a, b) => Number(b.chain === "Solana") - Number(a.chain === "Solana") || b.tvlUsd - a.tvlUsd);
  return usdy[0];
}

/** Solana liquid-staking token yields (JitoSOL, mSOL, JupSOL, ...). */
export async function getSolanaLstPools(minTvlUsd = 10_000_000): Promise<LlamaPool[]> {
  const pools = await getRelevantPools();
  const best = new Map<string, LlamaPool>();
  for (const p of pools) {
    const sym = p.symbol.toUpperCase();
    if (p.chain !== "Solana" || !LST_SYMBOLS.has(sym) || p.tvlUsd < minTvlUsd || typeof p.apy !== "number") continue;
    const prev = best.get(sym);
    if (!prev || p.tvlUsd > prev.tvlUsd) best.set(sym, p);
  }
  return [...best.values()].sort((a, b) => b.tvlUsd - a.tvlUsd);
}
