import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerActionTool } from "./tools/action.js";
import { registerAllocationTool } from "./tools/allocation.js";
import { registerBorrowTool } from "./tools/borrow.js";
import { registerExplainTool } from "./tools/explain.js";
import { registerPortfolioTools } from "./tools/portfolio.js";
import { registerRiskTool } from "./tools/risk.js";

export const SERVER_INFO = { name: "ranus", title: "RANUS — Dollar & Asset Intelligence", version: "1.0.0" };

export function createRanusServer(): McpServer {
  const server = new McpServer(SERVER_INFO, {
    instructions:
      "RANUS tools read live Solana data (wallet balances via RPC, Kamino Lend on-chain state, Jupiter prices and quotes, " +
      "DefiLlama yields). All tools are read-only: nothing is signed or submitted. Numbers in results are live; cite the " +
      "`asOf`/`slot` and `sources` fields, and surface any `warnings` or `dataErrors` instead of guessing missing values.",
  });
  registerPortfolioTools(server);
  registerRiskTool(server);
  registerAllocationTool(server);
  registerBorrowTool(server);
  registerExplainTool(server);
  registerActionTool(server);
  return server;
}
