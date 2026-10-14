import { callMcpTool, connectMcp } from "@/lib/mcp";

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
  let mcp;
  try {
    mcp = await connectMcp();
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
  try {
    const outcome = await callMcpTool(mcp.client, body.name, body.arguments ?? {});
    return Response.json(
      outcome.isError ? { error: outcome.text } : { result: outcome.data },
      { status: outcome.isError ? 502 : 200 },
    );
  } finally {
    await mcp.close();
  }
}
