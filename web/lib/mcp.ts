import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const MCP_URL =
  process.env.RANUS_MCP_URL ?? `http://${process.env.RANUS_MCP_HOST ?? "127.0.0.1"}:${process.env.RANUS_MCP_PORT ?? "8787"}/mcp`;

/** Opens an MCP client session to the RANUS server over Streamable HTTP. */
export async function connectMcp(): Promise<Client> {
  const headers: Record<string, string> = {};
  if (process.env.RANUS_MCP_TOKEN) headers.Authorization = `Bearer ${process.env.RANUS_MCP_TOKEN}`;
  const client = new Client({ name: "ranus-web-agent", version: "1.0.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL), { requestInit: { headers } }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot reach the RANUS MCP server at ${MCP_URL} (${message}). Is \`npm run dev\` running?`);
  }
  return client;
}

export interface McpToolOutcome {
  isError: boolean;
  /** Text handed to the model (JSON string or error message). */
  text: string;
  /** Structured result for the UI. */
  data: unknown;
}

export async function callMcpTool(client: Client, name: string, args: Record<string, unknown>): Promise<McpToolOutcome> {
  try {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as Array<{ type: string; text?: string }>)
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text)
      .join("\n");
    return {
      isError: Boolean(result.isError),
      text: text || JSON.stringify(result.structuredContent ?? {}),
      data: result.isError ? text : (result.structuredContent ?? text),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, text: `Error: ${message}`, data: `Error: ${message}` };
  }
}

export async function listMcpTools(client: Client): Promise<Tool[]> {
  const { tools } = await client.listTools();
  return tools;
}
