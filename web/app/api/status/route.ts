import { accessCodeRequired } from "@/lib/access";
import { bedrockConfig, resolveBedrockAuth } from "@/lib/agent";
import { connectMcp, listMcpTools } from "@/lib/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let mcp: { ok: boolean; mode?: string; endpoint?: string; tools: string[]; error?: string } = { ok: false, tools: [] };
  try {
    const conn = await connectMcp();
    try {
      mcp = { ok: true, mode: conn.mode, endpoint: conn.endpoint, tools: (await listMcpTools(conn.client)).map((t) => t.name) };
    } finally {
      await conn.close();
    }
  } catch (err) {
    mcp.error = err instanceof Error ? err.message : String(err);
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
