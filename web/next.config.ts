import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const repoRoot = path.resolve(process.cwd(), "..");
// Local development reads the repo-root .env; on Vercel, project environment variables are used.
loadEnvConfig(repoRoot);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The MCP server package (TypeScript source in ../mcp-server) is compiled as part of this app.
  transpilePackages: ["ranus-mcp-server"],
  // Server-only SDKs load as plain Node modules (AWS SigV4 signing, MCP, Kamino/Solana).
  serverExternalPackages: [
    "@anthropic-ai/bedrock-sdk",
    "@anthropic-ai/sdk",
    "@modelcontextprotocol/sdk",
    "@kamino-finance/klend-sdk",
    "@solana/kit",
    "@vercel/functions",
  ],
  // Monorepo: trace dependencies from the workspace root so Vercel bundles them with each function.
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  // Don't write an AGENTS.md into the project on `next dev`.
  agentRules: false,
  async rewrites() {
    // Public MCP endpoint for Alexa+ and other MCP hosts: https://<your-app>/mcp
    return [{ source: "/mcp", destination: "/api/mcp" }];
  },
};

export default nextConfig;
