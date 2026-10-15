"use client";

import type { Wallet } from "@wallet-standard/base";
import { useCallback, useEffect, useState } from "react";
import { fmtAmount, fmtPct, fmtUsd, shortAddress, timeAgo } from "@/lib/format";
import { callPanelTool } from "@/lib/tools";
import { PieArt } from "./brand/Art";
import { connectWallet, disconnectWallet, listSolanaWallets, looksLikeSolanaAddress, onWalletsChanged } from "@/lib/wallet";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Portfolio = any;

const CLASS_COLORS: Record<string, string> = {
  cash_stablecoin: "var(--c-cash)",
  tokenized_treasury: "var(--c-treasury)",
  tokenized_stock: "var(--c-stock)",
  sol: "var(--c-sol)",
  liquid_staked_sol: "var(--c-lst)",
  other: "var(--c-other)",
};

export function WalletPanel({ wallet, onWalletChange }: { wallet: string | null; onWalletChange: (address: string | null) => void }) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [connected, setConnected] = useState<Wallet | null>(null);
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const refresh = () => setWallets(listSolanaWallets());
    refresh();
    return onWalletsChanged(refresh);
  }, []);

  const load = useCallback(async (address: string) => {
    setLoading(true);
    setError(null);
    try {
      setPortfolio(await callPanelTool("get_portfolio_summary", { wallet: address }));
    } catch (err) {
      setPortfolio(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (wallet) void load(wallet);
    else setPortfolio(null);
  }, [wallet, load]);

  async function connect(w: Wallet) {
    setError(null);
    try {
      const address = await connectWallet(w);
      setConnected(w);
      onWalletChange(address);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function submitManual() {
    const value = manual.trim();
    if (!looksLikeSolanaAddress(value)) {
      setError("That doesn't look like a Solana address (base58, 32–44 characters).");
      return;
    }
    setManual("");
    onWalletChange(value);
  }

  async function disconnect() {
    await disconnectWallet(connected);
    setConnected(null);
    onWalletChange(null);
  }

  if (!wallet) {
    return (
      <section className="panel panel-pink">
        <PieArt className="panel-art" size={64} />
        <h2>Your wallet</h2>
        <p className="panel-hint">Connect read-only or paste any public Solana address. RANUS never asks for keys or signatures.</p>
        <div className="wallet-buttons">
          {wallets.map((w) => (
            <button key={w.name} className="btn btn-wallet" onClick={() => void connect(w)}>
              {/* Wallet-provided icon (data URI) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={w.icon} alt="" width={18} height={18} />
              {w.name}
            </button>
          ))}
          {wallets.length === 0 && <p className="panel-hint small">No browser wallet detected — paste an address instead.</p>}
        </div>
        <div className="address-input">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitManual()}
            placeholder="Solana address…"
            aria-label="Solana wallet address"
            spellCheck={false}
          />
          <button className="btn" onClick={submitManual}>
            Use
          </button>
        </div>
        {error && <p className="panel-error">{error}</p>}
      </section>
    );
  }

  return (
    <section className="panel panel-pink">
      <PieArt className="panel-art" size={64} />
      <div className="panel-head">
        <h2>Your wallet</h2>
        <div className="panel-actions">
          <button className="btn-link" onClick={() => void load(wallet)} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button className="btn-link" onClick={() => void disconnect()}>
            Disconnect
          </button>
        </div>
      </div>
      <a className="address" href={`https://solscan.io/account/${wallet}`} target="_blank" rel="noreferrer">
        {connected ? `${connected.name} · ` : ""}
        {shortAddress(wallet)} ↗
      </a>
      {error && <p className="panel-error">{error}</p>}
      {loading && !portfolio && <div className="skeleton" />}
      {portfolio && (
        <>
          <div className="networth">
            <span>Net worth</span>
            <strong>{fmtUsd(portfolio.netWorthUsd)}</strong>
          </div>
          {portfolio.allocation.length > 0 && (
            <>
              <div className="alloc-bar">
                {portfolio.allocation.map((a: Portfolio) => (
                  <span key={a.assetClass} style={{ width: `${Math.max(a.sharePct, 1.5)}%`, background: CLASS_COLORS[a.assetClass] }} />
                ))}
              </div>
              <ul className="legend">
                {portfolio.allocation.map((a: Portfolio) => (
                  <li key={a.assetClass}>
                    <i style={{ background: CLASS_COLORS[a.assetClass] }} />
                    {a.label}
                    <span>{fmtPct(a.sharePct, 1)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <ul className="holdings">
            {portfolio.holdings.slice(0, 6).map((h: Portfolio) => (
              <li key={h.mint}>
                <span className="sym">{h.symbol}</span>
                <span className="amt">{fmtAmount(h.amount)}</span>
                <span className="val">{fmtUsd(h.valueUsd)}</span>
              </li>
            ))}
            {portfolio.holdings.length === 0 && <li className="muted">No priced holdings.</li>}
          </ul>
          {portfolio.kaminoPositions.map((o: Portfolio) => {
            const used = o.liquidationLtvPct > 0 ? Math.min(100, (o.currentLtvPct / o.liquidationLtvPct) * 100) : 0;
            return (
              <div className="loan" key={o.obligation}>
                <div className="loan-head">
                  <span>Kamino loan</span>
                  <span>
                    {fmtUsd(o.borrowsUsd)} debt / {fmtUsd(o.depositsUsd)} collateral
                  </span>
                </div>
                <div className={`health ${used > 90 ? "danger" : used > 75 ? "warn" : "ok"}`}>
                  <span style={{ width: `${used}%` }} />
                </div>
                <div className="loan-foot">
                  LTV {fmtPct(o.currentLtvPct, 1)} · liquidation at {fmtPct(o.liquidationLtvPct, 0)}
                </div>
              </div>
            );
          })}
          <p className="panel-foot">
            Live · {timeAgo(portfolio.asOf)} · slot {portfolio.slot}
            {portfolio.hiddenTokens?.count > 0 && ` · ${portfolio.hiddenTokens.count} spam/dust hidden`}
          </p>
          {portfolio.warnings?.map((w: string) => (
            <p className="panel-warn" key={w}>
              {w}
            </p>
          ))}
        </>
      )}
    </section>
  );
}
