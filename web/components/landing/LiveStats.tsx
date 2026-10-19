"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { fmtPct, fmtUsd, timeAgo } from "@/lib/format";
import { callPanelTool } from "@/lib/tools";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Snapshot = any;

interface Stat {
  key: string;
  tone: string;
  label: string;
  value: string | null;
  detail: ReactNode;
  source: string;
  missing?: string;
}

function buildStats(d: Snapshot): Stat[] {
  const kamino: Snapshot[] = [...(d.dollarYields?.kamino ?? [])]
    .filter((o) => !o.depositCapReached)
    .sort((a, b) => b.apyPct - a.apyPct);
  const best = kamino[0];
  const usdy = d.tokenizedTreasuries?.usdy;
  const sol = d.sol;
  const lst = [...(sol?.liquidStaking ?? [])].sort((a: Snapshot, b: Snapshot) => b.apyPct - a.apyPct)[0];
  const stocks = d.tokenizedStocks;
  const why = (errors: unknown) => (Array.isArray(errors) && errors.length ? errors.join("; ") : typeof errors === "string" ? errors : "source unavailable");

  return [
    {
      key: "kamino",
      tone: "var(--yellow)",
      label: best ? `Best stablecoin yield · ${best.symbol}` : "Best stablecoin yield",
      value: best ? fmtPct(best.apyPct) : null,
      detail: best && (
        <>
          Kamino Lend supply APY · {fmtPct(best.utilizationPct, 0)} utilized · {fmtUsd(best.tvlUsd, { compact: true })} supplied
        </>
      ),
      source: d.dollarYields?.kaminoSlot ? `Solana on-chain · slot ${d.dollarYields.kaminoSlot}` : "Solana on-chain",
      missing: best ? undefined : why(d.dollarYields?.errors),
    },
    {
      key: "usdy",
      tone: "var(--mint)",
      label: "Tokenized T-bills · USDY",
      value: usdy?.apyPct != null ? fmtPct(usdy.apyPct) : null,
      detail: usdy && <>Ondo US Dollar Yield{usdy.priceUsd != null ? ` · price ${fmtUsd(usdy.priceUsd)}` : ""}</>,
      source: "DefiLlama Yields · Jupiter",
      missing: usdy?.apyPct != null ? undefined : why(d.tokenizedTreasuries?.errors),
    },
    {
      key: "sol",
      tone: "var(--blue)",
      label: "SOL price",
      value: sol?.solPriceUsd != null ? fmtUsd(sol.solPriceUsd) : null,
      detail: sol && (
        <>
          {sol.kaminoSolSupplyApyPct != null ? `Lend on Kamino ${fmtPct(sol.kaminoSolSupplyApyPct)}` : ""}
          {lst ? ` · stake as ${lst.symbol} ${fmtPct(lst.apyPct)}` : ""}
        </>
      ),
      source: sol?.solPriceSource ?? "Kamino oracle",
      missing: sol?.solPriceUsd != null ? undefined : why(sol?.errors),
    },
    {
      key: "stocks",
      tone: "var(--pink)",
      label: "Tokenized stocks with live prices",
      value: stocks?.totalListed ? String(stocks.totalListed) : null,
      detail: stocks?.stocks?.length > 0 && (
        <>
          {stocks.stocks
            .slice(0, 3)
            .map((s: Snapshot) => `${s.symbol} ${fmtUsd(s.priceUsd)}`)
            .join(" · ")}
        </>
      ),
      source: "Jupiter Tokens & Price API",
      missing: stocks?.totalListed ? undefined : why(stocks?.error),
    },
  ];
}

/** The landing page's proof: four numbers pulled live from the RANUS MCP server when the page opens. */
export function LiveStats() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await callPanelTool("get_market_snapshot", {}));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="live-board">
      <div className="live-head">
        <span className="live-dot" aria-hidden />
        <span>{data ? `Fetched ${timeAgo(data.asOf)} through the MCP tool get_market_snapshot` : loading ? "Calling get_market_snapshot…" : "Live data"}</span>
        <button type="button" className="chip-btn" onClick={() => void load()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      {error && <p className="live-error">Live data unavailable: {error}</p>}
      <div className="live-grid">
        {(data ? buildStats(data) : PLACEHOLDERS).map((s) => (
          <article className={`stat stat-${s.key} ${data ? "" : "loading"}`} key={s.key} style={{ background: s.tone }}>
            <span className="stat-label">{s.label}</span>
            {data ? (
              s.value ? (
                <strong className="stat-value">{s.value}</strong>
              ) : (
                <strong className="stat-value muted">n/a</strong>
              )
            ) : (
              <span className="stat-skeleton" aria-hidden />
            )}
            {data && <span className="stat-detail">{s.value ? s.detail : `Unavailable: ${s.missing}`}</span>}
            <span className="stat-source">{s.source}</span>
          </article>
        ))}
      </div>
    </div>
  );
}

const PLACEHOLDERS: Stat[] = [
  { key: "kamino", tone: "var(--yellow)", label: "Best stablecoin yield", value: null, detail: null, source: "Solana on-chain" },
  { key: "usdy", tone: "var(--mint)", label: "Tokenized T-bills · USDY", value: null, detail: null, source: "DefiLlama Yields · Jupiter" },
  { key: "sol", tone: "var(--blue)", label: "SOL price", value: null, detail: null, source: "Kamino oracle" },
  { key: "stocks", tone: "var(--pink)", label: "Tokenized stocks with live prices", value: null, detail: null, source: "Jupiter Tokens & Price API" },
];
