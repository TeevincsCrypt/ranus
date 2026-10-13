import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorMessage, pct, round, tokenAmount, usd } from "../lib/format";
import { getKaminoMarketSnapshot, pickReserve, type KaminoMarketSnapshot, type KaminoObligationSnapshot } from "../sources/kamino";
import { buildPortfolio, type Portfolio } from "../sources/portfolio";
import { SOL_MINT, USDC_MINT, USD_STABLECOINS } from "../sources/registry";
import { parseWallet } from "../sources/solana";
import { handle, READ_ONLY_ANNOTATIONS, walletSchema } from "./common";

type Severity = "high" | "medium" | "low" | "info";

interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  evidence: Record<string, unknown>;
  suggestion?: string;
}

const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1, info: 0 };
const MIN_SOL_FOR_FEES = 0.01;

function liquidationFindings(o: KaminoObligationSnapshot, kamino: KaminoMarketSnapshot | null): Finding[] {
  const findings: Finding[] = [];
  if (o.borrowsUsd <= 0.01) return findings;

  const drop = o.collateralDropToLiquidation ?? 1;
  const severity: Severity = drop < 0.1 ? "high" : drop < 0.25 ? "medium" : "low";
  const allStable =
    o.deposits.every((d) => USD_STABLECOINS[d.mint]) && o.borrows.every((b) => USD_STABLECOINS[b.mint]);
  findings.push({
    id: `liquidation:${o.obligation}`,
    severity,
    title: `Kamino loan is ${pct(drop, 1)}% away from liquidation`,
    detail: allStable
      ? `Collateral and debt are both stablecoins, so the main risks are a depeg between them and interest accrual pushing LTV up. Current LTV ${pct(o.currentLtv)}% vs liquidation at ${pct(o.liquidationLtv)}%.`
      : `If collateral prices fall about ${pct(drop, 1)}% (debt unchanged), the position can be liquidated. Current LTV ${pct(o.currentLtv)}% vs liquidation at ${pct(o.liquidationLtv)}%.`,
    evidence: {
      obligation: o.obligation,
      depositsUsd: usd(o.depositsUsd),
      borrowsUsd: usd(o.borrowsUsd),
      currentLtvPct: pct(o.currentLtv),
      liquidationLtvPct: pct(o.liquidationLtv),
      borrowLimitUsd: usd(o.borrowLimitUsd),
      liquidationThresholdUsd: usd(o.liquidationThresholdUsd),
    },
    suggestion:
      severity === "low"
        ? undefined
        : `Repaying ${usd(Math.max(0, o.borrowsAdjustedUsd - o.liquidationThresholdUsd * 0.7))} USD of debt (or adding equivalent collateral) would bring the buffer to ~30%.`,
  });

  if (o.borrowsAdjustedUsd > o.borrowLimitUsd) {
    findings.push({
      id: `over-borrow-limit:${o.obligation}`,
      severity: "medium",
      title: "Loan is above its max borrowing LTV",
      detail:
        "The position is past Kamino's borrow limit (but not yet at liquidation): you cannot borrow more or withdraw collateral until LTV falls.",
      evidence: { borrowsAdjustedUsd: usd(o.borrowsAdjustedUsd), borrowLimitUsd: usd(o.borrowLimitUsd) },
    });
  }

  // Interest drift: with prices flat, borrow interest vs supply interest moves LTV over time.
  if (kamino) {
    const byReserve = new Map(kamino.reserves.map((r) => [r.reserve, r]));
    let debtGrowthAdj = 0;
    let limitGrowth = 0;
    let annualInterestUsd = 0;
    let annualSupplyIncomeUsd = 0;
    let complete = true;
    for (const b of o.borrows) {
      const r = byReserve.get(b.reserve);
      if (!r) complete = false;
      else {
        annualInterestUsd += b.valueUsd * r.borrowApy;
        debtGrowthAdj += b.valueUsd * r.borrowApy * r.borrowFactor;
      }
    }
    for (const d of o.deposits) {
      const r = byReserve.get(d.reserve);
      if (!r) complete = false;
      else {
        annualSupplyIncomeUsd += d.valueUsd * r.supplyApy;
        limitGrowth += d.valueUsd * r.supplyApy * r.liquidationLtv;
      }
    }
    if (complete) {
      const headroom = o.liquidationThresholdUsd - o.borrowsAdjustedUsd;
      const dailyCreep = (debtGrowthAdj - limitGrowth) / 365;
      const days = dailyCreep > 0 && headroom > 0 ? headroom / dailyCreep : null;
      findings.push({
        id: `interest-drift:${o.obligation}`,
        severity: days !== null && days < 90 ? "high" : days !== null && days < 365 ? "medium" : "info",
        title:
          days !== null
            ? `At today's rates, interest alone reaches liquidation in ~${Math.round(days)} days`
            : "Interest earned covers interest owed at today's rates",
        detail: `Live Kamino rates: you pay about $${usd(annualInterestUsd)}/yr in borrow interest and earn about $${usd(annualSupplyIncomeUsd)}/yr on collateral (prices held constant).`,
        evidence: {
          annualBorrowInterestUsd: usd(annualInterestUsd),
          annualSupplyIncomeUsd: usd(annualSupplyIncomeUsd),
          liquidationHeadroomUsd: usd(headroom),
          daysToLiquidationFromInterest: days === null ? null : Math.round(days),
        },
      });
    }

    for (const d of o.deposits) {
      const r = byReserve.get(d.reserve);
      if (r && r.utilization > 0.95) {
        findings.push({
          id: `withdraw-liquidity:${d.reserve}`,
          severity: "medium",
          title: `${d.symbol} reserve is ${pct(r.utilization, 1)}% utilized`,
          detail: "When nearly all deposits are lent out, withdrawals can be delayed until borrowers repay or rates pull in new supply.",
          evidence: { reserve: d.reserve, utilizationPct: pct(r.utilization, 1), availableLiquidityUsd: usd(r.availableLiquidityUsd) },
        });
      }
    }
  }
  return findings;
}

function walletFindings(p: Portfolio, kamino: KaminoMarketSnapshot | null): Finding[] {
  const findings: Finding[] = [];
  const total = p.walletValueUsd;

  // Idle digital dollars earning nothing in the wallet.
  const idle = p.holdings.filter((h) => h.assetClass === "cash_stablecoin" && (h.valueUsd ?? 0) >= 1);
  const idleUsd = idle.reduce((s, h) => s + (h.valueUsd ?? 0), 0);
  if (idleUsd >= 1) {
    const usdc = kamino ? pickReserve(kamino, USDC_MINT) : undefined;
    const perAsset = idle.map((h) => {
      const r = kamino ? pickReserve(kamino, h.mint) : undefined;
      return {
        symbol: h.symbol,
        valueUsd: usd(h.valueUsd ?? 0),
        kaminoSupplyApyPct: r ? pct(r.supplyApy) : null,
        foregoneAnnualUsd: r ? usd((h.valueUsd ?? 0) * r.supplyApy) : null,
      };
    });
    const foregone = perAsset.reduce((s, a) => s + (a.foregoneAnnualUsd ?? 0), 0);
    findings.push({
      id: "idle-dollars",
      severity: foregone >= 10 ? "medium" : "low",
      title: `$${usd(idleUsd)} in stablecoins is sitting idle at 0%`,
      detail: usdc
        ? `Kamino's main USDC reserve currently pays ${pct(usdc.supplyApy)}% APY (variable). Idle dollars forego about $${usd(foregone)} per year at today's rates.`
        : "Live lending rates were unavailable, so foregone yield could not be computed.",
      evidence: { idleUsd: usd(idleUsd), perAsset },
      suggestion: "Keep a cash buffer for spending, and consider lending the rest or holding tokenized Treasuries (see suggest_allocation).",
    });
  }

  // Stablecoin depeg check on live prices.
  for (const h of p.holdings) {
    if (h.assetClass !== "cash_stablecoin" || h.priceUsd === null) continue;
    const deviation = Math.abs(h.priceUsd - 1);
    if (deviation > 0.005) {
      findings.push({
        id: `depeg:${h.mint}`,
        severity: deviation > 0.02 ? "high" : "medium",
        title: `${h.symbol} is trading at $${round(h.priceUsd, 4)}`,
        detail: `Live price deviates ${pct(deviation)}% from $1.00 (${h.priceSource}).`,
        evidence: { symbol: h.symbol, priceUsd: round(h.priceUsd, 4), priceSource: h.priceSource },
      });
    }
  }

  // Concentration in a single volatile asset.
  const volatile = p.holdings.filter((h) => !["cash_stablecoin", "tokenized_treasury"].includes(h.assetClass));
  const top = volatile[0];
  if (top && total > 0 && (top.valueUsd ?? 0) / total > 0.5) {
    findings.push({
      id: "concentration",
      severity: (top.valueUsd ?? 0) / total > 0.8 ? "medium" : "low",
      title: `${pct((top.valueUsd ?? 0) / total, 0)}% of the wallet is in ${top.symbol}`,
      detail: "A single volatile asset dominates the wallet, so its price moves drive most of your dollar value.",
      evidence: { symbol: top.symbol, valueUsd: usd(top.valueUsd ?? 0), walletValueUsd: usd(total), change24hPct: top.priceChange24hPct },
    });
  }

  // Gas: SOL is needed to pay network fees.
  const sol = p.holdings.find((h) => h.mint === SOL_MINT);
  const solAmount = sol?.amount ?? 0;
  if (solAmount < MIN_SOL_FOR_FEES) {
    findings.push({
      id: "low-sol-for-fees",
      severity: "medium",
      title: `Only ${tokenAmount(solAmount)} SOL for network fees`,
      detail: `Solana transactions need SOL for fees and new token accounts; under ~${MIN_SOL_FOR_FEES} SOL some actions may fail.`,
      evidence: { sol: tokenAmount(solAmount) },
    });
  }

  if (p.hiddenTokens.count > 0) {
    findings.push({
      id: "unknown-tokens",
      severity: "info",
      title: `${p.hiddenTokens.count} unverified or dust tokens hidden`,
      detail: "Unsolicited airdropped tokens are a common phishing vector — don't visit links in their metadata or try to sell them on unknown sites.",
      evidence: { count: p.hiddenTokens.count },
    });
  }
  return findings;
}

export function registerRiskTool(server: McpServer) {
  server.registerTool(
    "analyze_risk",
    {
      title: "Risk & opportunity scan (live)",
      description:
        "Scans a wallet's real positions for: Kamino liquidation risk (live LTV vs liquidation LTV, collateral drop to " +
        "liquidation, interest-driven LTV drift at live borrow/supply rates, reserve withdrawal liquidity), idle stablecoins " +
        "and the yield they forgo at live Kamino rates, stablecoin depegs on live prices, single-asset concentration, low SOL " +
        "for fees, and unverified airdropped tokens. Returns findings ranked by severity with the live evidence behind each.",
      inputSchema: { wallet: walletSchema },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    handle(async ({ wallet }: { wallet: string }) => {
      const address = parseWallet(wallet);
      const [portfolio, kamino] = await Promise.all([
        buildPortfolio(address),
        getKaminoMarketSnapshot().catch((err) => {
          return { error: errorMessage(err) } as const;
        }),
      ]);
      const market = "error" in kamino ? null : kamino;
      const findings = [
        ...portfolio.kamino.obligations.flatMap((o) => liquidationFindings(o, market)),
        ...walletFindings(portfolio, market),
      ].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
      const overall = findings.reduce<Severity>(
        (worst, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[worst] ? f.severity : worst),
        "info",
      );
      return {
        wallet,
        asOf: new Date().toISOString(),
        overallRisk: overall,
        walletValueUsd: usd(portfolio.walletValueUsd),
        kaminoNetValueUsd: usd(portfolio.kaminoNetValueUsd),
        findings,
        sources: portfolio.sources,
        warnings: [...portfolio.warnings, ...("error" in kamino ? [`Kamino market data unavailable: ${kamino.error}`] : [])],
      };
    }),
  );
}
