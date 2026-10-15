import { serverError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Tools the UI may call directly (no LLM) to render live side panels. */
const PANEL_TOOLS = new Set(["get_portfolio_summary", "get_market_snapshot"]);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: string; arguments?: Record<string, unknown> };
  if (!body.name || !PANEL_TOOLS.has(body.name)) {
    return Response.json({ error: `Tool not available to the UI: ${body.name}` }, { status: 400 });
  }
  try {
    // Loaded here (not at module scope) so a failure to load the MCP/Solana stack is reported as JSON.
    const { callMcpTool, connectMcp } = await import("@/lib/mcp");
    const mcp = await connectMcp();
    try {
      const outcome = await callMcpTool(mcp.client, body.name, body.arguments ?? {});
      return Response.json(outcome.isError ? { error: outcome.text } : { result: outcome.data }, {
        status: outcome.isError ? 502 : 200,
      });
    } finally {
      await mcp.close();
    }
  } catch (err) {
    return serverError(`/api/tools (${body.name})`, err);
  }
}
