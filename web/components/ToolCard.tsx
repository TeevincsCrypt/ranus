"use client";

import type { CSSProperties, ReactNode } from "react";
import type { ToolCallView } from "@/lib/events";
import { TOOL_THEME_BY_NAME } from "@/lib/brand";
import { fmtAmount, fmtPct, fmtUsd, timeAgo } from "@/lib/format";
import { ART } from "./brand/Art";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Data = any;

export const TOOL_LABELS: Record<string, { label: string; source: string }> = {
  get_portfolio_summary: { label: "Portfolio snapshot", source: "Solana RPC · Jupiter · Kamino" },
  get_market_snapshot: { label: "Live market data", source: "Kamino · DefiLlama · Jupiter" },
  analyze_risk: { label: "Risk scan", source: "Solana RPC · Kamino" },
  suggest_allocation: { label: "Allocation plan", source: "Kamino · DefiLlama · Jupiter" },
  simulate_borrow: { label: "Borrow simulation", source: "Kamino on-chain" },
  explain_concept: { label: "Explainer", source: "Live data" },
  prepare_action: { label: "Action preview", source: "Jupiter · Kamino" },
};

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="kv">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Portfolio({ d }: { d: Data }) {
  return (
    <>
      <div className="kv-grid">
        <Row label="Net worth" value={fmtUsd(d.netWorthUsd)} />
        <Row label="In wallet" value={fmtUsd(d.walletValueUsd)} />
        <Row label="On Kamino (net)" value={fmtUsd(d.kaminoNetValueUsd)} />
      </div>
      {Array.isArray(d.allocation) && d.allocation.length > 0 && (
        <div className="alloc-bar" aria-label="Allocation">
          {d.allocation.map((a: Data) => (
            <span key={a.assetClass} className={`seg seg-${a.assetClass}`} style={{ width: `${Math.max(a.sharePct, 1.5)}%` }} title={`${a.label}: ${fmtPct(a.sharePct, 1)}`} />
          ))}
        </div>
      )}
      <div className="chips">
        {(d.holdings ?? []).slice(0, 6).map((h: Data) => (
          <span className="chip" key={h.mint}>
            {h.symbol} <em>{fmtUsd(h.valueUsd)}</em>
          </span>
        ))}
      </div>
    </>
  );
}

function Market({ d }: { d: Data }) {
  const rows = [
    ...(d.dollarYields?.kamino ?? []).slice(0, 4).map((o: Data) => ({ name: `${o.symbol} · Kamino`, apy: o.apyPct, extra: `${fmtPct(o.utilizationPct, 0)} used` })),
    ...(d.tokenizedTreasuries?.usdy?.apyPct != null ? [{ name: "USDY · Ondo", apy: d.tokenizedTreasuries.usdy.apyPct, extra: "T-bills" }] : []),
    ...(d.dollarYields?.otherProtocols ?? []).slice(0, 3).map((o: Data) => ({ name: `${o.symbol} · ${o.protocol}`, apy: o.apyPct, extra: fmtUsd(o.tvlUsd, { compact: true }) })),
  ];
  return (
    <>
      {rows.length > 0 && (
        <table className="mini">
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="num">{fmtPct(r.apy)}</td>
                <td className="muted">{r.extra}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {d.sol?.solPriceUsd != null && <Row label="SOL" value={fmtUsd(d.sol.solPriceUsd)} />}
      {(d.tokenizedStocks?.stocks ?? []).length > 0 && (
        <div className="chips">
          {d.tokenizedStocks.stocks.slice(0, 5).map((s: Data) => (
            <span className="chip" key={s.mint}>
              {s.symbol} <em>{fmtUsd(s.priceUsd)}</em>
            </span>
          ))}
        </div>
      )}
    </>
  );
}

function Risk({ d }: { d: Data }) {
  return (
    <ul className="findings">
      {(d.findings ?? []).slice(0, 6).map((f: Data) => (
        <li key={f.id}>
          <span className={`sev sev-${f.severity}`}>{f.severity}</span>
          {f.title}
        </li>
      ))}
      {(d.findings ?? []).length === 0 && <li>No risks found.</li>}
    </ul>
  );
}

function Allocation({ d }: { d: Data }) {
  return (
    <>
      <div className="kv-grid">
        <Row label="Amount" value={fmtUsd(d.amountUsd)} />
        <Row label="Profile" value={d.riskProfile} />
        <Row label="Projected / yr" value={fmtUsd(d.projectedAnnualIncomeUsd)} />
      </div>
      <div className="buckets">
        {(d.buckets ?? []).map((b: Data) => (
          <div className="bucket" key={b.bucket}>
            <div className="bucket-head">
              <span>{String(b.bucket).replace(/_/g, " ")}</span>
              <span>
                {b.weightPct}% · {fmtUsd(b.amountUsd)} {b.liveApyPct != null && <em>@ {fmtPct(b.liveApyPct)}</em>}
              </span>
            </div>
            <div className="bar">
              <span style={{ width: `${b.weightPct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Borrow({ d }: { d: Data }) {
  return (
    <>
      <div className="kv-grid">
        <Row label="Collateral" value={`${fmtAmount(d.collateral?.amount)} ${d.collateral?.symbol} (${fmtUsd(d.collateral?.valueUsd)})`} />
        <Row label="Max LTV / liq." value={`${fmtPct(d.collateral?.maxLtvPct, 0)} / ${fmtPct(d.collateral?.liquidationLtvPct, 0)}`} />
        <Row label={`${d.borrowAsset?.symbol} borrow APY`} value={fmtPct(d.borrowAsset?.borrowApyPct)} />
      </div>
      <table className="mini">
        <thead>
          <tr>
            <th>Borrow</th>
            <th className="num">LTV</th>
            <th className="num">Liq. price</th>
            <th className="num">Buffer</th>
          </tr>
        </thead>
        <tbody>
          {(d.scenarios ?? []).map((s: Data) => (
            <tr key={s.label}>
              <td>{fmtUsd(s.borrowUsd)}</td>
              <td className="num">{fmtPct(s.ltvPct, 1)}</td>
              <td className="num">{fmtUsd(s.liquidationPriceUsd)}</td>
              <td className="num">{fmtPct(s.collateralDropToLiquidationPct, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Explain({ d }: { d: Data }) {
  return (
    <>
      <p className="explain-title">{d.title}</p>
      {(d.personalized ?? []).map((p: string) => (
        <p className="explain-line" key={p}>
          {p}
        </p>
      ))}
    </>
  );
}

function Action({ d }: { d: Data }) {
  const q = d.quote;
  const p = d.preview;
  return (
    <>
      <span className="badge-preview">Preview only · not executed</span>
      {q && (
        <div className="kv-grid">
          <Row label="Sell" value={`${fmtAmount(q.sell?.amount)} ${q.sell?.symbol}`} />
          <Row label="Receive ≈" value={`${fmtAmount(q.receive?.amount)} ${q.receive?.symbol}`} />
          <Row label="Min. received" value={`${fmtAmount(q.minimumReceived)} ${q.receive?.symbol}`} />
          <Row label="Price impact" value={q.priceImpactPct == null ? "—" : `${Number(q.priceImpactPct).toFixed(3)}%`} />
        </div>
      )}
      {p?.deposit && (
        <div className="kv-grid">
          <Row label="Deposit" value={`${fmtAmount(p.deposit.amount)} ${p.deposit.symbol}`} />
          <Row label="Live APY" value={fmtPct(p.liveSupplyApyPct)} />
          <Row label="Projected / yr" value={fmtUsd(p.projectedAnnualYield?.usd)} />
        </div>
      )}
      {p?.borrow && (
        <div className="kv-grid">
          <Row label="Borrow" value={`${fmtAmount(p.borrow.amount)} ${p.borrow.symbol}`} />
          <Row label="LTV after" value={fmtPct(p.afterBorrow?.ltvPct)} />
          <Row label="Buffer to liq." value={fmtPct(p.afterBorrow?.collateralDropToLiquidationPct, 1)} />
        </div>
      )}
      <ul className="checks">
        {(d.checks ?? []).map((c: Data) => (
          <li key={c.check} className={c.passed ? "pass" : "fail"}>
            <span aria-hidden>{c.passed ? "✓" : "✕"}</span> {c.check}
          </li>
        ))}
      </ul>
    </>
  );
}

const RENDERERS: Record<string, (props: { d: Data }) => ReactNode> = {
  get_portfolio_summary: Portfolio,
  get_market_snapshot: Market,
  analyze_risk: Risk,
  suggest_allocation: Allocation,
  simulate_borrow: Borrow,
  explain_concept: Explain,
  prepare_action: Action,
};

function argsSummary(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  return Object.entries(input as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${typeof v === "string" && v.length > 16 ? `${v.slice(0, 4)}…${v.slice(-4)}` : JSON.stringify(v)}`)
    .join(", ");
}

export function ToolCard({ call }: { call: ToolCallView }) {
  const meta = TOOL_LABELS[call.name] ?? { label: call.name, source: "MCP" };
  const Renderer = RENDERERS[call.name];
  const data = call.result as Data;
  const asOf = data && typeof data === "object" ? data.asOf : undefined;
  const theme = TOOL_THEME_BY_NAME[call.name];
  const Art = theme ? ART[theme.art] : null;
  return (
    <div className={`tool-card ${call.status}`} style={{ "--tool-bg": theme?.bg ?? "var(--pill)" } as CSSProperties}>
      <div className="tool-head">
        <span className="tool-icon" aria-hidden>
          {Art && <Art size={30} />}
        </span>
        <span className="tool-title">
          <span className="tool-label">{meta.label}</span>
          <code className="tool-name">{call.name}</code>
        </span>
        <span className="tool-meta">
          <span className={`dot ${call.status}`} aria-hidden />
          {call.status === "running" ? "calling…" : `${call.durationMs ?? 0} ms`}
          {asOf ? ` · ${timeAgo(asOf)}` : ""}
        </span>
      </div>
      {argsSummary(call.input) && <div className="tool-args">{argsSummary(call.input)}</div>}
      {call.status === "ok" && Renderer && data && typeof data === "object" && (
        <div className="tool-body">
          <Renderer d={data} />
        </div>
      )}
      {call.status === "error" && <div className="tool-error">{String(call.result)}</div>}
      {call.status !== "running" && (
        <details className="raw">
          <summary>Live data ({meta.source})</summary>
          <pre>{typeof call.result === "string" ? call.result : JSON.stringify(call.result, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
