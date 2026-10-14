# RANUS — Demo Video Script (< 3 minutes)

**Goal:** show a real wallet, real multi-step tool use against live sources, and a useful answer — in under three minutes.
**Setup before recording:** your Vercel deployment (or `npm run dev` locally) with Bedrock credentials configured; Chrome (for voice); a wallet that holds some stablecoins and/or SOL (ideally one with a Kamino loan). Run `npm run smoke -- <WALLET>` once so caches are warm and you know every source is reachable. Never show your `.env`.

---

### 0:00 – 0:15 · Hook

**Screen:** RANUS home — the voice orb, the live "dollar yields" panel already showing Kamino rates with a slot number.

**Voice-over:**
> "Millions of people in emerging markets hold digital dollars to escape inflation — but they're left asking: is my money safe, is it earning anything, and what should I do next? This is RANUS, an Alexa+-style agent that answers those questions with real, live data."

### 0:15 – 0:35 · Connect a real wallet

**Screen:** Click **Phantom** (or paste a public address). The wallet panel fills in: net worth, allocation bar, holdings, and — if present — the Kamino loan health bar.

**Voice-over:**
> "I connect my wallet read-only — RANUS never asks for keys or signatures. These are my actual balances, read from Solana a second ago. Note the slot number: this is live chain state."

### 0:35 – 1:25 · The complex question (multi-step tool use)

**Screen:** Tap the **mic** and ask:
> "What's the safest way to hold my dollars right now?"

Let the screen show, in order:
1. The **reasoning summary** streaming (Claude on Amazon Bedrock planning).
2. Tool cards appearing: `get_portfolio_summary`, `get_market_snapshot`, then `suggest_allocation` — each with arguments, latency, and a compact view of live data.
3. Expand one card's **Live data** to show raw JSON with `asOf`, `slot`, and `sources`.

**Voice-over (while tools run):**
> "Claude, running on Amazon Bedrock, plans the work and calls tools on the RANUS MCP server: my holdings from Solana RPC, stablecoin lending rates read directly from Kamino's on-chain reserves, Ondo's tokenized Treasury yield, and Jupiter prices. Every card is a real call; every number is live."

**Screen:** The answer appears and is **spoken aloud** (first sentence), followed by a short table of options with live APYs and the projected yearly income on *my* balance.

### 1:25 – 2:05 · Risk & borrowing

**Screen:** Type or say:
> "Am I at risk of liquidation? And how much could I borrow against my SOL?"

Show `analyze_risk` (severity badges: e.g. "Kamino loan is 8.5% away from liquidation", "$X in stablecoins idle at 0%") and `simulate_borrow` (scenario table: LTV, liquidation price, buffer).

**Voice-over:**
> "RANUS checks my real Kamino position against live liquidation thresholds — even how many days until interest alone pushes me to liquidation — and simulates borrowing with Kamino's on-chain oracle price and borrow rate."

### 2:05 – 2:35 · Prepare an action (real quote, no execution)

**Screen:** Ask:
> "Get me a quote to swap 25 USDC to SOL."

Show the `prepare_action` card: **Preview only** badge, amount out, minimum received, price impact, route, and checks (balance ✓, fees ✓, quote within 1% of the on-chain oracle ✓).

**Voice-over:**
> "When I'm ready to act, RANUS prepares a real Jupiter quote and cross-checks it against the on-chain oracle — but it never signs anything. I confirm in my own wallet."

### 2:35 – 2:55 · Under the hood & close

**Screen:** Briefly show the top bar ("MCP · 7 tools", "Amazon Bedrock · claude-opus-5-5"), then the README architecture diagram.

**Voice-over:**
> "RANUS is a standards-based MCP server over Streamable HTTP — ready for Alexa+ or any MCP host — with Amazon Bedrock as its brain. No mock data, anywhere. RANUS: stable value and global assets, explained in your own numbers."

---

**Recording tips**
- Keep `RANUS_EFFORT=medium` (or `low`) for snappier responses on camera.
- If a source is rate-limited, RANUS will say so on screen — that's honest behavior, but warm the caches first for a smooth take.
- Use a wallet you're comfortable showing publicly; blur the address if you prefer.
