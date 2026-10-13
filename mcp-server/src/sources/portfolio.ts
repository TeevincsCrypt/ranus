import type { Address } from "@solana/kit";
import {
  ASSET_CLASS_LABEL,
  classifyMint,
  LIQUID_STAKED_SOL,
  SOL_MINT,
  TOKENIZED_TREASURIES,
  USD_STABLECOINS,
  type AssetClass,
} from "./registry.js";
import { getKaminoMarketSnapshot, getKaminoObligations, KAMINO_SOURCE, type KaminoObligationSnapshot } from "./kamino.js";
import { getTokensByMint, JUPITER_SOURCE, type JupiterToken } from "./jupiter.js";
import { getOnchainMetadata, getWalletBalances } from "./solana.js";

export interface Holding {
  mint: string;
  symbol: string;
  name: string;
  amount: number;
  priceUsd: number | null;
  valueUsd: number | null;
  priceSource: string | null;
  priceChange24hPct: number | null;
  assetClass: AssetClass;
  verified: boolean | null;
}

export interface Portfolio {
  wallet: string;
  slot: number;
  fetchedAt: string;
  walletValueUsd: number;
  kaminoNetValueUsd: number;
  netWorthUsd: number;
  allocation: Array<{ assetClass: AssetClass; label: string; valueUsd: number; sharePct: number }>;
  holdings: Holding[];
  hiddenTokens: { count: number; reason: string };
  kamino: { obligations: KaminoObligationSnapshot[]; error?: string };
  sources: string[];
  warnings: string[];
}

const KNOWN_SYMBOLS: Record<string, string> = {
  [SOL_MINT]: "SOL",
  ...USD_STABLECOINS,
  ...TOKENIZED_TREASURIES,
  ...LIQUID_STAKED_SOL,
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Builds a live portfolio for a wallet: on-chain balances (Solana RPC), metadata + USD prices
 * (Jupiter, falling back to Kamino's on-chain oracle prices), and Kamino Lend positions.
 * Assets that cannot be priced from a live source are reported as unpriced — never estimated.
 */
export async function buildPortfolio(wallet: Address): Promise<Portfolio> {
  const warnings: string[] = [];
  const sources = new Set<string>(["Solana RPC (balances)"]);

  const balancesPromise = getWalletBalances(wallet);
  const kaminoMarketPromise = getKaminoMarketSnapshot().catch((err) => {
    warnings.push(`Kamino market data unavailable: ${errorMessage(err)}`);
    return null;
  });
  const obligationsPromise = getKaminoObligations(wallet).catch((err) => {
    warnings.push(`Kamino positions unavailable: ${errorMessage(err)}`);
    return null;
  });

  const balances = await balancesPromise;
  const amounts = new Map<string, number>();
  if (balances.sol > 0) amounts.set(SOL_MINT, balances.sol);
  for (const t of balances.tokens) amounts.set(t.mint, (amounts.get(t.mint) ?? 0) + t.amount);
  const mints = [...amounts.keys()];

  let jupiter = new Map<string, JupiterToken>();
  if (mints.length > 0) {
    try {
      jupiter = await getTokensByMint(mints);
      sources.add(`${JUPITER_SOURCE} — token metadata & USD prices`);
    } catch (err) {
      warnings.push(`Jupiter prices unavailable (${errorMessage(err)}); using Kamino on-chain oracle prices where available.`);
    }
  }

  const kaminoMarket = await kaminoMarketPromise;
  const oracle = new Map<string, { price: number; symbol: string }>();
  if (kaminoMarket) {
    for (const r of kaminoMarket.reserves) {
      if (!oracle.has(r.mint) && r.oraclePriceUsd > 0) oracle.set(r.mint, { price: r.oraclePriceUsd, symbol: r.symbol });
    }
  }

  const needNames = mints.filter((m) => !jupiter.has(m) && !KNOWN_SYMBOLS[m] && !oracle.has(m));
  const onchainMeta = needNames.length > 0 ? await getOnchainMetadata(needNames.slice(0, 200)).catch(() => new Map()) : new Map();

  const holdings: Holding[] = [];
  let hidden = 0;
  for (const [mint, amount] of amounts) {
    const jup = jupiter.get(mint);
    const meta = onchainMeta.get(mint);
    const symbol = jup?.symbol ?? KNOWN_SYMBOLS[mint] ?? oracle.get(mint)?.symbol ?? meta?.symbol ?? `${mint.slice(0, 4)}…${mint.slice(-4)}`;
    const name = jup?.name ?? meta?.name ?? symbol;

    let priceUsd: number | null = null;
    let priceSource: string | null = null;
    if (typeof jup?.usdPrice === "number") {
      priceUsd = jup.usdPrice;
      priceSource = "Jupiter";
    } else if (oracle.has(mint)) {
      priceUsd = oracle.get(mint)!.price;
      priceSource = "Kamino on-chain oracle";
      sources.add(`${KAMINO_SOURCE} — oracle prices`);
    }
    const valueUsd = priceUsd !== null ? amount * priceUsd : null;
    const known = Boolean(KNOWN_SYMBOLS[mint]);
    const verified = jup ? Boolean(jup.isVerified) : known || oracle.has(mint) ? true : null;

    // Hide airdropped spam and dust: unverified/unpriced tokens and anything under one cent.
    if (!known && (verified === false || valueUsd === null || valueUsd < 0.01)) {
      hidden += 1;
      continue;
    }
    holdings.push({
      mint,
      symbol,
      name,
      amount,
      priceUsd,
      valueUsd,
      priceSource,
      priceChange24hPct: jup?.stats24h?.priceChange ?? null,
      assetClass: classifyMint(mint, jup?.tags ?? []),
      verified,
    });
  }
  holdings.sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));

  const walletValueUsd = holdings.reduce((sum, h) => sum + (h.valueUsd ?? 0), 0);
  const byClass = new Map<AssetClass, number>();
  for (const h of holdings) byClass.set(h.assetClass, (byClass.get(h.assetClass) ?? 0) + (h.valueUsd ?? 0));
  const allocation = [...byClass.entries()]
    .map(([assetClass, valueUsd]) => ({
      assetClass,
      label: ASSET_CLASS_LABEL[assetClass],
      valueUsd,
      sharePct: walletValueUsd > 0 ? (valueUsd / walletValueUsd) * 100 : 0,
    }))
    .sort((a, b) => b.valueUsd - a.valueUsd);

  const obligations = await obligationsPromise;
  if (obligations) sources.add(`${KAMINO_SOURCE} — lending positions`);
  const kaminoNetValueUsd = (obligations ?? []).reduce((sum, o) => sum + o.netValueUsd, 0);

  return {
    wallet,
    slot: balances.slot,
    fetchedAt: new Date().toISOString(),
    walletValueUsd,
    kaminoNetValueUsd,
    netWorthUsd: walletValueUsd + kaminoNetValueUsd,
    allocation,
    holdings,
    hiddenTokens: { count: hidden, reason: "unverified, unpriced, or worth less than $0.01" },
    kamino: obligations ? { obligations } : { obligations: [], error: "unavailable" },
    sources: [...sources],
    warnings,
  };
}
