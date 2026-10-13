import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fromBaseUnits, pct, round, toBaseUnits, tokenAmount, usd } from "../lib/format.js";
import { getSwapQuote, JUPITER_SOURCE } from "../sources/jupiter.js";
import { getKaminoMarketSnapshot, getKaminoObligations, KAMINO_SOURCE, pickReserve } from "../sources/kamino.js";
import { SOL_MINT } from "../sources/registry.js";
import { getWalletBalances, parseWallet, type WalletBalances } from "../sources/solana.js";
import { resolveToken } from "../sources/tokens.js";
import { borrowScenario } from "./borrow.js";
import { handle } from "./common.js";

interface Check {
  check: string;
  passed: boolean;
  detail: string;
}

const FEE_RESERVE_SOL = 0.01;
const PREVIEW_NOTICE = "Preview only. RANUS never builds, signs or submits transactions — you confirm and sign in your own wallet app.";

function walletAmount(balances: WalletBalances, mint: string): number {
  return mint === SOL_MINT ? balances.sol : (balances.tokens.find((t) => t.mint === mint)?.amount ?? 0);
}

function balanceChecks(balances: WalletBalances | null, mint: string, symbol: string, amount: number): Check[] {
  if (!balances) return [];
  const have = walletAmount(balances, mint);
  const needSol = mint === SOL_MINT ? amount + FEE_RESERVE_SOL : FEE_RESERVE_SOL;
  return [
    {
      check: `Wallet holds enough ${symbol}`,
      passed: have >= amount,
      detail: `Balance ${tokenAmount(have)} ${symbol}, needs ${tokenAmount(amount)}.`,
    },
    {
      check: "SOL available for network fees",
      passed: balances.sol >= needSol,
      detail: `Balance ${tokenAmount(balances.sol)} SOL; keep at least ${FEE_RESERVE_SOL} SOL for fees and token accounts.`,
    },
  ];
}

export function registerActionTool(server: McpServer) {
  server.registerTool(
    "prepare_action",
    {
      title: "Prepare an action (real quote, no execution)",
      description:
        "Prepares a transaction preview from live data without executing it: " +
        "'swap' gets a real Jupiter Swap V2 quote (output amount, minimum received after slippage, price impact, route, fees) " +
        "and cross-checks it against Kamino's on-chain oracle; 'kamino_deposit' previews lending a token on Kamino at the live " +
        "supply APY with utilization/withdrawal-liquidity checks; 'kamino_borrow' previews borrowing against the wallet's existing " +
        "Kamino collateral at the live borrow APY with the resulting LTV and liquidation distance. Includes balance/fee checks when " +
        "a wallet is given and explicit confirmation steps. Never signs or sends anything.",
      inputSchema: {
        action: z.enum(["swap", "kamino_deposit", "kamino_borrow"]),
        inputToken: z.string().describe("Token to sell / deposit / borrow — symbol (USDC, SOL, JitoSOL, TSLAx) or mint."),
        outputToken: z.string().optional().describe("For swaps: token to receive, symbol or mint."),
        amount: z.number().positive().describe("Amount of inputToken, in token units (e.g. 25.5 USDC)."),
        slippageBps: z.number().int().min(1).max(500).default(50).describe("Swap slippage tolerance in basis points. Default 50 (0.5%)."),
        wallet: z.string().optional().describe("Solana wallet for balance checks (required for kamino_borrow)."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    handle(
      async (args: {
        action: "swap" | "kamino_deposit" | "kamino_borrow";
        inputToken: string;
        outputToken?: string;
        amount: number;
        slippageBps: number;
        wallet?: string;
      }) => {
        const wallet = args.wallet ? parseWallet(args.wallet) : undefined;
        const balancesPromise = wallet ? getWalletBalances(wallet) : Promise.resolve(null);
        const input = await resolveToken(args.inputToken);

        if (args.action === "swap") {
          if (!args.outputToken) throw new Error("outputToken is required for a swap.");
          const output = await resolveToken(args.outputToken);
          if (output.mint === input.mint) throw new Error("Input and output tokens are the same.");
          const amountRaw = toBaseUnits(args.amount, input.decimals);
          const [quote, balances, kamino] = await Promise.all([
            getSwapQuote({ inputMint: input.mint, outputMint: output.mint, amountRaw, slippageBps: args.slippageBps }),
            balancesPromise,
            getKaminoMarketSnapshot().catch(() => null),
          ]);
          if (quote.error || quote.errorMessage) throw new Error(`Jupiter could not quote this swap: ${quote.errorMessage ?? quote.error}`);

          const outAmount = fromBaseUnits(quote.outAmount, output.decimals);
          const minReceived = quote.otherAmountThreshold ? fromBaseUnits(quote.otherAmountThreshold, output.decimals) : null;
          const checks: Check[] = [...balanceChecks(balances, input.mint, input.symbol, args.amount)];
          if (typeof quote.priceImpact === "number") {
            checks.push({
              check: "Price impact under 1%",
              passed: Math.abs(quote.priceImpact) < 1,
              detail: `Jupiter reports ${round(quote.priceImpact, 4)}% price impact.`,
            });
          }
          let oracleCheck: Record<string, unknown> | null = null;
          const inRes = kamino ? pickReserve(kamino, input.mint) : undefined;
          const outRes = kamino ? pickReserve(kamino, output.mint) : undefined;
          if (inRes && outRes) {
            const expected = (args.amount * inRes.oraclePriceUsd) / outRes.oraclePriceUsd;
            const deviation = (outAmount - expected) / expected;
            oracleCheck = { expectedOutAtOraclePrices: tokenAmount(expected), deviationPct: pct(deviation, 3), source: `${KAMINO_SOURCE} oracle` };
            checks.push({
              check: "Quote within 1% of on-chain oracle prices",
              passed: Math.abs(deviation) < 0.01,
              detail: `Quote is ${pct(deviation, 2)}% vs. the oracle-implied amount.`,
            });
          }
          return {
            status: "preview_only",
            notice: PREVIEW_NOTICE,
            action: "swap",
            asOf: new Date().toISOString(),
            quote: {
              sell: { symbol: input.symbol, mint: input.mint, amount: tokenAmount(args.amount), usdValue: quote.inUsdValue ?? null },
              receive: { symbol: output.symbol, mint: output.mint, amount: tokenAmount(outAmount), usdValue: quote.outUsdValue ?? null },
              effectivePrice: `1 ${input.symbol} = ${tokenAmount(outAmount / args.amount)} ${output.symbol}`,
              minimumReceived: minReceived === null ? null : tokenAmount(minReceived),
              slippageBps: quote.slippageBps ?? args.slippageBps,
              priceImpactPct: quote.priceImpact ?? null,
              route: (quote.routePlan ?? []).map((s) => ({ venue: s.swapInfo.label, percent: s.percent })),
              router: quote.router ?? null,
              feeBps: quote.feeBps ?? null,
              networkFeesLamports: {
                signature: quote.signatureFeeLamports ?? null,
                priority: quote.prioritizationFeeLamports ?? null,
                rent: quote.rentFeeLamports ?? null,
              },
              quoteRequestId: quote.requestId ?? null,
            },
            oracleCrossCheck: oracleCheck,
            checks,
            readyToConfirm: checks.every((c) => c.passed),
            confirmationSteps: [
              `Review: sell ${tokenAmount(args.amount)} ${input.symbol} for about ${tokenAmount(outAmount)} ${output.symbol}` +
                (minReceived !== null ? ` (at least ${tokenAmount(minReceived)} after ${(quote.slippageBps ?? args.slippageBps) / 100}% slippage).` : "."),
              "Open jup.ag (or your wallet's swap screen), enter the same tokens and amount, and compare the live quote — quotes expire within seconds.",
              "Approve the transaction in your wallet only if the amounts match.",
            ],
            sources: [JUPITER_SOURCE, ...(oracleCheck ? [KAMINO_SOURCE] : [])],
          };
        }

        const kamino = await getKaminoMarketSnapshot();
        const reserve = pickReserve(kamino, input.mint);
        if (!reserve) throw new Error(`${input.symbol} is not an active asset in the Kamino main market.`);
        const balances = await balancesPromise;
        const valueUsd = args.amount * reserve.oraclePriceUsd;

        if (args.action === "kamino_deposit") {
          const checks: Check[] = [
            ...balanceChecks(balances, input.mint, input.symbol, args.amount),
            { check: "Reserve deposit cap not reached", passed: !reserve.depositCapReached, detail: `Deposit cap reached: ${reserve.depositCapReached}.` },
            {
              check: "Withdrawal liquidity healthy (utilization < 95%)",
              passed: reserve.utilization < 0.95,
              detail: `Utilization ${pct(reserve.utilization, 1)}%, $${usd(reserve.availableLiquidityUsd)} available to withdraw.`,
            },
          ];
          const apy = reserve.supplyApy + reserve.reserveRewardsApr;
          return {
            status: "preview_only",
            notice: PREVIEW_NOTICE,
            action: "kamino_deposit",
            asOf: new Date().toISOString(),
            slot: kamino.slot,
            preview: {
              deposit: { symbol: reserve.symbol, amount: tokenAmount(args.amount), valueUsd: usd(valueUsd) },
              reserve: reserve.reserve,
              liveSupplyApyPct: pct(apy),
              projectedAnnualYield: { tokens: tokenAmount(args.amount * apy), usd: usd(valueUsd * apy) },
              projectedMonthlyYieldUsd: usd((valueUsd * apy) / 12),
              usableAsCollateral: reserve.maxLtv > 0,
              maxLtvPct: pct(reserve.maxLtv, 1),
            },
            checks,
            readyToConfirm: checks.every((c) => c.passed),
            confirmationSteps: [
              `Open app.kamino.finance → Lend → ${reserve.symbol} (main market) and deposit ${tokenAmount(args.amount)} ${reserve.symbol}.`,
              "Check the APY shown in the app matches this preview (rates move every block).",
              "Approve the deposit in your wallet. You can withdraw any time liquidity is available.",
            ],
            sources: [KAMINO_SOURCE],
          };
        }

        // kamino_borrow
        if (!wallet) throw new Error("kamino_borrow needs the wallet whose Kamino collateral would back the loan.");
        const obligations = await getKaminoObligations(wallet);
        const existing = [...obligations].sort((a, b) => b.depositsUsd - a.depositsUsd)[0];
        if (!existing || existing.depositsUsd <= 0) {
          throw new Error("This wallet has no Kamino collateral yet. Use simulate_borrow to plan a deposit-and-borrow first.");
        }
        const scenario = borrowScenario({
          collateral: reserve, // no new collateral is added; amount 0 below
          collateralAmount: 0,
          debt: reserve,
          borrowUsd: valueUsd,
          existing,
        });
        const checks: Check[] = [
          { check: "Within Kamino borrow limit", passed: scenario.withinBorrowLimit, detail: `Resulting LTV ${scenario.ltvPct}%.` },
          {
            check: "At least 20% collateral buffer to liquidation",
            passed: scenario.collateralDropToLiquidationPct >= 20,
            detail: `Collateral could fall ${scenario.collateralDropToLiquidationPct}% before liquidation.`,
          },
          { check: "Reserve has enough liquidity", passed: scenario.enoughReserveLiquidity, detail: `$${usd(reserve.availableLiquidityUsd)} available.` },
          { check: "Borrow cap not reached", passed: !reserve.borrowCapReached, detail: `Borrow cap reached: ${reserve.borrowCapReached}.` },
          ...(balances
            ? [{ check: "SOL available for network fees", passed: balances.sol >= FEE_RESERVE_SOL, detail: `Balance ${tokenAmount(balances.sol)} SOL.` }]
            : []),
        ];
        return {
          status: "preview_only",
          notice: PREVIEW_NOTICE,
          action: "kamino_borrow",
          asOf: new Date().toISOString(),
          slot: kamino.slot,
          preview: {
            borrow: { symbol: reserve.symbol, amount: tokenAmount(args.amount), valueUsd: usd(valueUsd) },
            liveBorrowApyPct: pct(reserve.borrowApy),
            annualInterestUsd: scenario.annualInterestUsd,
            existingLoan: {
              obligation: existing.obligation,
              depositsUsd: usd(existing.depositsUsd),
              borrowsUsd: usd(existing.borrowsUsd),
              currentLtvPct: pct(existing.currentLtv),
            },
            afterBorrow: {
              ltvPct: scenario.ltvPct,
              liquidationLtvPct: pct(existing.liquidationLtv),
              collateralDropToLiquidationPct: scenario.collateralDropToLiquidationPct,
            },
          },
          checks,
          readyToConfirm: checks.every((c) => c.passed),
          confirmationSteps: [
            `Open app.kamino.finance → your main-market position → Borrow ${tokenAmount(args.amount)} ${reserve.symbol}.`,
            "Confirm the app's projected LTV matches this preview, and set a personal price alert above your liquidation level.",
            "Approve in your wallet only if you're comfortable with the liquidation buffer.",
          ],
          sources: [KAMINO_SOURCE],
        };
      },
    ),
  );
}

