import { readApiJson } from "./response";

/** Browser-side: call one of the read-only MCP tools the UI may use directly (no LLM) via /api/tools. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function callPanelTool(name: string, args: Record<string, unknown>): Promise<any> {
  const res = await fetch("/api/tools", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, arguments: args }),
  });
  const body = await readApiJson<{ result: unknown }>(res);
  return body.result;
}
