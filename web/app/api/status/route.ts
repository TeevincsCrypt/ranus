import { accessCodeRequired } from "@/lib/access";
import { bedrockConfig, resolveBedrockAuth } from "@/lib/bedrock";
import { describeError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let mcp: { ok: boolean; mode?: string; endpoint?: string; tools: string[]; error?: string } = { ok: false, tools: [] };
  try {
    // Loaded here so a failure to load the MCP/Solana stack is reported in `mcp.error` while
    // the Bedrock and access-code status below still reach the UI.
    const { connectMcp, listMcpTools } = await import("@/lib/mcp");
    const conn = await connectMcp();
    try {
      mcp = { ok: true, mode: conn.mode, endpoint: conn.endpoint, tools: (await listMcpTools(conn.client)).map((t) => t.name) };
    } finally {
      await conn.close();
    }
  } catch (err) {
    console.error("[ranus] /api/status MCP check failed:", err);
    mcp.error = describeError(err);
  }
  const auth = resolveBedrockAuth();
  return Response.json({
    mcp,
    bedrock: {
      model: bedrockConfig.model,
      region: bedrockConfig.region,
      effort: bedrockConfig.effort,
      fallbackModel: bedrockConfig.fallbackModel,
      auth: auth.label,
      configured: auth.configured,
    },
    accessCodeRequired: accessCodeRequired(),
  });
}
