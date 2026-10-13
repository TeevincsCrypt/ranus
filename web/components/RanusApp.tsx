"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AgentEvent, ToolCallView } from "@/lib/events";
import { shortAddress, spokenSummary } from "@/lib/format";
import { useSpeech } from "@/lib/useSpeech";
import { MarketPanel } from "./MarketPanel";
import { ToolCard } from "./ToolCard";
import { WalletPanel } from "./WalletPanel";

interface UiMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  thinking: string;
  tools: ToolCallView[];
  status?: string;
  error?: string;
  streaming?: boolean;
  fallback?: { from: string; to: string };
  meta?: { model: string; steps: number; seconds: number; outputTokens: number };
}

interface Status {
  mcp: { ok: boolean; mode?: string; endpoint?: string; tools: string[]; error?: string };
  bedrock: { model: string; region: string; effort: string; auth: string; configured: boolean };
  accessCodeRequired: boolean;
}

const SUGGESTIONS = [
  "What's the safest way to hold my dollars right now?",
  "Scan my wallet for risks and idle cash.",
  "How much could I borrow against my SOL, and where would I get liquidated?",
  "Compare cash, tokenized Treasuries and tokenized stocks for $1,000.",
  "Get me a quote to swap 25 USDC to SOL.",
  "Explain APY vs APR using my own balances.",
];

const WALLET_KEY = "ranus.wallet";
const ACCESS_KEY = "ranus.accessCode";
const newId = () => Math.random().toString(36).slice(2, 10);

export function RanusApp() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [history, setHistory] = useState<unknown[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(true);
  const [status, setStatus] = useState<Status | null>(null);
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sendRef = useRef<(text: string) => void>(() => undefined);

  const speech = useSpeech((transcript) => sendRef.current(transcript));

  useEffect(() => {
    try {
      const saved = localStorage.getItem(WALLET_KEY);
      if (saved) setWallet(saved);
      setAccessCode(localStorage.getItem(ACCESS_KEY));
    } catch {
      // Storage unavailable: start without a remembered wallet.
    }
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const changeWallet = useCallback((address: string | null) => {
    setWallet(address);
    try {
      if (address) localStorage.setItem(WALLET_KEY, address);
      else localStorage.removeItem(WALLET_KEY);
    } catch {
      // Ignore storage failures.
    }
  }, []);

  const saveAccessCode = useCallback((code: string | null) => {
    setAccessCode(code);
    try {
      if (code) localStorage.setItem(ACCESS_KEY, code);
      else localStorage.removeItem(ACCESS_KEY);
    } catch {
      // Ignore storage failures.
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const patch = useCallback((id: string, fn: (m: UiMessage) => UiMessage) => {
    setMessages((all) => all.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      speech.stopSpeaking();
      setInput("");
      setBusy(true);
      const userMsg: UiMessage = { id: newId(), role: "user", text, thinking: "", tools: [] };
      const botId = newId();
      setMessages((all) => [...all, userMsg, { id: botId, role: "assistant", text: "", thinking: "", tools: [], streaming: true, status: "Starting…" }]);

      const controller = new AbortController();
      abortRef.current = controller;
      const started = Date.now();
      let answer = "";

      const handle = (event: AgentEvent) => {
        switch (event.type) {
          case "status":
            patch(botId, (m) => ({ ...m, status: event.message }));
            break;
          case "thinking":
            patch(botId, (m) => ({ ...m, thinking: m.thinking + event.delta, status: "Reasoning…" }));
            break;
          case "text":
            answer += event.delta;
            patch(botId, (m) => ({ ...m, text: m.text + event.delta, status: undefined }));
            break;
          case "tool_call":
            patch(botId, (m) => ({
              ...m,
              status: `Calling ${event.name}…`,
              tools: [...m.tools, { id: event.id, name: event.name, input: event.input, step: event.step, status: "running" }],
            }));
            break;
          case "tool_result":
            patch(botId, (m) => ({
              ...m,
              status: "Reasoning over live data…",
              tools: m.tools.map((t) =>
                t.id === event.id ? { ...t, status: event.isError ? "error" : "ok", result: event.result, durationMs: event.durationMs } : t,
              ),
            }));
            break;
          case "fallback":
            patch(botId, (m) => ({ ...m, fallback: { from: event.from, to: event.to } }));
            break;
          case "done":
            setHistory(event.history);
            patch(botId, (m) => ({
              ...m,
              streaming: false,
              status: undefined,
              meta: { model: event.model, steps: event.steps, seconds: (Date.now() - started) / 1000, outputTokens: event.usage.outputTokens },
            }));
            break;
          case "error":
            patch(botId, (m) => ({ ...m, streaming: false, status: undefined, error: event.message }));
            break;
        }
      };

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(accessCode ? { "x-ranus-access-code": accessCode } : {}) },
          body: JSON.stringify({ text, wallet, history }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          if (body.code === "access_denied") saveAccessCode(null);
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buffer.indexOf("\n\n")) >= 0) {
            const chunk = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const line = chunk.split("\n").find((l) => l.startsWith("data: "));
            if (line) handle(JSON.parse(line.slice(6)) as AgentEvent);
          }
        }
        if (speakReplies && answer) speech.speak(spokenSummary(answer));
      } catch (err) {
        const aborted = controller.signal.aborted;
        patch(botId, (m) => ({
          ...m,
          streaming: false,
          status: undefined,
          error: aborted ? "Stopped." : err instanceof Error ? err.message : String(err),
        }));
      } finally {
        patch(botId, (m) => ({ ...m, streaming: false, status: undefined }));
        abortRef.current = null;
        setBusy(false);
      }
    },
    [accessCode, busy, history, patch, saveAccessCode, speakReplies, speech, wallet],
  );
  sendRef.current = (t: string) => void send(t);

  function reset() {
    abortRef.current?.abort();
    speech.stopSpeaking();
    setMessages([]);
    setHistory([]);
  }

  const needsCode = Boolean(status?.accessCodeRequired && !accessCode);
  const orbState = speech.listening ? "listening" : busy ? "thinking" : speech.speaking ? "speaking" : "idle";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            <span />
          </span>
          <div>
            <h1>RANUS</h1>
            <p>Dollar &amp; Asset Intelligence · Alexa+ client</p>
          </div>
        </div>
        <div className="pills">
          <span
            className={`pill ${status?.mcp.ok ? "ok" : status ? "bad" : ""}`}
            title={status?.mcp.error ?? `${status?.mcp.mode ?? ""} · public endpoint: /mcp`}
          >
            MCP {status ? (status.mcp.ok ? `· ${status.mcp.tools.length} tools` : "· offline") : "· …"}
          </span>
          <span
            className={`pill ${status && !status.bedrock.configured ? "bad" : ""}`}
            title={status ? `Auth: ${status.bedrock.auth} · effort ${status.bedrock.effort}` : undefined}
          >
            Amazon Bedrock{" "}
            {status
              ? status.bedrock.configured
                ? `· ${status.bedrock.model.replace(/^anthropic\./, "")} · ${status.bedrock.region}`
                : "· not configured"
              : ""}
          </span>
          <span className="pill live">Live data</span>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <WalletPanel wallet={wallet} onWalletChange={changeWallet} />
          <MarketPanel />
        </aside>

        <main className="chat">
          <div className="messages" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="welcome">
                <div className={`orb ${orbState}`} aria-hidden>
                  <span />
                </div>
                <h2>Ask RANUS about your money</h2>
                <p>
                  {wallet
                    ? `Using live data for ${shortAddress(wallet)}. Try one of these, or tap the mic.`
                    : "Connect a wallet or paste an address for personal answers — or ask about live market yields."}
                </p>
                <div className="suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className="suggestion" onClick={() => void send(s)} disabled={busy || needsCode}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) =>
              m.role === "user" ? (
                <div className="msg user" key={m.id}>
                  <div className="bubble">{m.text}</div>
                </div>
              ) : (
                <div className="msg assistant" key={m.id}>
                  <div className={`avatar orb mini ${m.streaming ? "thinking" : "idle"}`} aria-hidden>
                    <span />
                  </div>
                  <div className="assistant-body">
                    {m.thinking && (
                      <details className="reasoning" open={m.streaming && !m.text}>
                        <summary>Reasoning{m.streaming && !m.text ? "…" : ""}</summary>
                        <p>{m.thinking}</p>
                      </details>
                    )}
                    {m.tools.length > 0 && (
                      <div className="tools">
                        {m.tools.map((t) => (
                          <ToolCard call={t} key={t.id} />
                        ))}
                      </div>
                    )}
                    {m.text && (
                      <div className="answer">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                      </div>
                    )}
                    {m.status && (
                      <div className="status-line">
                        <span className="spinner" aria-hidden /> {m.status}
                      </div>
                    )}
                    {m.error && <div className="error-line">{m.error}</div>}
                    {m.fallback && (
                      <div className="meta">
                        {m.fallback.from} declined; answered by {m.fallback.to}
                      </div>
                    )}
                    {m.meta && (
                      <div className="meta">
                        {m.tools.length} tool call{m.tools.length === 1 ? "" : "s"} · {m.meta.steps} reasoning step
                        {m.meta.steps === 1 ? "" : "s"} · {m.meta.model} on Amazon Bedrock · {m.meta.seconds.toFixed(1)}s
                        {speech.supported.speak && m.text && (
                          <button className="btn-link" onClick={() => speech.speak(spokenSummary(m.text))}>
                            ▶ Read aloud
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
          </div>

          {needsCode && (
            <form
              className="access-gate"
              onSubmit={(e) => {
                e.preventDefault();
                if (codeInput.trim()) saveAccessCode(codeInput.trim());
                setCodeInput("");
              }}
            >
              <span>This RANUS deployment is protected. Enter the access code to chat (live panels work without it).</span>
              <input
                type="password"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                placeholder="Access code"
                aria-label="Access code"
                autoComplete="off"
              />
              <button type="submit" className="btn" disabled={!codeInput.trim()}>
                Unlock
              </button>
            </form>
          )}
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              if (!needsCode) void send(input);
            }}
          >
            {speech.supported.listen && (
              <button
                type="button"
                className={`mic ${speech.listening ? "on" : ""}`}
                onClick={speech.listening ? speech.stopListening : speech.startListening}
                disabled={busy}
                aria-label={speech.listening ? "Stop listening" : "Speak to RANUS"}
                title="Push to talk"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z"
                  />
                </svg>
              </button>
            )}
            <input
              value={speech.listening ? speech.interim || "Listening…" : input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={wallet ? "Ask about your dollars, yields, loans…" : "Ask about live dollar yields, or connect a wallet…"}
              aria-label="Message RANUS"
              disabled={speech.listening}
            />
            {busy ? (
              <button type="button" className="btn send" onClick={() => abortRef.current?.abort()}>
                Stop
              </button>
            ) : (
              <button type="submit" className="btn send" disabled={!input.trim() || needsCode}>
                Ask
              </button>
            )}
          </form>
          <div className="composer-foot">
            {speech.supported.speak && (
              <label>
                <input type="checkbox" checked={speakReplies} onChange={(e) => setSpeakReplies(e.target.checked)} /> Speak replies
              </label>
            )}
            {messages.length > 0 && (
              <button className="btn-link" onClick={reset}>
                New conversation
              </button>
            )}
            <span>Read-only · RANUS never signs transactions · Not financial advice</span>
          </div>
        </main>
      </div>
    </div>
  );
}
