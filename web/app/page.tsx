import Link from "next/link";
import { CoinArt, SproutArt } from "@/components/brand/Art";
import { RanusLogo, RanusMark } from "@/components/brand/Logo";
import { ArrowIcon } from "@/components/landing/icons";
import { LiveStats } from "@/components/landing/LiveStats";
import { McpEndpoint } from "@/components/landing/McpEndpoint";
import { ToolCarousel } from "@/components/landing/ToolCarousel";
import { TOOL_THEMES } from "@/lib/brand";
import "./landing.css";

const NAV = [
  { href: "#tools", label: "Tools" },
  { href: "#live", label: "Live data" },
  { href: "#how", label: "How it works" },
  { href: "#mcp", label: "MCP" },
];

const STEPS = [
  { n: "01", title: "Ask", body: "Type or talk, Alexa+ style. Voice in and voice out, right in the browser.", tone: "var(--yellow)" },
  { n: "02", title: "Reason", body: "Claude on Amazon Bedrock plans the steps and calls RANUS's MCP tools, in parallel when it can.", tone: "var(--pink)" },
  { n: "03", title: "Fetch", body: "Tools read Solana RPC, Kamino on-chain, Jupiter and DefiLlama at the moment you ask.", tone: "var(--blue)" },
  { n: "04", title: "Decide", body: "Answers carry their sources and timestamps. Actions are previews, and you sign them yourself.", tone: "var(--mint)" },
];

/** Decorative dashed "globe" behind the hero. */
function Orbits() {
  return (
    <svg className="orbits" viewBox="0 0 1000 1000" aria-hidden preserveAspectRatio="xMidYMid meet">
      <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="5 9">
        <circle cx="500" cy="500" r="470" />
        <ellipse cx="500" cy="500" rx="250" ry="470" />
        <ellipse cx="500" cy="500" rx="470" ry="200" />
        <circle cx="500" cy="500" r="330" />
      </g>
    </svg>
  );
}

export default function Landing() {
  return (
    <div className="landing">
      <header className="l-nav">
        <Link href="/" className="l-brand" aria-label="RANUS home">
          <RanusLogo size={36} />
        </Link>
        <nav aria-label="Sections">
          <ul className="l-pills">
            {NAV.map((item) => (
              <li key={item.href}>
                <a href={item.href}>{item.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <Link href="/app" className="l-open">
          Open app <ArrowIcon direction="up-right" size={16} />
        </Link>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <Orbits />
        <SproutArt className="float float-sprout" size={92} />
        <CoinArt className="float float-coin" size={84} />

        <p className="hero-kicker">
          Your AI agent
          <br />
          for dollars &amp;
          <br />
          real assets
        </p>

        <div className="hero-title">
          <h1 id="hero-title">
            <span className="hero-line one">
              Make
              <span className="hero-mark" aria-hidden>
                <RanusMark size="100%" />
              </span>
            </span>
            <span className="hero-line two">
              <span>dollars</span> <span>work!</span>
            </span>
          </h1>
          <Link href="/app" className="try-pill">
            Try it <ArrowIcon direction="up-right" size={20} />
          </Link>
        </div>

        <div id="tools" className="hero-cards">
          <ToolCarousel />
        </div>
      </section>

      <section id="live" className="l-section">
        <div className="l-section-head">
          <h2>
            Live,
            <br />
            not mocked.
          </h2>
          <p>
            Every number RANUS shows comes from a live source when you ask: Solana mainnet, Kamino&apos;s on-chain reserves, Jupiter
            and DefiLlama. If a source is down, RANUS says so instead of guessing. These numbers were fetched when this page opened.
          </p>
        </div>
        <LiveStats />
      </section>

      <section id="how" className="l-section">
        <div className="l-section-head">
          <h2>
            Ask out loud.
            <br />
            Get real answers.
          </h2>
          <p>
            RANUS is a simulated Alexa+ client. An Amazon Bedrock agent reasons over several steps and calls a self-hosted MCP
            server for every fact it needs.
          </p>
        </div>
        <ol className="steps">
          {STEPS.map((s) => (
            <li key={s.n} className="step" style={{ background: s.tone }}>
              <span className="step-n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="mcp" className="l-section">
        <div className="mcp-block">
          <div className="mcp-copy">
            <h2>
              One MCP server.
              <br />
              Any assistant.
            </h2>
            <p>
              RANUS&apos;s tools are a standard MCP server over Streamable HTTP. Point any MCP client at this deployment: an
              Alexa+ integration, Claude or your own agent. It is read-only, never holds keys, and can be locked with a bearer token.
            </p>
            <McpEndpoint />
          </div>
          <ul className="mcp-tools" aria-label="MCP tools">
            {TOOL_THEMES.map((t) => (
              <li key={t.tool} style={{ background: t.bg, color: t.ink }}>
                <code>{t.tool}</code>
                <span>{t.title}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="l-cta">
        <RanusMark size={120} className="cta-mark" />
        <h2>Ready? Ask RANUS.</h2>
        <Link href="/app" className="try-pill big">
          Open the app <ArrowIcon direction="up-right" size={22} />
        </Link>
      </section>

      <footer className="l-foot">
        <RanusLogo size={26} />
        <p>Built for the Amazon Developer Hackathon · Alexa+ track · AWS Builder. Read-only, educational, not financial advice.</p>
      </footer>
    </div>
  );
}
