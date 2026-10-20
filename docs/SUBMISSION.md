# RANUS — submission draft

Copy-ready text for the hackathon submission form. Replace the `<…>` placeholders before submitting.

---

## Name

RANUS — Autonomous Dollar & Asset Intelligence Agent

## Tagline (short pitch)

An Alexa+-style voice agent that reads your real Solana wallet and live markets, then explains the safest way to hold, earn on and borrow against digital dollars, with every number sourced and nothing mocked.

## Links

- Live app: https://ranus.vercel.app (landing) · https://ranus.vercel.app/app (assistant)
- Public MCP endpoint: https://ranus.vercel.app/mcp (stateless Streamable HTTP)
- Code: https://github.com/TeevincsCrypt/ranus
- Demo video: `<video link>`

## Track

- **Primary track:** Alexa+
- **Mini-challenge:** AWS Builder

---

## Inspiration

Millions of people in emerging markets now hold U.S.-dollar stablecoins to escape inflation, and tokenized Treasuries and stocks are a click away. But the questions that matter are hard to answer without being a DeFi expert. Is my money safe? Is it earning anything? How close is my loan to liquidation? What should I do next? We wanted an assistant you can simply *ask*, out loud, that answers from your real positions and live markets instead of generic advice.

## What it does

RANUS is a voice-first, Alexa+-style agent for digital dollars and tokenized assets on Solana:

- **Portfolio intelligence:** reads SOL and token balances from Solana RPC, prices them (Jupiter, with Kamino's on-chain oracles as a fallback), classifies holdings (digital dollars, tokenized Treasuries, tokenized stocks, SOL/LSTs) and includes Kamino lending positions with live LTV.
- **Risk detection:** liquidation distance, interest-driven LTV drift, withdrawal liquidity, idle stablecoins and the yield they forgo, stablecoin depegs, concentration, low SOL for fees.
- **Strategy:** the safest ways to hold dollars right now (Kamino reserves on-chain, Ondo USDY, other Solana protocols), borrow capacity with liquidation prices, and an allocation split with a published policy.
- **Action previews:** real Jupiter swap quotes and Kamino deposit/borrow previews with balance, fee and liquidity checks. RANUS never signs or submits anything; you sign in your own wallet.
- **Education:** APY vs APR, LTV, depegs and tokenized Treasuries, explained with the user's own numbers.

Every tool call is visible in the UI with its arguments, latency, data age and the raw live JSON. **There is no mock data anywhere:** if a source is down, RANUS says so.

## How we built it

- **Amazon Bedrock** is the reasoning engine: Claude (Opus 4.8 in our deployment) through the Messages-API endpoint (`bedrock-mantle`) with the Anthropic Bedrock SDK. A multi-step tool loop runs the tool calls of each step in parallel, with adaptive thinking, effort control, prompt caching, streaming and a forced final answer at the step cap. AWS-native auth: IAM (SigV4), Vercel OIDC role, or Bedrock bearer tokens.
- **MCP server** (TypeScript, official SDK) with 7 tools, served at `/mcp` as stateless Streamable HTTP. The same server powers the Bedrock agent (in-process MCP transport) and the live UI panels, and any external MCP host can attach to it.
- **Live data:** Solana RPC (`@solana/kit`), Kamino Lend on-chain (`@kamino-finance/klend-sdk`), Jupiter Tokens/Price/Swap APIs, DefiLlama Yields.
- **Web client:** Next.js 16 + React 19 simulating an Alexa+ client: push-to-talk speech recognition and spoken replies (Web Speech API), read-only wallet connect (Wallet Standard), tool cards, and a landing page that shows live numbers fetched through the MCP server.
- **Hosting:** one Vercel project serving the UI, the Bedrock agent (streaming SSE) and the public MCP endpoint.

## Challenges we ran into

- **Bedrock account access:** our first AWS account had every Bedrock quota applied at 0, so Claude returned "not available for this account" and Amazon Nova returned "Too many tokens per day". We made RANUS surface AWS's exact reason and request ID, filed quota requests, and moved to a second account.
- **Quota math:** Bedrock reserves input + `max_tokens` against tokens-per-minute when a call starts, so a hard-coded 64k `max_tokens` would throttle every call on a 20k quota. We made it configurable.
- **Vercel runtime:** a transitive Solana dependency `require()`d an ESM-only `uuid`, which works on Node 22.12+ locally but fails on Vercel. We pinned a CommonJS-safe version, and changed every route to return failures as JSON instead of empty 500s.
- **Live API shapes:** we built against published specs from a sandbox that blocked some APIs. The first live run caught a Jupiter response that didn't match its spec, and we added a tolerant parser with a live fallback.

The full friction log is in `docs/FRICTION_LOG.md`.

## Accomplishments we're proud of

- A strict no-mock-data system: every balance, price, APY, LTV and quote is live, with sources and timestamps on every tool result.
- One MCP server reused by three consumers: the Bedrock agent, the UI panels and any external MCP host.
- Real risk math from Kamino's own SDK (borrow factor, liquidation LTV, refreshed obligations) instead of approximations.
- A friendly, voice-first experience built around safety: read-only, previews only, and the user always signs.

## What we learned

- Agent quality depends on tool design: small, composable tools with sources and `asOf` fields let the model cite and cross-check.
- Clear error reporting saves hours in production: two of our hardest deployment bugs surfaced only once errors became visible.
- New AWS accounts can start with restrictive Bedrock quotas. Check Service Quotas before demo day.

## What's next

- A real Alexa+ device flow, attaching the RANUS MCP server to an Alexa+ host.
- Alerts: "tell me if my loan gets within 10% of liquidation".
- More chains and issuers (EVM stablecoin yields, more tokenized Treasuries).
- Localized voice for emerging-market languages.

## Built with

Amazon Bedrock · Claude · Model Context Protocol · TypeScript · Next.js · React · Vercel · Solana · Kamino · Jupiter · DefiLlama · Web Speech API · Wallet Standard

---

## Testing instructions (for judges)

1. Open https://ranus.vercel.app to see the live numbers fetched through the MCP server.
2. Open https://ranus.vercel.app/app. Chat is protected by an access code to cap Bedrock spend: **`<access code>`**.
3. Paste a public Solana address, for example our demo wallet `<demo wallet address>`, or connect Phantom/Solflare read-only.
4. Ask: *"What's the safest way to hold my dollars right now?"* or *"Scan my wallet for risks and idle cash."*
5. MCP endpoint, from any MCP client or the repo's smoke test:
   ```bash
   RANUS_MCP_URL=https://ranus.vercel.app/mcp npm run smoke -- <solana address>
   ```

The live panels and `/mcp` need no access code.
