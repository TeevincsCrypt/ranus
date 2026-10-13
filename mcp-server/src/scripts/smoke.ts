/**
 * End-to-end check of the running RANUS MCP server over Streamable HTTP, against live data.
 *
 *   npm run smoke -- <SOLANA_WALLET_ADDRESS>
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { config } from "../config.js";

const wallet = process.argv[2];
if (!wallet) {
  console.error("Usage: npm run smoke -- <SOLANA_WALLET_ADDRESS>");
  process.exit(1);
}

const url = process.env.RANUS_MCP_URL ?? `http://${config.host}:${config.port}/mcp`;
const headers: Record<string, string> = config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {};
const client = new Client({ name: "ranus-smoke", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }));

const { tools } = await client.listTools();
console.log(`Connected to ${url} — ${tools.length} tools: ${tools.map((t) => t.name).join(", ")}\n`);

const calls: Array<[string, Record<string, unknown>]> = [
  ["get_market_snapshot", {}],
  ["get_portfolio_summary", { wallet }],
  ["analyze_risk", { wallet }],
  ["suggest_allocation", { wallet, amountUsd: 1000, riskProfile: "balanced" }],
  ["simulate_borrow", { collateral: "SOL", collateralAmount: 10, borrow: "USDC" }],
  ["explain_concept", { concept: "apy_vs_apr", wallet }],
  ["prepare_action", { action: "kamino_deposit", inputToken: "USDC", amount: 100, wallet }],
  ["prepare_action", { action: "swap", inputToken: "USDC", outputToken: "SOL", amount: 25, wallet }],
];

let failures = 0;
for (const [name, args] of calls) {
  const started = Date.now();
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text?: string }>).find((c) => c.type === "text")?.text ?? "";
  const status = result.isError ? "ERROR" : "ok";
  if (result.isError) failures += 1;
  console.log(`[${status}] ${name} ${JSON.stringify(args)} — ${Date.now() - started} ms`);
  console.log(`  ${text.slice(0, 600)}${text.length > 600 ? "…" : ""}\n`);
}

await client.close();
console.log(failures === 0 ? "All tool calls succeeded." : `${failures} tool call(s) returned errors (see above).`);
process.exit(failures === 0 ? 0 : 1);
