import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { pct, round, tokenAmount, usd } from "../lib/format.js";
import {
  getKaminoMarketSnapshot,
  getKaminoObligations,
  KAMINO_SOURCE,
  pickReserve,
  type KaminoMarketSnapshot,
  type KaminoObligationSnapshot,
  type KaminoReserveSnapshot,
} from "../sources/kamino.js";
import { USD_STABLECOINS } from "../sources/registry.js";
import { getWalletBalances, parseWallet } from "../sources/solana.js";
import { resolveToken } from "../sources/tokens.js";
import { handle, READ_ONLY_ANNOTATIONS } from "./common.js";

export interface BorrowScenarioInput {
  collateral: KaminoReserveSnapshot;
  collateralAmount: number;
  debt: KaminoReserveSnapshot;
  borrowUsd: number;
  existing?: KaminoObligationSnapshot;
}

/** Pure math on live Kamino parameters — the same quantities Kamino's risk engine uses. */
export function borrowScenario({ collateral, collateralAmount, debt, borrowUsd, existing }: BorrowScenarioInput) {
  const collateralValue = collateralAmount * collateral.oraclePriceUsd;
  const adjBorrow = borrowUsd * debt.borrowFactor;
  const totalCollateral = collateralValue + (existing?.depositsUsd ?? 0);
  const totalAdjBorrow = adjBorrow + (existing?.borrowsAdjustedUsd ?? 0);
  const liqLimit = collateralValue * collateral.liquidationLtv + (existing?.liquidationThresholdUsd ?? 0);
  const borrowLimit = collateralValue * collateral.maxLtv + (existing?.borrowLimitUsd ?? 0);
  const ltv = totalCollateral > 0 ? totalAdjBorrow / totalCollateral : 0;
  const dropToLiq = liqLimit > 0 ? Math.max(0, 1 - totalAdjBorrow / liqLimit) : 0;
  // Liquidation price of the new collateral asset, assuming it is the only asset that moves.
  const otherLiq = existing?.liquidationThresholdUsd ?? 0;
  const liqPrice =
    collateralAmount > 0 && collateral.liquidationLtv > 0
      ? Math.max(0, (totalAdjBorrow - otherLiq) / (collateralAmount * collateral.liquidationLtv))
      : null;
  return {
    borrowUsd: usd(borrowUsd),
    borrowAmount: tokenAmount(borrowUsd / debt.oraclePriceUsd),
    ltvPct: pct(ltv),
    withinBorrowLimit: totalAdjBorrow <= borrowLimit + 1e-9,
    collateralDropToLiquidationPct: pct(dropToLiq, 1),
    liquidationPriceUsd: liqPrice === null ? null : round(liqPrice, liqPrice < 10 ? 4 : 2),
    annualInterestUsd: usd(borrowUsd * debt.borrowApy),
    monthlyInterestUsd: usd((borrowUsd * debt.borrowApy) / 12),
    enoughReserveLiquidity: borrowUsd <= debt.availableLiquidityUsd,
  };
}

async function resolveReserve(kamino: KaminoMarketSnapshot, token: string, role: string) {
  const resolved = await resolveToken(token);
  const reserve = pickReserve(kamino, resolved.mint);
  if (!reserve) throw new Error(`${resolved.symbol} is not an active ${role} asset in the Kamino main market.`);
  return reserve;
}

export function registerBorrowTool(server: McpServer) {
  server.registerTool(
    "simulate_borrow",
    {
      title: "Borrow simulation (Kamino, live)",
      description:
        "Simulates borrowing on Kamino Lend against collateral using live on-chain parameters: oracle price, max LTV, " +
        "liquidation LTV, borrow factor, live borrow APY and available reserve liquidity. Returns max borrow capacity and " +
        "scenarios (25/50/75/100% of capacity, or an exact amount) with resulting LTV, liquidation price, collateral drop to " +
        "liquidation and interest cost. If a wallet is given, its real balance is the default collateral amount and any " +
        "existing Kamino loan is combined into the simulation. Read-only.",
      inputSchema: {
        collateral: z.string().describe("Collateral token symbol or mint, e.g. SOL, JitoSOL, USDC."),
        collateralAmount: z.number().positive().optional().describe("Collateral amount in token units. Defaults to the wallet balance."),
        borrow: z.string().default("USDC").describe("Token to borrow, symbol or mint. Default USDC."),
        borrowAmount: z.number().positive().optional().describe("Exact amount to borrow, in units of the borrowed token."),
        wallet: z.string().optional().describe("Solana wallet address to read balances and existing Kamino loans from."),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    handle(
      async (args: { collateral: string; collateralAmount?: number; borrow: string; borrowAmount?: number; wallet?: string }) => {
        const kamino = await getKaminoMarketSnapshot();
        const [coll, debt] = await Promise.all([
          resolveReserve(kamino, args.collateral, "collateral"),
          resolveReserve(kamino, args.borrow, "borrowable"),
        ]);
        if (coll.maxLtv <= 0) throw new Error(`${coll.symbol} cannot be used as collateral in the Kamino main market (max LTV is 0%).`);
        if (coll.mint === debt.mint) throw new Error("Collateral and borrowed asset must differ.");

        const wallet = args.wallet ? parseWallet(args.wallet) : undefined;
        let collateralAmount = args.collateralAmount;
        let amountBasis = "amount provided";
        let existing: KaminoObligationSnapshot | undefined;
        if (wallet) {
          const [balances, obligations] = await Promise.all([getWalletBalances(wallet), getKaminoObligations(wallet)]);
          existing = [...obligations].sort((a, b) => b.depositsUsd - a.depositsUsd)[0];
          if (collateralAmount === undefined) {
            collateralAmount =
              coll.symbol === "SOL" ? balances.sol : (balances.tokens.find((t) => t.mint === coll.mint)?.amount ?? 0);
            amountBasis = "wallet balance";
          }
        }
        if (!collateralAmount || collateralAmount <= 0) {
          throw new Error(`No ${coll.symbol} collateral amount: pass collateralAmount, or a wallet that holds ${coll.symbol}.`);
        }

        const collateralValue = collateralAmount * coll.oraclePriceUsd;
        const maxBorrowUsd = Math.max(
          0,
          (collateralValue * coll.maxLtv + (existing ? existing.borrowLimitUsd - existing.borrowsAdjustedUsd : 0)) / debt.borrowFactor,
        );
        const base = { collateral: coll, collateralAmount, debt, existing };
        const scenarios = args.borrowAmount
          ? [{ label: "requested", ...borrowScenario({ ...base, borrowUsd: args.borrowAmount * debt.oraclePriceUsd }) }]
          : [0.25, 0.5, 0.75, 1].map((f) => ({
              label: `${f * 100}% of capacity`,
              ...borrowScenario({ ...base, borrowUsd: maxBorrowUsd * f }),
            }));

        const stablePair = Boolean(USD_STABLECOINS[coll.mint] && USD_STABLECOINS[debt.mint]);
        return {
          asOf: new Date().toISOString(),
          market: kamino.market,
          slot: kamino.slot,
          collateral: {
            symbol: coll.symbol,
            amount: tokenAmount(collateralAmount),
            amountBasis,
            oraclePriceUsd: round(coll.oraclePriceUsd, 4),
            valueUsd: usd(collateralValue),
            maxLtvPct: pct(coll.maxLtv, 1),
            liquidationLtvPct: pct(coll.liquidationLtv, 1),
            supplyApyPct: pct(coll.supplyApy),
          },
          borrowAsset: {
            symbol: debt.symbol,
            borrowApyPct: pct(debt.borrowApy),
            borrowFactor: debt.borrowFactor,
            availableLiquidityUsd: usd(debt.availableLiquidityUsd),
            borrowCapReached: debt.borrowCapReached,
          },
          maxBorrowUsd: usd(maxBorrowUsd),
          maxBorrowAmount: tokenAmount(maxBorrowUsd / debt.oraclePriceUsd),
          scenarios,
          existingKaminoLoan: existing
            ? {
                obligation: existing.obligation,
                depositsUsd: usd(existing.depositsUsd),
                borrowsUsd: usd(existing.borrowsUsd),
                currentLtvPct: pct(existing.currentLtv),
                note: "Scenarios combine this existing loan with the new collateral and borrow.",
              }
            : null,
          notes: [
            stablePair
              ? "Collateral and debt are both stablecoins: liquidation would come from a depeg or accrued interest, not market moves."
              : `Liquidation price assumes only ${coll.symbol} moves; borrowing at 100% of capacity leaves almost no buffer.`,
            "Borrow APY is variable and moves with reserve utilization.",
          ],
          source: KAMINO_SOURCE,
        };
      },
    ),
  );
}
