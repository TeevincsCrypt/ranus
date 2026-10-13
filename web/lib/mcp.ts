import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { createRanusServer } from "ranus-mcp-server";

/**
 * How the agent and UI panels reach the RANUS MCP server:
 * - default: in-process — the same McpServer this app serves at /mcp, over an in-memory MCP transport
 *   (no self-HTTP hop, so it works behind Vercel deployment protection and on cold starts);
 * - RANUS_MCP_URL set: a remote MCP server over Streamable HTTP (e.g. the standalone server, or
 *   another deployment's /mcp).
 */
const REMOTE_URL = process.env.RANUS_MCP_URL?.trim() || null;

export interface McpConnection {
  client: Client;
  mode: "in-process" | "streamable-http";
  endpoint: string;
  close: () => Promise<void>;
}

export async function connectMcp(): Promise<McpConnection> {
  const client = new Client({ name: "ranus-web-agent", version: "1.0.0" });

  if (!REMOTE_URL) {
    const server = createRanusServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return {
      client,
      mode: "in-process",
      endpoint: "/mcp",
      close: async () => {
        await client.close().catch(() => undefined);
        await server.close().catch(() => undefined);
      },
    };
  }

  const headers: Record<string, string> = {};
  if (process.env.RANUS_MCP_TOKEN) headers.Authorization = `Bearer ${process.env.RANUS_MCP_TOKEN}`;
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(REMOTE_URL), { requestInit: { headers } }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot reach the RANUS MCP server at ${REMOTE_URL} (${message}).`);
  }
  return { client, mode: "streamable-http", endpoint: REMOTE_URL, close: () => client.close().catch(() => undefined) };
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
