import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { pct, tokenAmount, usd } from "../lib/format";
import { getDollarYields, getSolSnapshot, getStockQuotes, getTokenizedTreasuries } from "../sources/markets";
import { buildPortfolio } from "../sources/portfolio";
import { parseWallet } from "../sources/solana";
import { handle, READ_ONLY_ANNOTATIONS, walletSchema } from "./common";

export function registerPortfolioTools(server: McpServer) {
  server.registerTool(
    "get_portfolio_summary",
    {
      title: "Portfolio summary (live)",
      description:
        "Live snapshot of a Solana wallet: SOL and token balances read from Solana RPC, USD values from Jupiter prices " +
        "(falling back to Kamino's on-chain oracle prices), allocation by asset class (digital dollars, tokenized Treasuries, " +
        "tokenized stocks, SOL/LSTs, other), and Kamino Lend deposits/borrows with live LTV. Spam and dust tokens are hidden. " +
        "Use this first whenever a question depends on the user's own holdings.",
      inputSchema: { wallet: walletSchema },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    handle(async ({ wallet }: { wallet: string }) => {
      const p = await buildPortfolio(parseWallet(wallet));
      return {
        wallet: p.wallet,
        asOf: p.fetchedAt,
        slot: p.slot,
        walletValueUsd: usd(p.walletValueUsd),
        kaminoNetValueUsd: usd(p.kaminoNetValueUsd),
        netWorthUsd: usd(p.netWorthUsd),
        allocation: p.allocation.map((a) => ({ ...a, valueUsd: usd(a.valueUsd), sharePct: Math.round(a.sharePct * 10) / 10 })),
        holdings: p.holdings.slice(0, 25).map((h) => ({
          symbol: h.symbol,
          name: h.name,
          mint: h.mint,
          amount: tokenAmount(h.amount),
          priceUsd: h.priceUsd === null ? null : usd(h.priceUsd),
          valueUsd: h.valueUsd === null ? null : usd(h.valueUsd),
          change24hPct: h.priceChange24hPct === null ? null : Math.round(h.priceChange24hPct * 100) / 100,
          assetClass: h.assetClass,
          priceSource: h.priceSource,
        })),
        moreHoldingsOmitted: Math.max(0, p.holdings.length - 25),
        hiddenTokens: p.hiddenTokens,
        kaminoPositions: p.kamino.obligations.map((o) => ({
          obligation: o.obligation,
          deposits: o.deposits.map((d) => ({ ...d, amount: tokenAmount(d.amount), valueUsd: usd(d.valueUsd) })),
          borrows: o.borrows.map((b) => ({ ...b, amount: tokenAmount(b.amount), valueUsd: usd(b.valueUsd) })),
          depositsUsd: usd(o.depositsUsd),
          borrowsUsd: usd(o.borrowsUsd),
          netValueUsd: usd(o.netValueUsd),
          currentLtvPct: pct(o.currentLtv),
          liquidationLtvPct: pct(o.liquidationLtv),
          collateralDropToLiquidationPct: o.collateralDropToLiquidation === null ? null : pct(o.collateralDropToLiquidation),
        })),
        kaminoError: p.kamino.error ?? null,
        sources: p.sources,
        warnings: p.warnings,
      };
    }),
  );

  server.registerTool(
    "get_market_snapshot",
    {
      title: "Live dollar yields & asset prices",
      description:
        "Live market context, no wallet needed: (1) yields for holding digital dollars on Solana — Kamino Lend stablecoin " +
        "reserves read on-chain (supply APY, utilization, available liquidity) plus other Solana protocols from DefiLlama; " +
        "(2) tokenized U.S. Treasuries (Ondo USDY live APY and price); (3) tokenized stocks listed on Jupiter (xStocks) " +
        "with live prices; (4) SOL price and liquid-staking yields. Use for 'safest way to hold dollars', rate comparisons, " +
        "and cash vs Treasuries vs stocks questions.",
      inputSchema: {
        sections: z
          .array(z.enum(["dollar_yields", "tokenized_treasuries", "tokenized_stocks", "sol"]))
          .optional()
          .describe("Limit to specific sections. Default: all."),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    handle(async ({ sections }: { sections?: Array<"dollar_yields" | "tokenized_treasuries" | "tokenized_stocks" | "sol"> }) => {
      const want = new Set(sections?.length ? sections : ["dollar_yields", "tokenized_treasuries", "tokenized_stocks", "sol"]);
      const [dollarYields, treasuries, stocks, sol] = await Promise.all([
        want.has("dollar_yields") ? getDollarYields() : null,
        want.has("tokenized_treasuries") ? getTokenizedTreasuries() : null,
        want.has("tokenized_stocks") ? getStockQuotes(10) : null,
        want.has("sol") ? getSolSnapshot() : null,
      ]);
      return {
        asOf: new Date().toISOString(),
        ...(dollarYields && { dollarYields }),
        ...(treasuries && { tokenizedTreasuries: treasuries }),
        ...(stocks && { tokenizedStocks: stocks }),
        ...(sol && { sol }),
      };
    }),
  );
}
