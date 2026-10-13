/**
 * Call one RANUS MCP tool over Streamable HTTP and print its structured result.
 *
 *   npm run call -w mcp-server -- simulate_borrow '{"collateral":"SOL","collateralAmount":10}'
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { config } from "../config.js";

const [name, rawArgs = "{}"] = process.argv.slice(2);
if (!name) {
  console.error("Usage: npm run call -w mcp-server -- <tool_name> '<json arguments>'");
  process.exit(1);
}

const url = process.env.RANUS_MCP_URL ?? `http://${config.host}:${config.port}/mcp`;
const headers: Record<string, string> = config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {};
const client = new Client({ name: "ranus-cli", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }));
const result = await client.callTool({ name, arguments: JSON.parse(rawArgs) });
console.log(JSON.stringify(result.isError ? result.content : (result.structuredContent ?? result.content), null, 2));
await client.close();
process.exit(result.isError ? 1 : 0);
