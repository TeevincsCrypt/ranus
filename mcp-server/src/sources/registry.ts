/**
 * Static reference data: on-chain mint addresses and asset classes.
 * These are identifiers, not market data — every price, balance and yield RANUS
 * reports is fetched live from the sources in this folder.
 */

export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export type AssetClass =
  | "cash_stablecoin"
  | "tokenized_treasury"
  | "tokenized_stock"
  | "sol"
  | "liquid_staked_sol"
  | "other";

/** USD stablecoins on Solana (mint → symbol). */
export const USD_STABLECOINS: Record<string, string> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo": "PYUSD",
  USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA: "USDS",
  "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH": "USDG",
  "9zNQRsGLjNKwCUU5Gq5LR8beUCPzQMVMqKAi3SSZh54u": "FDUSD",
  DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT: "USDe",
};

/** Tokenized U.S. Treasury / money-market products on Solana (mint → symbol). */
export const TOKENIZED_TREASURIES: Record<string, string> = {
  A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6: "USDY",
};

/** Liquid staking tokens commonly held on Solana (mint → symbol). */
export const LIQUID_STAKED_SOL: Record<string, string> = {
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: "JitoSOL",
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: "mSOL",
  jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v: "JupSOL",
  bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1: "bSOL",
  BNso1VUJnh4zcfpZa6986Ea66P6TCp59hvtNJ8b1X85: "BNSOL",
  "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm": "INF",
};

export function classifyMint(mint: string, jupiterTags: string[] = []): AssetClass {
  if (mint === SOL_MINT) return "sol";
  if (USD_STABLECOINS[mint]) return "cash_stablecoin";
  if (TOKENIZED_TREASURIES[mint]) return "tokenized_treasury";
  if (LIQUID_STAKED_SOL[mint] || jupiterTags.includes("lst")) return "liquid_staked_sol";
  if (jupiterTags.includes("stocks") || jupiterTags.includes("xstocks")) return "tokenized_stock";
  return "other";
}

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  cash_stablecoin: "Digital dollars (stablecoins)",
  tokenized_treasury: "Tokenized U.S. Treasuries",
  tokenized_stock: "Tokenized stocks",
  sol: "SOL",
  liquid_staked_sol: "Liquid-staked SOL",
  other: "Other tokens",
};

/** Resolve a user-supplied symbol or mint to a mint address using the registry. */
export function resolveKnownSymbol(symbolOrMint: string): string | undefined {
  const needle = symbolOrMint.trim();
  if (needle.toUpperCase() === "SOL" || needle.toUpperCase() === "WSOL") return SOL_MINT;
  for (const table of [USD_STABLECOINS, TOKENIZED_TREASURIES, LIQUID_STAKED_SOL]) {
    for (const [mint, symbol] of Object.entries(table)) {
      if (symbol.toUpperCase() === needle.toUpperCase() || mint === needle) return mint;
    }
  }
  return undefined;
}
