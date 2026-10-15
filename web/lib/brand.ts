import type { ArtName } from "@/components/brand/Art";

/** One card per MCP tool: the landing carousel and the chat's tool cards share these colors and illustrations. */
export interface ToolTheme {
  tool: string;
  title: string;
  blurb: string;
  /** Card background and the text color that reads on it. */
  bg: string;
  ink: string;
  art: ArtName;
}

export const TOOL_THEMES: ToolTheme[] = [
  {
    tool: "get_market_snapshot",
    title: "Yields",
    blurb: "Where a digital dollar earns right now: Kamino on-chain, DefiLlama and Ondo USDY.",
    bg: "var(--yellow)",
    ink: "var(--ink)",
    art: "coin",
  },
  {
    tool: "get_portfolio_summary",
    title: "Portfolio",
    blurb: "Every token, stablecoin and Kamino position in a wallet, priced live.",
    bg: "var(--pink)",
    ink: "var(--ink)",
    art: "pie",
  },
  {
    tool: "analyze_risk",
    title: "Risk",
    blurb: "Liquidation distance, depegs, concentration and idle cash, with the evidence.",
    bg: "var(--blue)",
    ink: "#fff",
    art: "shield",
  },
  {
    tool: "suggest_allocation",
    title: "Allocate",
    blurb: "A transparent split across cash, Treasuries, SOL and stocks, priced at live yields.",
    bg: "var(--mint)",
    ink: "var(--ink)",
    art: "bars",
  },
  {
    tool: "simulate_borrow",
    title: "Borrow",
    blurb: "Max borrow, LTV and liquidation price on Kamino, before anything is signed.",
    bg: "var(--orange)",
    ink: "var(--ink)",
    art: "gauge",
  },
  {
    tool: "explain_concept",
    title: "Explain",
    blurb: "APY vs APR, LTV and depegs, explained with your own numbers.",
    bg: "var(--lilac)",
    ink: "var(--ink)",
    art: "bubble",
  },
  {
    tool: "prepare_action",
    title: "Act",
    blurb: "Real swap quotes and deposit previews. You sign in your wallet; RANUS never does.",
    bg: "var(--ink)",
    ink: "#fff",
    art: "bolt",
  },
];

export const TOOL_THEME_BY_NAME: Record<string, ToolTheme> = Object.fromEntries(TOOL_THEMES.map((t) => [t.tool, t]));
