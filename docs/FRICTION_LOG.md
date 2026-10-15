# RANUS — Friction Log

A record of what slowed us down while building RANUS, how we resolved it, and what would have helped. The empty template at the bottom can be copied for new entries.

## Log

| # | Area | What happened | Impact | Resolution / workaround | Suggestion |
|---|---|---|---|---|---|
| 1 | Kamino SDK | `@kamino-finance/klend-sdk@13.0.2` threw `Cannot find module '@solana-program/memo'` (and needs `dotenv`) at runtime: both are required but not declared as dependencies. Its peers also pin `@solana/kit` 2.x while npm resolves 3.x by default. | ~30 min | Pinned `@solana/kit@^2.3.0`, `@solana-program/compute-budget@^0.8.0`, `@solana-program/memo@0.7.0`, `dotenv` explicitly in `mcp-server/package.json` and committed the lockfile. | Declare all runtime deps; publish a slim read-only entry point (markets + obligations) without transaction-building dependencies. |
| 2 | Kamino SDK | `stats.borrowFactor` is a percentage (100 = 1.0×), while `getBorrowFactor()` returns the fraction. Using the stat directly made borrow capacity 100× too small in our first smoke test. | ~10 min | Use `getBorrowFactor()` (clamped at ≥ 1, matching the on-chain rule). Caught by the smoke test before shipping. | Name unit-bearing fields explicitly (`borrowFactorPct`). |
| 3 | Kamino SDK | Several Kamino reserves can exist for one asset (e.g. fixed-term USDC). Picking "the USDC reserve" by symbol returned a small hidden reserve. | ~10 min | Filter `status === "Active"`, exclude fixed-rate kinds, take the largest by supply. | Expose a "canonical reserve for mint" helper. |
| 4 | Jupiter API | `lite-api.jup.ag` is being phased out in favor of keyless `api.jup.ag` at 0.5 RPS. Older guides still point at lite-api and Price V2 / Metis quote v1. | ~20 min reading | Used `api.jup.ag` with optional `x-api-key`: Tokens V2 (`/tokens/v2/search`, `/tokens/v2/tag?query=stocks`), Price V3, and Swap V2 `/order` without `taker` (quote-only). Added a request queue + caches. | A single "current endpoints" page that clearly lists deprecated vs. current paths. |
| 5 | Amazon Bedrock | Two Bedrock integrations (legacy `InvokeModel`/Converse with ARN model IDs vs. the Messages-API `bedrock-mantle` endpoint with `anthropic.` model IDs) have similar docs; their feature tables differ (e.g. automatic prompt caching). | ~15 min | Used `AnthropicBedrockMantle` with explicit cache breakpoints, which work on both. | Cross-link feature tables and show the model-ID format prominently. |
| 6 | Amazon Bedrock | Model access is per model: Opus 5.5 is gated while Opus 4.8 is open to all customers. | Setup risk for judges | Default `BEDROCK_MODEL_ID=anthropic.claude-opus-5-5`, documented one-line switch to `anthropic.claude-opus-4-8`; the UI shows a precise error on 401/403/404. | An endpoint to list models callable by the current principal. |
| 7 | MCP | zod → JSON Schema output includes `$schema`. | Minor | Stripped before passing tool schemas to the model. | Offer an LLM-ready schema export option. |
| 8 | Development environment | Our cloud dev sandbox's egress policy blocked `api.jup.ag` and `yields.llama.fi` (Solana RPC and Bedrock were reachable), and its AWS credentials were not valid for Bedrock. | Couldn't exercise those paths live during development | Implemented Jupiter and DefiLlama strictly from their published OpenAPI specs/source; verified Solana + Kamino end-to-end live; verified the agent loop's request/stream handling against the Bedrock Mantle wire format. **Run `npm run smoke -- <wallet>` on an open network before recording.** | — |
| 9 | Vercel + Turbopack | Importing the MCP workspace package (TypeScript using NodeNext-style `./file.js` import specifiers) into Next.js 16 failed: Turbopack doesn't map `.js` specifiers to `.ts` sources in transpiled packages. | ~15 min | Switched the package to extensionless relative imports with `moduleResolution: "Bundler"` (`tsx` runs the standalone server unchanged) and `transpilePackages: ["ranus-mcp-server"]`. | Support `extensionAlias`-style resolution in Turbopack. |
| 10 | Vercel + AWS | Vercel Functions preset `AWS_REGION` to the function's region and expose `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` values that aren't usable AWS credentials, so the AWS default credential chain silently picks the wrong identity. | Deployment risk | Credentials resolve in a fixed order — `AWS_BEARER_TOKEN_BEDROCK` → `RANUS_AWS_ROLE_ARN` (Vercel OIDC via `@vercel/functions/oidc`) → `RANUS_AWS_*` keys — and on Vercel RANUS refuses to fall back to the runtime's `AWS_*` values, showing a clear setup message instead. `BEDROCK_AWS_REGION` overrides the preset region. | — |
| 11 | Vercel | A separate long-running MCP server process doesn't fit Vercel Functions. | Design change | The MCP server became a package served by a Next.js route at `/mcp` (stateless Streamable HTTP with the SDK's web-standard transport); the agent uses the same server over an in-memory MCP transport, avoiding self-HTTP calls through deployment protection. | — |
| 12 | Vercel + Next.js | On the deployment every live panel failed with `Unexpected end of JSON input`: a route module that throws while loading gets an empty 500 from Next.js, so the browser had nothing to parse and the cause was hidden. | ~1 h | Every API route imports the MCP/Bedrock stacks inside `try/catch` and returns the exception as JSON (and logs it under `[ranus]`). The UI shows HTTP status and body for any non-JSON reply. | Return an error body (or at least log the load error prominently) for route module-load failures. |
| 13 | Solana web3.js (transitive) | That error then read `ERR_REQUIRE_ESM: require() of ES Module …/rpc-websockets/node_modules/uuid/dist-node/index.js`: `rpc-websockets@9.3.9` (via `@solana/web3.js` ← Kamino SDK) `require()`s the ESM-only `uuid@14`. It worked locally because Node 22.12+ allows `require(esm)`; the Vercel function runtime refused it. | Production outage of all live data | `"overrides": { "rpc-websockets": "9.3.8" }` in the root `package.json` (9.3.8 uses `uuid@11`, which ships CommonJS). Verified by running the built Vercel functions with `node --no-experimental-require-module`. | Libraries: don't `require()` ESM-only deps from CJS builds. Vercel: document whether `require(esm)` is enabled per Node runtime. |

## Template

Copy this block for each new item:

```markdown
### <short title>

- **Date / time spent:**
- **Area:** (Bedrock · MCP · Alexa+ · Solana RPC · Kamino · Jupiter · DefiLlama · Web client · Tooling · Docs)
- **What I was trying to do:**
- **What happened (exact error / behavior):**
- **Expected:**
- **Impact:** (blocked / slowed / annoyance)
- **Workaround / resolution:**
- **Suggestion for the product team:**
```
