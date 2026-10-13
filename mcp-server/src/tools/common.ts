import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { errorMessage } from "../lib/format.js";

export const walletSchema = z
  .string()
  .min(32)
  .max(44)
  .describe("Solana wallet address (base58 public key). Read-only: RANUS never asks for keys or signatures.");

export const READ_ONLY_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

function ok(data: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
}

function fail(err: unknown): CallToolResult {
  return { content: [{ type: "text", text: `Error: ${errorMessage(err)}` }], isError: true };
}

/** Wraps a tool implementation so live-data failures surface as MCP tool errors, never as fabricated output. */
export function handle<Args>(fn: (args: Args) => Promise<Record<string, unknown>>) {
  return async (args: Args): Promise<CallToolResult> => {
    try {
      return ok(await fn(args));
    } catch (err) {
      return fail(err);
    }
  };
}
