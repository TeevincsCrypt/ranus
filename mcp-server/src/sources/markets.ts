import { errorMessage, pct, round, usd } from "../lib/format.js";
import {
  DEFILLAMA_SOURCE,
  getSolanaLstPools,
  getSolanaStablecoinPools,
  getUsdyPool,
  poolUrl,
} from "./defillama.js";
import { getPrices, getTokenizedStocks, JUPITER_SOURCE } from "./jupiter.js";
import { getKaminoMarketSnapshot, KAMINO_SOURCE, pickReserve, type KaminoReserveSnapshot } from "./kamino.js";
import { SOL_MINT, TOKENIZED_TREASURIES, USD_STABLECOINS } from "./registry.js";

/** Shared live-market views used by several tools. Every number comes from a live source. */

export interface DollarYieldOption {
  protocol: string;
  symbol: string;
  mint?: string;
  apyPct: number;
  apyBasePct?: number | null;
  apyRewardPct?: number | null;
  apyMean30dPct?: number | null;
  tvlUsd: number;
  utilizationPct?: number;
  availableLiquidityUsd?: number;
  depositCapReached?: boolean;
  url?: string;
  source: string;
}

export function kaminoStableReserves(reserves: KaminoReserveSnapshot[], minSupplyUsd = 1_000_000): KaminoReserveSnapshot[] {
  return reserves.filter((r) => USD_STABLECOINS[r.mint] && !r.fixedRate && r.totalSupplyUsd >= minSupplyUsd);
}

export function kaminoReserveToOption(r: KaminoReserveSnapshot): DollarYieldOption {
  return {
    protocol: "Kamino Lend (main market)",
    symbol: r.symbol,
    mint: r.mint,
    apyPct: pct(r.supplyApy + r.reserveRewardsApr),
    apyBasePct: pct(r.supplyApy),
    apyRewardPct: r.reserveRewardsApr > 0 ? pct(r.reserveRewardsApr) : null,
    tvlUsd: usd(r.totalSupplyUsd),
    utilizationPct: pct(r.utilization, 1),
    availableLiquidityUsd: usd(r.availableLiquidityUsd),
    depositCapReached: r.depositCapReached,
    url: "https://app.kamino.finance/",
    source: KAMINO_SOURCE,
  };
}

/** Live yields for holding digital dollars on Solana: Kamino (on-chain) + other protocols (DefiLlama). */
export async function getDollarYields() {
  const errors: string[] = [];
  const [kamino, llama] = await Promise.all([
    getKaminoMarketSnapshot().catch((err) => {
      errors.push(errorMessage(err));
      return null;
    }),
    getSolanaStablecoinPools(5_000_000).catch((err) => {
      errors.push(errorMessage(err));
      return null;
    }),
  ]);

  const kaminoOptions = kamino ? kaminoStableReserves(kamino.reserves).map(kaminoReserveToOption) : [];
  const otherOptions: DollarYieldOption[] = (llama ?? [])
    .filter((p) => p.project !== "kamino-lend") // Kamino already comes straight from chain.
    .slice(0, 12)
    .map((p) => ({
      protocol: p.project,
      symbol: p.symbol,
      apyPct: round(p.apy ?? 0),
      apyBasePct: p.apyBase === null ? null : round(p.apyBase),
      apyRewardPct: p.apyReward === null ? null : round(p.apyReward),
      apyMean30dPct: p.apyMean30d == null ? null : round(p.apyMean30d),
      tvlUsd: usd(p.tvlUsd),
      url: poolUrl(p),
      source: DEFILLAMA_SOURCE,
    }));

  return {
    asOf: new Date().toISOString(),
    kaminoSlot: kamino?.slot ?? null,
    kamino: kaminoOptions,
    otherProtocols: otherOptions,
    errors,
  };
}

/** Ondo USDY: live APY (DefiLlama) and live price (Jupiter). */
export async function getTokenizedTreasuries() {
  const errors: string[] = [];
  const usdyMint = Object.keys(TOKENIZED_TREASURIES)[0];
  const [pool, prices] = await Promise.all([
    getUsdyPool().catch((err) => {
      errors.push(errorMessage(err));
      return undefined;
    }),
    getPrices([usdyMint]).catch((err) => {
      errors.push(errorMessage(err));
      return null;
    }),
  ]);
  const price = prices?.get(usdyMint);
  if (!pool && !price) return { usdy: null, errors };
  return {
    usdy: {
      symbol: "USDY",
      name: "Ondo US Dollar Yield",
      mint: usdyMint,
      apyPct: pool ? round(pool.apy ?? 0) : null,
      apyMean30dPct: pool?.apyMean30d == null ? null : round(pool.apyMean30d),
      tvlUsd: pool ? usd(pool.tvlUsd) : null,
      apySource: pool ? `${DEFILLAMA_SOURCE} (${pool.chain} pool)` : null,
      apyUrl: pool ? poolUrl(pool) : null,
      priceUsd: price ? round(price.usdPrice, 6) : null,
      priceSource: price ? JUPITER_SOURCE : null,
      howItWorks:
        "Tokenized note backed by short-term U.S. Treasuries and bank deposits; yield accrues through a rising token price. Not offered to U.S. persons; new mints are subject to Ondo's eligibility checks.",
    },
    errors,
  };
}

/** Tokenized stocks Jupiter lists (xStocks etc.), ranked by on-chain liquidity. */
export async function getStockQuotes(limit = 10) {
  try {
    const stocks = await getTokenizedStocks();
    return {
      source: JUPITER_SOURCE,
      totalListed: stocks.length,
      stocks: stocks
        .filter((s) => typeof s.usdPrice === "number")
        .sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0))
        .slice(0, limit)
        .map((s) => ({
          symbol: s.symbol,
          name: s.name,
          mint: s.id,
          priceUsd: round(s.usdPrice!, 4),
          change24hPct: s.stats24h?.priceChange == null ? null : round(s.stats24h.priceChange),
          liquidityUsd: s.liquidity == null ? null : usd(s.liquidity),
          verified: Boolean(s.isVerified),
        })),
      error: null as string | null,
    };
  } catch (err) {
    return { source: JUPITER_SOURCE, totalListed: 0, stocks: [], error: errorMessage(err) };
  }
}

/** SOL price (Kamino on-chain oracle, Jupiter as cross-check) and liquid-staking yields (DefiLlama). */
export async function getSolSnapshot() {
  const errors: string[] = [];
  const [kamino, jup, lsts] = await Promise.all([
    getKaminoMarketSnapshot().catch((err) => {
      errors.push(errorMessage(err));
      return null;
    }),
    getPrices([SOL_MINT]).catch(() => null),
    getSolanaLstPools().catch((err) => {
      errors.push(errorMessage(err));
      return [];
    }),
  ]);
  const solReserve = kamino ? pickReserve(kamino, SOL_MINT) : undefined;
  return {
    solPriceUsd: solReserve ? round(solReserve.oraclePriceUsd, 4) : jup?.get(SOL_MINT)?.usdPrice ?? null,
    solPriceSource: solReserve ? `${KAMINO_SOURCE} oracle` : jup?.get(SOL_MINT) ? JUPITER_SOURCE : null,
    jupiterSolPriceUsd: jup?.get(SOL_MINT)?.usdPrice ?? null,
    solChange24hPct: jup?.get(SOL_MINT)?.priceChange24h ?? null,
    kaminoSolSupplyApyPct: solReserve ? pct(solReserve.supplyApy) : null,
    liquidStaking: lsts.map((p) => ({
      symbol: p.symbol,
      project: p.project,
      apyPct: round(p.apy ?? 0),
      tvlUsd: usd(p.tvlUsd),
      url: poolUrl(p),
    })),
    liquidStakingSource: DEFILLAMA_SOURCE,
    errors,
  };
}
