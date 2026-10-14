import { timingSafeEqual } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createRanusServer } from "ranus-mcp-server";

/**
 * The RANUS MCP server over Streamable HTTP, hosted by this Next.js app (and on Vercel).
 * Reachable at /mcp (rewrite) or /api/mcp. Stateless: every POST gets a fresh server + transport,
 * so it runs naturally on serverless functions. Set RANUS_MCP_TOKEN to require a bearer token.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

function jsonRpcError(status: number, code: number, message: string) {
  return Response.json({ jsonrpc: "2.0", error: { code, message }, id: null }, { status, headers: CORS_HEADERS });
}

function authorized(req: Request): boolean {
  const token = process.env.RANUS_MCP_TOKEN;
  if (!token) return true;
  const given = Buffer.from((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(req: Request) {
  if (!authorized(req)) return jsonRpcError(401, -32001, "Unauthorized");
  const server = createRanusServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const res = await transport.handleRequest(req);
    const headers = new Headers(res.headers);
    for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
    // The JSON body is fully produced once handleRequest resolves, so the per-request server can close.
    const body = await res.text();
    return new Response(body, { status: res.status, headers });
  } catch (err) {
    console.error("[ranus-mcp] request failed:", err);
    return jsonRpcError(500, -32603, "Internal server error");
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

export function GET() {
  return jsonRpcError(405, -32000, "Method not allowed (stateless server: use POST).");
}

export function DELETE() {
  return jsonRpcError(405, -32000, "Method not allowed (stateless server).");
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
