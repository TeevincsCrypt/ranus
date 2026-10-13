function env(name: string, fallback?: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

export const config = {
  host: env("RANUS_MCP_HOST", "127.0.0.1")!,
  port: Number(env("RANUS_MCP_PORT", "8787")),
  /** Optional bearer token. When set, every /mcp request must send `Authorization: Bearer <token>`. */
  authToken: env("RANUS_MCP_TOKEN"),

  solanaRpcUrl: env("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com")!,

  /** api.jup.ag serves keyless requests at 0.5 RPS; a free key from https://developers.jup.ag/portal raises that. */
  jupiterApiBase: env("JUPITER_API_BASE", "https://api.jup.ag")!,
  jupiterApiKey: env("JUPITER_API_KEY"),

  defillamaYieldsUrl: env("DEFILLAMA_YIELDS_URL", "https://yields.llama.fi/pools")!,

  /** Kamino Lend main market. */
  kaminoMarket: env("KAMINO_MARKET", "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF")!,
};
