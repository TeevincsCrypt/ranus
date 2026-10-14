"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtPct, fmtUsd, timeAgo } from "@/lib/format";
import { callPanelTool } from "./WalletPanel";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Snapshot = any;

/** Live "where can a dollar earn right now" panel, refreshed every minute. */
export function MarketPanel() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await callPanelTool("get_market_snapshot", { sections: ["dollar_yields", "tokenized_treasuries", "sol"] }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  const kamino: Snapshot[] = data?.dollarYields?.kamino ?? [];
  const usdy = data?.tokenizedTreasuries?.usdy;
  const others: Snapshot[] = data?.dollarYields?.otherProtocols ?? [];
  const errors: string[] = [
    ...(data?.dollarYields?.errors ?? []),
    ...(data?.tokenizedTreasuries?.errors ?? []),
    ...(data?.sol?.errors ?? []),
  ];

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Live dollar yields</h2>
        <button className="btn-link" onClick={() => void load()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      {error && <p className="panel-error">{error}</p>}
      {!data && !error && <div className="skeleton" />}
      {data && (
        <>
          <table className="yields">
            <tbody>
              {kamino.slice(0, 5).map((o) => (
                <tr key={o.mint}>
                  <td>
                    <strong>{o.symbol}</strong>
                    <small>Kamino · {fmtPct(o.utilizationPct, 0)} utilized</small>
                  </td>
                  <td className="num">{fmtPct(o.apyPct)}</td>
                </tr>
              ))}
              {usdy?.apyPct != null && (
                <tr>
                  <td>
                    <strong>USDY</strong>
                    <small>Ondo · tokenized T-bills</small>
                  </td>
                  <td className="num">{fmtPct(usdy.apyPct)}</td>
                </tr>
              )}
              {others.slice(0, 3).map((o) => (
                <tr key={`${o.protocol}-${o.symbol}`}>
                  <td>
                    <strong>{o.symbol}</strong>
                    <small>
                      {o.protocol} · TVL {fmtUsd(o.tvlUsd, { compact: true })}
                    </small>
                  </td>
                  <td className="num">{fmtPct(o.apyPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.sol?.solPriceUsd != null && (
            <p className="sol-price">
              SOL {fmtUsd(data.sol.solPriceUsd)} <small>({data.sol.solPriceSource})</small>
            </p>
          )}
          <p className="panel-foot">
            Variable rates · {timeAgo(data.asOf)}
            {data.dollarYields?.kaminoSlot ? ` · slot ${data.dollarYields.kaminoSlot}` : ""}
          </p>
          {errors.length > 0 && <p className="panel-warn">Some sources unavailable: {errors.join("; ")}</p>}
        </>
      )}
    </section>
  );
}
