import type { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";

/**
 * Amazon Bedrock settings and credential resolution. Kept apart from the agent loop (which loads
 * the MCP/Solana stack) so /api/status can always report them.
 */

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
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
