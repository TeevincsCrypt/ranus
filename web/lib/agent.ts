import Anthropic, { BetaFallbackState, betaRefusalFallbackMiddleware } from "@anthropic-ai/sdk";
import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaTool,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages";
import type { AgentEvent } from "./events";
import { callMcpTool, connectMcp, listMcpTools } from "./mcp";
import { contextBlock, SYSTEM_PROMPT } from "./prompt";

/**
 * The RANUS agent: Claude on Amazon Bedrock (Messages API via the Bedrock Mantle endpoint)
 * runs a multi-step tool-use loop whose tools are the RANUS MCP server's tools.
 */

type Effort = "low" | "medium" | "high" | "xhigh" | "max";
type MantleOptions = NonNullable<ConstructorParameters<typeof AnthropicBedrockMantle>[0]>;

const onVercel = Boolean(process.env.VERCEL);

export const bedrockConfig = {
  // Vercel presets AWS_REGION to the function's own region, so BEDROCK_AWS_REGION wins when set.
  region: process.env.BEDROCK_AWS_REGION ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1",
  model: process.env.BEDROCK_MODEL_ID ?? "anthropic.claude-opus-5-5",
  // Used only if the primary model declines a request on policy grounds ("none" disables).
  fallbackModel: process.env.BEDROCK_FALLBACK_MODEL_ID ?? "anthropic.claude-opus-4-8",
  effort: (process.env.RANUS_EFFORT ?? "medium") as Effort,
  maxSteps: Number(process.env.RANUS_MAX_STEPS ?? 10),
};

interface BedrockAuth {
  label: string;
  configured: boolean;
  options: Partial<MantleOptions>;
}

/**
 * Bedrock credentials, in order of preference. On Vercel the runtime's own AWS_ACCESS_KEY_ID /
 * AWS_SECRET_ACCESS_KEY variables are not usable AWS credentials, so RANUS reads its own names
 * and never falls back to them there.
 */
export function resolveBedrockAuth(): BedrockAuth {
  const bearer = process.env.AWS_BEARER_TOKEN_BEDROCK?.trim();
  if (bearer) return { label: "Bedrock API key", configured: true, options: { apiKey: bearer } };

  const roleArn = process.env.RANUS_AWS_ROLE_ARN?.trim();
  if (roleArn) {
    return {
      label: `Vercel OIDC → ${roleArn.split("/").pop()}`,
      configured: true,
      options: {
        providerChainResolver: async () => {
          const { awsCredentialsProvider } = await import("@vercel/functions/oidc");
          return awsCredentialsProvider({ roleArn }) as unknown as Awaited<ReturnType<NonNullable<MantleOptions["providerChainResolver"]>>>;
        },
      },
    };
  }

  const accessKey = process.env.RANUS_AWS_ACCESS_KEY_ID?.trim();
  const secretKey = process.env.RANUS_AWS_SECRET_ACCESS_KEY?.trim();
  if (accessKey && secretKey) {
    return {
      label: "IAM access keys (RANUS_AWS_*)",
      configured: true,
      options: { awsAccessKey: accessKey, awsSecretAccessKey: secretKey, awsSessionToken: process.env.RANUS_AWS_SESSION_TOKEN?.trim() || null },
    };
  }

  if (onVercel) return { label: "not configured", configured: false, options: {} };
  if (process.env.AWS_PROFILE) return { label: `AWS profile "${process.env.AWS_PROFILE}"`, configured: true, options: {} };
  if (process.env.AWS_ACCESS_KEY_ID) return { label: "AWS access keys (env)", configured: true, options: {} };
  return { label: "default AWS credential chain", configured: true, options: {} };
}

const VERCEL_AUTH_HELP =
  "On Vercel, set AWS_BEARER_TOKEN_BEDROCK (Bedrock API key), RANUS_AWS_ROLE_ARN (Vercel OIDC), or RANUS_AWS_ACCESS_KEY_ID + RANUS_AWS_SECRET_ACCESS_KEY in the project's environment variables, then redeploy.";

let bedrock: AnthropicBedrockMantle | null = null;
function getBedrock(): AnthropicBedrockMantle {
  if (!bedrock) {
    const fallback = bedrockConfig.fallbackModel;
    bedrock = new AnthropicBedrockMantle({
      awsRegion: bedrockConfig.region,
      ...resolveBedrockAuth().options,
      middleware: fallback && fallback !== "none" ? [betaRefusalFallbackMiddleware([{ model: fallback }])] : [],
    });
  }
  return bedrock;
}

/**
 * After a mid-output refusal fallback, model-internal blocks that precede the last `fallback`
 * marker must not be echoed back; text and everything after the marker are kept.
 */
function echoableContent(content: BetaContentBlock[]): BetaContentBlockParam[] {
  const lastFallback = content.map((b) => b.type).lastIndexOf("fallback");
  if (lastFallback < 0) return content as BetaContentBlockParam[];
  const dropBefore = new Set(["thinking", "redacted_thinking", "tool_use", "server_tool_use"]);
  return content.filter((b, i) => i > lastFallback || !dropBefore.has(b.type)) as BetaContentBlockParam[];
}

/**
 * Explicit prompt-cache breakpoints: one after the (stable) tools + system prompt, and one on the
 * newest message so each agent step re-reads the conversation so far from cache. The breakpoint is
 * added to a copy, so stored history never accumulates cache markers.
 */
function withHistoryBreakpoint(messages: BetaMessageParam[]): BetaMessageParam[] {
  const last = messages.at(-1);
  if (!last || typeof last.content === "string" || last.content.length === 0) return messages;
  const blocks = [...last.content];
  blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: { type: "ephemeral" } } as BetaContentBlockParam;
  return [...messages.slice(0, -1), { ...last, content: blocks }];
}

function friendlyError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return `Amazon Bedrock rejected the request (${err.status}). Check your credentials (${resolveBedrockAuth().label}) and that model access for ${bedrockConfig.model} is enabled in ${bedrockConfig.region}.${onVercel ? ` ${VERCEL_AUTH_HELP}` : ""}`;
  }
  if (err instanceof Anthropic.NotFoundError) {
    return `Model ${bedrockConfig.model} was not found in ${bedrockConfig.region}. Set BEDROCK_MODEL_ID / BEDROCK_AWS_REGION to a model your account can use.`;
  }
  if (err instanceof Anthropic.RateLimitError) return "Amazon Bedrock is throttling requests right now — please try again in a moment.";
  if (err instanceof Anthropic.APIConnectionError) return `Could not reach Amazon Bedrock in ${bedrockConfig.region}: ${err.message}`;
  if (err instanceof Anthropic.BadRequestError && /beta/i.test(err.message)) {
    return `Amazon Bedrock rejected a beta header (${err.message}). Set BEDROCK_FALLBACK_MODEL_ID=none to turn off the client-side refusal fallback.`;
  }
  if (err instanceof Anthropic.APIError) return `Amazon Bedrock error ${err.status ?? ""}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

export interface RunAgentInput {
  history: BetaMessageParam[];
  text: string;
  wallet: string | null;
  emit: (event: AgentEvent) => void;
  signal?: AbortSignal;
}

export async function runAgent({ history, text, wallet, emit, signal }: RunAgentInput): Promise<void> {
  if (!resolveBedrockAuth().configured) {
    emit({ type: "error", message: `Amazon Bedrock credentials are not configured. ${VERCEL_AUTH_HELP}` });
    return;
  }
  emit({ type: "status", message: "Connecting to RANUS MCP server…" });
  let mcp;
  try {
    mcp = await connectMcp();
  } catch (err) {
    emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
    return;
  }

  try {
    const tools: BetaTool[] = (await listMcpTools(mcp.client)).map((t) => {
      // MCP schemas carry a `$schema` dialect marker; the Messages API only needs the schema itself.
      const { $schema: _dialect, ...schema } = t.inputSchema as Record<string, unknown>;
      return { name: t.name, description: t.description ?? t.title ?? t.name, input_schema: schema as BetaTool["input_schema"] };
    });

    const messages: BetaMessageParam[] = [
      ...history,
      { role: "user", content: [{ type: "text", text: contextBlock(wallet) + text }] },
    ];
    const fallbackState = new BetaFallbackState();
    const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
    let last: BetaMessage | null = null;
    let step = 0;

    emit({ type: "status", message: `Thinking with ${bedrockConfig.model} on Amazon Bedrock…` });
    for (;;) {
      step += 1;
      // On the last allowed step, ask for a final answer from what has been gathered so far.
      const finalStep = step >= bedrockConfig.maxSteps;
      const stream = getBedrock().beta.messages.stream(
        {
          model: bedrockConfig.model,
          max_tokens: 64_000,
          system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          tools,
          ...(finalStep && { tool_choice: { type: "none" as const } }),
          messages: withHistoryBreakpoint(messages),
          thinking: { type: "adaptive", display: "summarized" },
          output_config: { effort: bedrockConfig.effort },
        },
        { fallbackState, signal },
      );
      stream.on("thinking", (delta) => emit({ type: "thinking", delta }));
      stream.on("text", (delta) => emit({ type: "text", delta }));
      stream.on("streamEvent", (event) => {
        if (event.type === "content_block_start" && event.content_block.type === "fallback") {
          emit({ type: "fallback", from: event.content_block.from.model, to: event.content_block.to.model });
        }
      });

      const message = await stream.finalMessage();
      last = message;
      usage.inputTokens += message.usage.input_tokens;
      usage.outputTokens += message.usage.output_tokens;
      usage.cacheReadTokens += message.usage.cache_read_input_tokens ?? 0;
      messages.push({ role: "assistant", content: echoableContent(message.content) });

      if (message.stop_reason === "refusal") {
        emit({ type: "text", delta: "\n\nI can't help with that request." });
        break;
      }
      if (message.stop_reason === "max_tokens" || message.stop_reason === "model_context_window_exceeded") {
        emit({ type: "text", delta: "\n\n_(Response truncated — please ask a narrower question.)_" });
        break;
      }
      if (message.stop_reason === "pause_turn") continue;

      const toolUses = message.content.filter((b): b is BetaToolUseBlock => b.type === "tool_use");
      if (message.stop_reason !== "tool_use" || toolUses.length === 0 || finalStep) break;

      // Run this step's tool calls in parallel and return every result in one user message.
      const results: BetaToolResultBlockParam[] = await Promise.all(
        toolUses.map(async (call) => {
          emit({ type: "tool_call", id: call.id, name: call.name, input: call.input, step });
          const started = Date.now();
          const outcome = await callMcpTool(mcp.client, call.name, (call.input ?? {}) as Record<string, unknown>);
          emit({
            type: "tool_result",
            id: call.id,
            name: call.name,
            isError: outcome.isError,
            result: outcome.data,
            durationMs: Date.now() - started,
          });
          return { type: "tool_result", tool_use_id: call.id, content: outcome.text, is_error: outcome.isError };
        }),
      );
      messages.push({ role: "user", content: results });
    }

    emit({
      type: "done",
      history: messages,
      stopReason: last?.stop_reason ?? null,
      model: last?.model ?? bedrockConfig.model,
      steps: step,
      usage,
    });
  } catch (err) {
    if (signal?.aborted) return;
    emit({ type: "error", message: friendlyError(err) });
  } finally {
    await mcp.close();
  }
}
