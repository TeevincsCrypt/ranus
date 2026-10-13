/** Events streamed from /api/chat to the browser (one JSON object per SSE `data:` line). */
export type AgentEvent =
  | { type: "status"; message: string }
  | { type: "thinking"; delta: string }
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; input: unknown; step: number }
  | {
      type: "tool_result";
      id: string;
      name: string;
      isError: boolean;
      /** Structured JSON from the MCP tool, or the error text. */
      result: unknown;
      durationMs: number;
    }
  | { type: "fallback"; from: string; to: string }
  | {
      type: "done";
      /** Opaque Messages-API history; the client sends it back unchanged on the next turn. */
      history: unknown[];
      stopReason: string | null;
      model: string;
      steps: number;
      usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
    }
  | { type: "error"; message: string };

export interface ToolCallView {
  id: string;
  name: string;
  input: unknown;
  step: number;
  status: "running" | "ok" | "error";
  result?: unknown;
  durationMs?: number;
}
