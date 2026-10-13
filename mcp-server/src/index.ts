import "./env";
import { timingSafeEqual } from "node:crypto";
import cors from "cors";
import type { NextFunction, Request, Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config } from "./config";
import { createRanusServer, SERVER_INFO } from "./server";

const app = createMcpExpressApp({ host: config.host });

// Lets browser-based MCP clients (e.g. MCP Inspector) talk to the server.
app.use(
  cors({
    origin: "*",
    exposedHeaders: ["Mcp-Session-Id"],
    allowedHeaders: ["Content-Type", "Authorization", "Mcp-Session-Id", "Mcp-Protocol-Version", "Last-Event-ID"],
  }),
);

function requireToken(req: Request, res: Response, next: NextFunction) {
  if (!config.authToken) return next();
  const header = req.headers.authorization ?? "";
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(config.authToken);
  if (given.length === expected.length && timingSafeEqual(given, expected)) return next();
  res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
}

/**
 * Stateless Streamable HTTP: every POST gets a fresh server + transport, so the endpoint
 * scales horizontally and needs no session affinity (a good fit for Alexa+ style hosts).
 */
app.post("/mcp", requireToken, async (req: Request, res: Response) => {
  const server = createRanusServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[ranus-mcp] request failed:", err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
});

const methodNotAllowed = (_req: Request, res: Response) => {
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server)." }, id: null });
};
app.get("/mcp", methodNotAllowed);
app.delete("/mcp", methodNotAllowed);

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    server: SERVER_INFO,
    transport: "streamable-http (stateless)",
    endpoint: "/mcp",
    dataSources: {
      solanaRpc: config.solanaRpcUrl.replace(/(api[-_]?key=)[^&]+/i, "$1***"),
      jupiter: `${config.jupiterApiBase} (${config.jupiterApiKey ? "API key" : "keyless, 0.5 RPS"})`,
      kaminoMarket: config.kaminoMarket,
      defillama: config.defillamaYieldsUrl,
    },
    auth: config.authToken ? "bearer token required" : "none (local)",
  });
});

app.listen(config.port, config.host, (err?: Error) => {
  if (err) {
    console.error(`[ranus-mcp] failed to listen on ${config.host}:${config.port}:`, err.message);
    process.exit(1);
  }
  console.log(`[ranus-mcp] RANUS MCP server listening on http://${config.host}:${config.port}/mcp`);
});
