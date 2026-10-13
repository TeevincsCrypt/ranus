import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { errorMessage, pct, round, tokenAmount, usd } from "../lib/format";
import { getKaminoMarketSnapshot, KAMINO_SOURCE, pickReserve } from "../sources/kamino";
import { getDollarYields, getSolSnapshot, getStockQuotes, getTokenizedTreasuries } from "../sources/markets";
import { buildPortfolio, type Portfolio } from "../sources/portfolio";
import { SOL_MINT, USDC_MINT } from "../sources/registry";
import { parseWallet } from "../sources/solana";
import { handle, READ_ONLY_ANNOTATIONS } from "./common";

const CONCEPTS = [
  "apy_vs_apr",
  "stablecoin_yield",
  "tokenized_treasuries",
  "tokenized_stocks",
  "ltv_and_liquidation",
  "borrow_capacity",
  "utilization",
  "depeg_risk",
  "liquid_staking",
  "slippage_and_price_impact",
] as const;
type Concept = (typeof CONCEPTS)[number];

/** Plain-language definitions. Every number shown next to them is fetched live. */
const DEFINITIONS: Record<Concept, { title: string; explanation: string }> = {
  apy_vs_apr: {
    title: "APY vs APR",
    explanation:
      "APR is the simple yearly rate. APY includes compounding — interest earning interest — so it is a little higher. On-chain lending rates change every block with supply and demand, so both are snapshots, not promises.",
  },
  stablecoin_yield: {
    title: "Where stablecoin yield comes from",
    explanation:
      "When you lend digital dollars on a protocol like Kamino, borrowers pay interest to use them. Your yield is that interest minus the protocol's cut. It rises when borrowing demand is high and falls when lots of lenders compete.",
  },
  tokenized_treasuries: {
    title: "Tokenized U.S. Treasuries",
    explanation:
      "A token backed by short-term U.S. government debt (and bank deposits). The yield comes from Treasury interest rather than crypto borrowers, so it tends to be steadier — but you rely on the issuer, and access is restricted by jurisdiction.",
  },
  tokenized_stocks: {
    title: "Tokenized stocks",
    explanation:
      "Tokens that track a real share or ETF (for example xStocks on Solana), backed 1:1 by the underlying held by an issuer. They let you get stock exposure 24/7 from a wallet, but carry equity price risk and issuer/custody risk.",
  },
  ltv_and_liquidation: {
    title: "Loan-to-value (LTV) and liquidation",
    explanation:
      "LTV = what you owe ÷ what your collateral is worth. Each asset has a maximum LTV for opening loans and a higher liquidation LTV. If prices move and your LTV reaches the liquidation level, part of your collateral is sold to repay the loan, with a penalty.",
  },
  borrow_capacity: {
    title: "Borrow capacity",
    explanation:
      "Your borrowing power is collateral value × max LTV. Borrowing the full amount leaves no room for price moves; most careful borrowers stay well below it.",
  },
  utilization: {
    title: "Utilization",
    explanation:
      "Utilization is the share of a lending pool that is currently borrowed. High utilization means higher rates for lenders — and that withdrawals may have to wait for repayments if almost everything is lent out.",
  },
  depeg_risk: {
    title: "Depeg risk",
    explanation:
      "A stablecoin aims to stay at $1, but it can trade below $1 if markets doubt its reserves or redemptions. Spreading dollars across reputable issuers reduces exposure to any single one.",
  },
  liquid_staking: {
    title: "Liquid staking",
    explanation:
      "Staking SOL helps secure Solana and earns rewards. A liquid staking token (like JitoSOL) represents staked SOL plus rewards, so you earn staking yield while keeping a tradable token. Its dollar value still moves with SOL.",
  },
  slippage_and_price_impact: {
    title: "Slippage and price impact",
    explanation:
      "Price impact is how much your own trade moves the price, based on available liquidity. Slippage tolerance is the worst price you accept before the trade is cancelled. Small trades in deep markets have tiny impact.",
  },
};

function cashUsd(p: Portfolio | null): number {
  return p ? p.holdings.filter((h) => h.assetClass === "cash_stablecoin").reduce((s, h) => s + (h.valueUsd ?? 0), 0) : 0;
}

async function grounding(concept: Concept, portfolio: Portfolio | null): Promise<{ live: Record<string, unknown>; personal: string[] }> {
  const personal: string[] = [];
  const cash = cashUsd(portfolio);
  switch (concept) {
    case "apy_vs_apr":
    case "stablecoin_yield":
    case "utilization": {
      const kamino = await getKaminoMarketSnapshot();
      const usdc = pickReserve(kamino, USDC_MINT)!;
      const apy = usdc.supplyApy;
      const apr = 365 * ((1 + apy) ** (1 / 365) - 1);
      if (cash >= 1) {
        personal.push(
          `Your $${usd(cash)} in stablecoins would earn about $${usd(cash * apy)} in a year at Kamino's current USDC rate of ${pct(apy)}% APY (≈${pct(apr)}% APR).`,
        );
      }
      if (concept === "utilization") {
        personal.push(`Kamino's USDC pool is ${pct(usdc.utilization, 1)}% utilized right now, with $${usd(usdc.availableLiquidityUsd)} available to withdraw.`);
      }
      return {
        live: {
          kaminoUsdcSupplyApyPct: pct(apy),
          equivalentAprPct: pct(apr),
          kaminoUsdcBorrowApyPct: pct(usdc.borrowApy),
          utilizationPct: pct(usdc.utilization, 1),
          availableLiquidityUsd: usd(usdc.availableLiquidityUsd),
          slot: kamino.slot,
          source: KAMINO_SOURCE,
        },
        personal,
      };
    }
    case "tokenized_treasuries": {
      const [t, d] = await Promise.all([getTokenizedTreasuries(), getDollarYields()]);
      const usdcLend = d.kamino.find((o) => o.symbol === "USDC");
      if (cash >= 1 && t.usdy?.apyPct != null) {
        personal.push(`$${usd(cash)} in USDY at ${t.usdy.apyPct}% would earn about $${usd((cash * t.usdy.apyPct) / 100)} per year.`);
      }
      return { live: { usdy: t.usdy, kaminoUsdcForComparison: usdcLend ?? null, errors: t.errors }, personal };
    }
    case "tokenized_stocks": {
      const s = await getStockQuotes(8);
      const held = portfolio?.holdings.filter((h) => h.assetClass === "tokenized_stock") ?? [];
      for (const h of held) personal.push(`You hold ${tokenAmount(h.amount)} ${h.symbol} worth $${usd(h.valueUsd ?? 0)}.`);
      return { live: s, personal };
    }
    case "ltv_and_liquidation":
    case "borrow_capacity": {
      const kamino = await getKaminoMarketSnapshot();
      const sol = pickReserve(kamino, SOL_MINT)!;
      const loans = portfolio?.kamino.obligations ?? [];
      for (const o of loans.filter((l) => l.borrowsUsd > 0.01)) {
        personal.push(
          `Your Kamino loan has LTV ${pct(o.currentLtv)}% against a liquidation LTV of ${pct(o.liquidationLtv)}% — collateral could fall about ${pct(o.collateralDropToLiquidation ?? 0, 1)}% before liquidation.`,
        );
      }
      const solHeld = portfolio?.holdings.find((h) => h.mint === SOL_MINT)?.amount ?? 0;
      if (solHeld > 0) {
        personal.push(
          `Your ${tokenAmount(solHeld)} SOL (≈$${usd(solHeld * sol.oraclePriceUsd)}) could back up to $${usd(solHeld * sol.oraclePriceUsd * sol.maxLtv)} of borrowing on Kamino (max LTV ${pct(sol.maxLtv, 0)}%).`,
        );
      }
      return {
        live: {
          solOraclePriceUsd: round(sol.oraclePriceUsd, 4),
          solMaxLtvPct: pct(sol.maxLtv, 1),
          solLiquidationLtvPct: pct(sol.liquidationLtv, 1),
          slot: kamino.slot,
          source: KAMINO_SOURCE,
        },
        personal,
      };
    }
    case "depeg_risk": {
      const kamino = await getKaminoMarketSnapshot();
      const stables = ["USDC", "USDT", "PYUSD", "USDS", "USDG"]
        .map((s) => pickReserve(kamino, s))
        .filter((r) => r !== undefined)
        .map((r) => ({ symbol: r.symbol, oraclePriceUsd: round(r.oraclePriceUsd, 5), deviationPct: pct(Math.abs(r.oraclePriceUsd - 1), 3) }));
      for (const h of portfolio?.holdings.filter((x) => x.assetClass === "cash_stablecoin") ?? []) {
        personal.push(`You hold $${usd(h.valueUsd ?? 0)} of ${h.symbol}.`);
      }
      return { live: { stablecoins: stables, source: `${KAMINO_SOURCE} oracle prices` }, personal };
    }
    case "liquid_staking": {
      const s = await getSolSnapshot();
      const solHeld = portfolio?.holdings.find((h) => h.mint === SOL_MINT)?.amount ?? 0;
      const top = s.liquidStaking[0];
      if (solHeld > 0 && top && s.solPriceUsd) {
        personal.push(
          `Staking your ${tokenAmount(solHeld)} SOL as ${top.symbol} at ${top.apyPct}% would add about ${tokenAmount((solHeld * top.apyPct) / 100)} SOL (≈$${usd(((solHeld * top.apyPct) / 100) * s.solPriceUsd)}) per year.`,
        );
      }
      return { live: s, personal };
    }
    case "slippage_and_price_impact":
      return {
        live: { tip: "Call prepare_action with action=swap to get a live Jupiter quote showing price impact for your exact trade size." },
        personal,
      };
  }
}

export function registerExplainTool(server: McpServer) {
  server.registerTool(
    "explain_concept",
    {
      title: "Explain a concept with your live numbers",
      description:
        "Plain-language explanation of a finance concept, grounded in live data and — when a wallet is given — the user's " +
        "actual balances and positions (e.g. what their idle USDC would earn at today's Kamino APY, or how far their loan is from " +
        `liquidation). Concepts: ${CONCEPTS.join(", ")}.`,
      inputSchema: {
        concept: z.enum(CONCEPTS),
        wallet: z.string().optional().describe("Solana wallet to personalize the explanation with real balances."),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    handle(async ({ concept, wallet }: { concept: Concept; wallet?: string }) => {
      const warnings: string[] = [];
      let portfolio: Portfolio | null = null;
      if (wallet) {
        try {
          portfolio = await buildPortfolio(parseWallet(wallet));
          warnings.push(...portfolio.warnings);
        } catch (err) {
          warnings.push(`Could not load wallet: ${errorMessage(err)}`);
        }
      }
      const g = await grounding(concept, portfolio);
      return {
        concept,
        ...DEFINITIONS[concept],
        liveData: g.live,
        personalized: g.personal,
        asOf: new Date().toISOString(),
        warnings,
      };
    }),
  );
}
