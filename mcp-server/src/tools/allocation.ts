import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { errorMessage, pct, round, usd } from "../lib/format.js";
import { getSolanaLstPools, poolUrl, DEFILLAMA_SOURCE } from "../sources/defillama.js";
import { getKaminoMarketSnapshot, KAMINO_SOURCE } from "../sources/kamino.js";
import { getStockQuotes, getTokenizedTreasuries, kaminoReserveToOption, kaminoStableReserves } from "../sources/markets.js";
import { buildPortfolio } from "../sources/portfolio.js";
import { parseWallet } from "../sources/solana.js";
import { handle, READ_ONLY_ANNOTATIONS } from "./common.js";

type Profile = "conservative" | "balanced" | "growth";
type Bucket = "cash_buffer" | "stablecoin_lending" | "tokenized_treasuries" | "liquid_staked_sol" | "tokenized_stocks";

/**
 * RANUS allocation policy (rule-based and published in the README). Weights are policy, not data;
 * every product, rate and price that fills a bucket is looked up live at call time.
 */
const POLICY: Record<Profile, Record<Bucket, number>> = {
  conservative: { cash_buffer: 0.1, stablecoin_lending: 0.55, tokenized_treasuries: 0.35, liquid_staked_sol: 0, tokenized_stocks: 0 },
  balanced: { cash_buffer: 0.1, stablecoin_lending: 0.4, tokenized_treasuries: 0.25, liquid_staked_sol: 0.15, tokenized_stocks: 0.1 },
  growth: { cash_buffer: 0.05, stablecoin_lending: 0.25, tokenized_treasuries: 0.1, liquid_staked_sol: 0.3, tokenized_stocks: 0.3 },
};

const BUCKET_RISKS: Record<Bucket, string> = {
  cash_buffer: "Stablecoin issuer/depeg risk only; instantly spendable.",
  stablecoin_lending: "Variable rate; smart-contract and borrower-default risk; withdrawals can queue when utilization is ~100%.",
  tokenized_treasuries: "Issuer and redemption risk; eligibility restrictions (USDY is not offered to U.S. persons); price accrues daily.",
  liquid_staked_sol: "Full SOL price volatility plus staking/smart-contract risk.",
  tokenized_stocks: "Equity price volatility, tracks the underlying stock; issuer/custody risk; no dividends paid as yield here.",
};

const INDEX_SYMBOLS = /^(SPY|QQQ|VTI|IVV|VOO)x?$/i;

export function registerAllocationTool(server: McpServer) {
  server.registerTool(
    "suggest_allocation",
    {
      title: "Allocation suggestion (live rates)",
      description:
        "Suggests how to split a dollar amount (or the wallet's current stablecoin holdings) across a cash buffer, " +
        "stablecoin lending, tokenized U.S. Treasuries, liquid-staked SOL and tokenized stocks, using a published " +
        "risk-profile policy. Each bucket is filled with a live product chosen by safety rules (TVL, utilization, deposit caps) " +
        "and priced with live APYs/prices, giving projected annual income versus leaving the money idle. Educational, not financial advice.",
      inputSchema: {
        wallet: z.string().optional().describe("Solana wallet; when amountUsd is omitted, its stablecoin balance is used."),
        amountUsd: z.number().positive().optional().describe("Dollar amount to allocate."),
        riskProfile: z.enum(["conservative", "balanced", "growth"]).default("conservative"),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    handle(async ({ wallet, amountUsd, riskProfile }: { wallet?: string; amountUsd?: number; riskProfile: Profile }) => {
      const notes: string[] = [];
      let amount = amountUsd;
      let basis = "amount provided";
      if (amount === undefined) {
        if (!wallet) throw new Error("Provide amountUsd, or a wallet whose stablecoin balance should be allocated.");
        const portfolio = await buildPortfolio(parseWallet(wallet));
        amount = portfolio.holdings
          .filter((h) => h.assetClass === "cash_stablecoin")
          .reduce((s, h) => s + (h.valueUsd ?? 0), 0);
        basis = "wallet stablecoin balance";
        if (amount < 1) throw new Error(`The wallet holds only $${usd(amount)} in stablecoins. Pass amountUsd to plan a specific amount.`);
      }

      const [kamino, treasuries, lsts, stocks] = await Promise.all([
        getKaminoMarketSnapshot().catch((err) => ({ error: errorMessage(err) })),
        getTokenizedTreasuries(),
        getSolanaLstPools().catch((err) => ({ error: errorMessage(err) })),
        getStockQuotes(40),
      ]);

      // Stablecoin lending: deep, not capped, not near 100% utilization; then highest APY.
      const lendingCandidates =
        "error" in kamino
          ? []
          : kaminoStableReserves(kamino.reserves, 20_000_000)
              .filter((r) => !r.depositCapReached && r.utilization < 0.95)
              .sort((a, b) => b.supplyApy + b.reserveRewardsApr - (a.supplyApy + a.reserveRewardsApr));
      const lending = lendingCandidates[0];
      const usdy = treasuries.usdy?.apyPct != null ? treasuries.usdy : null;
      const lst = Array.isArray(lsts) ? lsts[0] : undefined;
      const indexStock = stocks.stocks.find((s) => INDEX_SYMBOLS.test(s.symbol)) ?? null;

      const weights = { ...POLICY[riskProfile] };
      const reassign = (from: Bucket, to: Bucket, why: string) => {
        if (weights[from] > 0) {
          notes.push(`${why} — its ${pct(weights[from], 0)}% weight moved to ${to.replace(/_/g, " ")}.`);
          weights[to] += weights[from];
          weights[from] = 0;
        }
      };
      if (!usdy) reassign("tokenized_treasuries", lending ? "stablecoin_lending" : "cash_buffer", "Live USDY yield unavailable");
      if (!lst) reassign("liquid_staked_sol", lending ? "stablecoin_lending" : "cash_buffer", "Live liquid-staking yield unavailable");
      if (!indexStock) reassign("tokenized_stocks", "cash_buffer", "No live index-fund tokenized stock quote available");
      if (!lending) reassign("stablecoin_lending", "cash_buffer", "Live Kamino stablecoin rates unavailable");

      const buckets = (Object.keys(weights) as Bucket[])
        .filter((b) => weights[b] > 0)
        .map((bucket) => {
          const allocUsd = amount! * weights[bucket];
          let product: Record<string, unknown>;
          let apyPct: number | null = null;
          switch (bucket) {
            case "cash_buffer":
              product = { name: "Keep in wallet as USDC", note: "Liquid for spending and fees." };
              apyPct = 0;
              break;
            case "stablecoin_lending":
              product = {
                ...kaminoReserveToOption(lending!),
                alternatives: lendingCandidates.slice(1, 3).map(kaminoReserveToOption),
              };
              apyPct = pct(lending!.supplyApy + lending!.reserveRewardsApr);
              break;
            case "tokenized_treasuries":
              product = usdy!;
              apyPct = usdy!.apyPct;
              break;
            case "liquid_staked_sol":
              product = { symbol: lst!.symbol, project: lst!.project, tvlUsd: usd(lst!.tvlUsd), url: poolUrl(lst!), source: DEFILLAMA_SOURCE };
              apyPct = round(lst!.apy ?? 0);
              break;
            case "tokenized_stocks":
              product = { ...indexStock!, note: "Broad-market index exposure; returns come from price, not yield." };
              apyPct = null;
              break;
          }
          return {
            bucket,
            weightPct: pct(weights[bucket], 0),
            amountUsd: usd(allocUsd),
            liveApyPct: apyPct,
            projectedAnnualIncomeUsd: apyPct === null ? null : usd((allocUsd * apyPct) / 100),
            product,
            risks: BUCKET_RISKS[bucket],
          };
        });

      const income = buckets.reduce((s, b) => s + (b.projectedAnnualIncomeUsd ?? 0), 0);
      const yieldBearing = buckets.filter((b) => b.liveApyPct !== null).reduce((s, b) => s + b.amountUsd, 0);
      return {
        asOf: new Date().toISOString(),
        riskProfile,
        amountUsd: usd(amount),
        amountBasis: basis,
        buckets,
        projectedAnnualIncomeUsd: usd(income),
        blendedApyOnYieldBearingPct: yieldBearing > 0 ? round((income / yieldBearing) * 100) : 0,
        idleComparison: { annualIncomeIfIdleUsd: 0, extraIncomePerYearUsd: usd(income) },
        policy: { weights: POLICY[riskProfile], adjustedWeights: weights },
        notes,
        caveats: [
          "Rates are variable and change every block; projections assume today's live rates hold for a year.",
          "Educational information, not financial advice. RANUS never moves funds.",
        ],
        sources: [KAMINO_SOURCE, DEFILLAMA_SOURCE, stocks.source],
        dataErrors: [
          ...("error" in kamino ? [kamino.error] : []),
          ...treasuries.errors,
          ...(Array.isArray(lsts) ? [] : [lsts.error]),
          ...(stocks.error ? [stocks.error] : []),
        ],
      };
    }),
  );
}
