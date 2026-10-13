import { bedrockAuthMode, bedrockConfig } from "@/lib/agent";
import { connectMcp, listMcpTools, MCP_URL } from "@/lib/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let mcp: { ok: boolean; url: string; tools: string[]; error?: string } = { ok: false, url: MCP_URL, tools: [] };
  try {
    const client = await connectMcp();
    try {
      mcp = { ok: true, url: MCP_URL, tools: (await listMcpTools(client)).map((t) => t.name) };
    } finally {
      await client.close().catch(() => undefined);
    }
  } catch (err) {
    mcp.error = err instanceof Error ? err.message : String(err);
  }
  return Response.json({
    mcp,
    bedrock: {
      model: bedrockConfig.model,
      region: bedrockConfig.region,
      effort: bedrockConfig.effort,
      fallbackModel: bedrockConfig.fallbackModel,
      auth: bedrockAuthMode(),
    },
  });
}
