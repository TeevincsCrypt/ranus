import {
  address,
  createSolanaRpc,
  getAddressEncoder,
  getProgramDerivedAddress,
  isAddress,
  type Address,
} from "@solana/kit";
import { config } from "../config.js";
import { cached } from "../lib/cache.js";
import { UpstreamError } from "../lib/http.js";

export const rpc = createSolanaRpc(config.solanaRpcUrl);

const TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM = address("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const METAPLEX_METADATA_PROGRAM = address("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

export function parseWallet(input: string): Address {
  const trimmed = input.trim();
  if (!isAddress(trimmed)) {
    throw new Error(`"${input}" is not a valid Solana address (expected a base58 public key).`);
  }
  return trimmed;
}

export interface TokenBalance {
  mint: string;
  /** Human units (already divided by decimals). */
  amount: number;
  amountRaw: string;
  decimals: number;
  program: "spl-token" | "token-2022";
  accounts: number;
}

export interface WalletBalances {
  wallet: string;
  slot: number;
  solLamports: string;
  sol: number;
  tokens: TokenBalance[];
}

interface ParsedTokenAccountData {
  parsed: {
    info: {
      mint: string;
      tokenAmount: { amount: string; decimals: number; uiAmountString: string };
    };
  };
}

async function rpcCall<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new UpstreamError("Solana RPC", `${label} failed (${message})`);
  }
}

/** Live SOL + SPL Token + Token-2022 balances for a wallet, aggregated by mint. */
export function getWalletBalances(wallet: Address): Promise<WalletBalances> {
  return cached(`balances:${wallet}`, 15_000, async () => {
    const [balance, spl, t22] = await Promise.all([
      rpcCall("getBalance", () => rpc.getBalance(wallet, { commitment: "confirmed" }).send()),
      rpcCall("getTokenAccountsByOwner(Token)", () =>
        rpc
          .getTokenAccountsByOwner(wallet, { programId: TOKEN_PROGRAM }, { encoding: "jsonParsed", commitment: "confirmed" })
          .send(),
      ),
      rpcCall("getTokenAccountsByOwner(Token-2022)", () =>
        rpc
          .getTokenAccountsByOwner(
            wallet,
            { programId: TOKEN_2022_PROGRAM },
            { encoding: "jsonParsed", commitment: "confirmed" },
          )
          .send(),
      ),
    ]);

    const byMint = new Map<string, TokenBalance>();
    const add = (accounts: typeof spl.value, program: TokenBalance["program"]) => {
      for (const { account } of accounts) {
        const info = (account.data as unknown as ParsedTokenAccountData).parsed.info;
        const raw = BigInt(info.tokenAmount.amount);
        if (raw === 0n) continue;
        const existing = byMint.get(info.mint);
        const totalRaw = raw + (existing ? BigInt(existing.amountRaw) : 0n);
        byMint.set(info.mint, {
          mint: info.mint,
          // uiAmountString already applies Token-2022 scaled-UI-amount multipliers (used by xStocks).
          amount: (existing?.amount ?? 0) + Number(info.tokenAmount.uiAmountString),
          amountRaw: totalRaw.toString(),
          decimals: info.tokenAmount.decimals,
          program,
          accounts: (existing?.accounts ?? 0) + 1,
        });
      }
    };
    add(spl.value, "spl-token");
    add(t22.value, "token-2022");

    const lamports = balance.value;
    return {
      wallet,
      slot: Number(balance.context.slot),
      solLamports: lamports.toString(),
      sol: Number(lamports) / 1e9,
      tokens: [...byMint.values()],
    };
  });
}

export interface OnchainTokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  source: "token-2022 metadata extension" | "metaplex metadata";
}

function readBorshString(buf: Buffer, offset: number): [string, number] {
  const len = buf.readUInt32LE(offset);
  const start = offset + 4;
  const value = buf.subarray(start, start + len).toString("utf8").replace(/\0/g, "").trim();
  return [value, start + len];
}

/**
 * On-chain token names/symbols, used when Jupiter's token API is unavailable.
 * Reads Token-2022 metadata extensions and Metaplex metadata accounts directly from Solana.
 */
export async function getOnchainMetadata(mints: string[]): Promise<Map<string, OnchainTokenMetadata>> {
  const result = new Map<string, OnchainTokenMetadata>();
  const unique = [...new Set(mints)].filter((m) => isAddress(m)) as Address[];
  if (unique.length === 0) return result;

  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    const mintAccounts = await rpcCall("getMultipleAccounts(mints)", () =>
      rpc.getMultipleAccounts(batch, { encoding: "jsonParsed" }).send(),
    );
    const needMetaplex: Address[] = [];
    batch.forEach((mint, idx) => {
      const data = mintAccounts.value[idx]?.data as
        | { parsed?: { info?: { extensions?: Array<{ extension: string; state?: { name?: string; symbol?: string } }> } } }
        | undefined;
      const ext = data?.parsed?.info?.extensions?.find((e) => e.extension === "tokenMetadata");
      if (ext?.state?.symbol) {
        result.set(mint, {
          mint,
          name: ext.state.name ?? ext.state.symbol,
          symbol: ext.state.symbol,
          source: "token-2022 metadata extension",
        });
      } else {
        needMetaplex.push(mint);
      }
    });

    if (needMetaplex.length === 0) continue;
    const encoder = getAddressEncoder();
    const pdas = await Promise.all(
      needMetaplex.map(async (mint) => {
        const [pda] = await getProgramDerivedAddress({
          programAddress: METAPLEX_METADATA_PROGRAM,
          seeds: ["metadata", encoder.encode(METAPLEX_METADATA_PROGRAM), encoder.encode(mint)],
        });
        return pda;
      }),
    );
    const metaAccounts = await rpcCall("getMultipleAccounts(metadata)", () =>
      rpc.getMultipleAccounts(pdas, { encoding: "base64" }).send(),
    );
    needMetaplex.forEach((mint, idx) => {
      const account = metaAccounts.value[idx];
      if (!account) return;
      try {
        const buf = Buffer.from(account.data[0], "base64");
        const [name, afterName] = readBorshString(buf, 1 + 32 + 32);
        const [symbol] = readBorshString(buf, afterName);
        if (symbol) result.set(mint, { mint, name: name || symbol, symbol, source: "metaplex metadata" });
      } catch {
        // Malformed metadata account: leave the token unnamed rather than guessing.
      }
    });
  }
  return result;
}
