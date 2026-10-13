import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages";
import { runAgent } from "@/lib/agent";
import type { AgentEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface ChatRequest {
  text?: string;
  wallet?: string | null;
  history?: BetaMessageParam[];
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as ChatRequest;
  const text = body.text?.trim();
  if (!text) return Response.json({ error: "Missing `text`." }, { status: 400 });
  if (text.length > 4000) return Response.json({ error: "Message is too long." }, { status: 413 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: AgentEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        await runAgent({
          history: Array.isArray(body.history) ? body.history : [],
          text,
          wallet: body.wallet?.trim() || null,
          emit,
          signal: req.signal,
        });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
