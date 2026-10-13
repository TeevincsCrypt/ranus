import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const repoRoot = path.resolve(process.cwd(), "..");
// One .env at the repo root is shared by the MCP server and the web app.
loadEnvConfig(repoRoot);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Server-only SDKs (AWS SigV4 signing, MCP client) run as plain Node modules.
  serverExternalPackages: ["@anthropic-ai/bedrock-sdk", "@anthropic-ai/sdk", "@modelcontextprotocol/sdk"],
  turbopack: { root: repoRoot },
  // Don't write an AGENTS.md into the project on `next dev`.
  agentRules: false,
};

export default nextConfig;
