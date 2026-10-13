import { address, type Address } from "@solana/kit";
import {
  DEFAULT_RECENT_SLOT_DURATION_MS,
  getCurrentLedgerInstant,
  KaminoMarket,
  PROGRAM_ID,
  type KaminoObligation,
  type KaminoReserve,
} from "@kamino-finance/klend-sdk";
import { config } from "../config";
import { cached } from "../lib/cache";
import { UpstreamError } from "../lib/http";
import { rpc } from "./solana";

/**
 * Kamino Lend data, read directly from Solana mainnet with Kamino's official SDK
 * (@kamino-finance/klend-sdk). Reserve APYs, LTVs and liquidation thresholds come from
 * on-chain reserve state; prices come from the reserves' on-chain oracles (Scope/Pyth).
 */

export const KAMINO_SOURCE = "Kamino Lend (on-chain via @kamino-finance/klend-sdk)";

export interface KaminoReserveSnapshot {
  reserve: string;
  symbol: string;
  mint: string;
  decimals: number;
  oraclePriceUsd: number;
  /** Fractions, e.g. 0.0475 = 4.75%. */
  supplyApy: number;
  borrowApy: number;
  /** Extra supply-side APR from Kamino's reserve-rewards distribution (0 when disabled). */
  reserveRewardsApr: number;
  maxLtv: number;
  liquidationLtv: number;
  borrowFactor: number;
  utilization: number;
  totalSupply: number;
  totalSupplyUsd: number;
  totalBorrow: number;
  totalBorrowUsd: number;
  availableLiquidity: number;
  availableLiquidityUsd: number;
  depositCapReached: boolean;
  borrowCapReached: boolean;
  fixedRate: boolean;
}

export interface KaminoMarketSnapshot {
  market: string;
  source: string;
  slot: number;
  blockTime: string;
  reserves: KaminoReserveSnapshot[];
}

interface LoadedMarket {
  market: KaminoMarket;
  instant: Awaited<ReturnType<typeof getCurrentLedgerInstant>>;
}

function loadMarket(): Promise<LoadedMarket> {
  return cached("kamino:market", 30_000, async () => {
    try {
      // The SDK is typed against its own @solana/kit RPC interfaces; our RPC is the same kit client.
      const sdkRpc = rpc as unknown as Parameters<typeof KaminoMarket.load>[0];
      const market = await KaminoMarket.load(
        sdkRpc,
        address(config.kaminoMarket),
        DEFAULT_RECENT_SLOT_DURATION_MS,
        PROGRAM_ID,
      );
      if (!market) throw new Error(`market ${config.kaminoMarket} not found`);
      const instant = await getCurrentLedgerInstant(rpc as unknown as Parameters<typeof getCurrentLedgerInstant>[0]);
      return { market, instant };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new UpstreamError("Kamino Lend", `failed to load market from chain (${message})`);
    }
  });
}

function snapshotReserve(r: KaminoReserve, instant: LoadedMarket["instant"]): KaminoReserveSnapshot {
  const factor = r.getMintFactor();
  const price = r.getOracleMarketPrice().toNumber();
  const totalSupply = r.getTotalSupply().div(factor).toNumber();
  const totalBorrow = r.getBorrowedAmount().div(factor).toNumber();
  const available = r.getLiquidityAvailableAmount().div(factor).toNumber();
  let rewardsApr = 0;
  try {
    rewardsApr = r.calculateEffectiveReserveRewardsSupplyAPR(instant, 0);
  } catch {
    rewardsApr = 0;
  }
  return {
    reserve: r.address,
    symbol: r.stats.symbol,
    mint: r.stats.mintAddress,
    decimals: r.stats.decimals,
    oraclePriceUsd: price,
    supplyApy: r.totalSupplyAPY(instant),
    borrowApy: r.totalBorrowAPY(instant),
    reserveRewardsApr: rewardsApr,
    maxLtv: r.stats.loanToValue,
    liquidationLtv: r.stats.liquidationThreshold,
    // On-chain max(1, borrowFactorPct / 100): debt weight used against borrow and liquidation limits.
    borrowFactor: Math.max(1, r.getBorrowFactor().toNumber()),
    utilization: r.calculateUtilizationRatio(),
    totalSupply,
    totalSupplyUsd: totalSupply * price,
    totalBorrow,
    totalBorrowUsd: totalBorrow * price,
    availableLiquidity: available,
    availableLiquidityUsd: available * price,
    depositCapReached: r.depositLimitCrossed(),
    borrowCapReached: r.borrowLimitCrossed(),
    fixedRate: r.getKind().isFixedRate(),
  };
}

/** All active reserves of the Kamino main market with live rates and risk parameters. */
export async function getKaminoMarketSnapshot(): Promise<KaminoMarketSnapshot> {
  const { market, instant } = await loadMarket();
  const reserves: KaminoReserveSnapshot[] = [];
  for (const r of market.reserves.values()) {
    if (r.stats.status !== "Active") continue;
    try {
      reserves.push(snapshotReserve(r, instant));
    } catch {
      // Skip a reserve whose state cannot be evaluated rather than reporting partial numbers.
    }
  }
  reserves.sort((a, b) => b.totalSupplyUsd - a.totalSupplyUsd);
  return {
    market: config.kaminoMarket,
    source: KAMINO_SOURCE,
    slot: Number(instant.slot),
    blockTime: new Date(Number(instant.blockTime) * 1000).toISOString(),
    reserves,
  };
}

/**
 * The canonical (largest, floating-rate, active) Kamino reserve for a mint or symbol.
 * Kamino can list several reserves per asset (e.g. fixed-term ones); we pick the main pool.
 */
export function pickReserve(snapshot: KaminoMarketSnapshot, mintOrSymbol: string): KaminoReserveSnapshot | undefined {
  const needle = mintOrSymbol.trim().toUpperCase();
  return snapshot.reserves
    .filter((r) => !r.fixedRate && (r.mint === mintOrSymbol.trim() || r.symbol.toUpperCase() === needle))
    .sort((a, b) => b.totalSupplyUsd - a.totalSupplyUsd)[0];
}

export interface KaminoPosition {
  symbol: string;
  mint: string;
  reserve: string;
  amount: number;
  valueUsd: number;
}

export interface KaminoObligationSnapshot {
  obligation: string;
  market: string;
  deposits: KaminoPosition[];
  borrows: KaminoPosition[];
  depositsUsd: number;
  borrowsUsd: number;
  /** Borrows weighted by each reserve's borrow factor — what Kamino's risk engine compares to limits. */
  borrowsAdjustedUsd: number;
  netValueUsd: number;
  borrowLimitUsd: number;
  liquidationThresholdUsd: number;
  currentLtv: number;
  liquidationLtv: number;
  /** How far all collateral prices could fall (together, debt unchanged) before liquidation. */
  collateralDropToLiquidation: number | null;
}

function toPositions(obligation: KaminoObligation, kind: "deposits" | "borrows", market: KaminoMarket): KaminoPosition[] {
  const positions = kind === "deposits" ? obligation.getDeposits() : obligation.getBorrows();
  return positions.map((p) => {
    const reserve = market.getReserveByAddress(p.reserveAddress);
    return {
      symbol: reserve?.stats.symbol ?? p.mintAddress,
      mint: p.mintAddress,
      reserve: p.reserveAddress,
      amount: p.amount.div(p.mintFactor).toNumber(),
      valueUsd: p.marketValueRefreshed.toNumber(),
    };
  });
}

/** Every Kamino main-market obligation (loan account) owned by the wallet, refreshed at the current slot. */
export async function getKaminoObligations(wallet: Address): Promise<KaminoObligationSnapshot[]> {
  return cached(`kamino:obligations:${wallet}`, 20_000, async () => {
    const { market, instant } = await loadMarket();
    let obligations: KaminoObligation[];
    try {
      obligations = await market.getAllUserObligations(wallet, instant);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new UpstreamError("Kamino Lend", `failed to read obligations (${message})`);
    }
    return obligations
      .map((o) => {
        const s = o.refreshedStats;
        const borrowsAdjusted = s.userTotalBorrowBorrowFactorAdjusted.toNumber();
        const liqLimit = s.borrowLiquidationLimit.toNumber();
        return {
          obligation: o.obligationAddress,
          market: config.kaminoMarket,
          deposits: toPositions(o, "deposits", market),
          borrows: toPositions(o, "borrows", market),
          depositsUsd: s.userTotalDeposit.toNumber(),
          borrowsUsd: s.userTotalBorrow.toNumber(),
          borrowsAdjustedUsd: borrowsAdjusted,
          netValueUsd: s.netAccountValue.toNumber(),
          borrowLimitUsd: s.borrowLimit.toNumber(),
          liquidationThresholdUsd: liqLimit,
          currentLtv: s.loanToValue.toNumber(),
          liquidationLtv: s.liquidationLtv.toNumber(),
          collateralDropToLiquidation: borrowsAdjusted > 0 && liqLimit > 0 ? Math.max(0, 1 - borrowsAdjusted / liqLimit) : null,
        };
      })
      .filter((o) => o.depositsUsd > 0.005 || o.borrowsUsd > 0.005);
  });
}
