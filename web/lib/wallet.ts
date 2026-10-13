"use client";

import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";

/**
 * Read-only wallet connection via the Wallet Standard (Phantom, Solflare, Backpack, ...).
 * RANUS only reads the public address; it never requests signatures.
 */

interface ConnectFeature {
  connect: (input?: { silent?: boolean }) => Promise<{ accounts: readonly WalletAccount[] }>;
}
interface DisconnectFeature {
  disconnect: () => Promise<void>;
}

export function isSolanaWallet(wallet: Wallet): boolean {
  return wallet.chains.some((c) => c.startsWith("solana:")) && "standard:connect" in wallet.features;
}

export function listSolanaWallets(): Wallet[] {
  return getWallets().get().filter(isSolanaWallet);
}

export function onWalletsChanged(callback: () => void): () => void {
  const { on } = getWallets();
  const offRegister = on("register", callback);
  const offUnregister = on("unregister", callback);
  return () => {
    offRegister();
    offUnregister();
  };
}

export async function connectWallet(wallet: Wallet): Promise<string> {
  const feature = wallet.features["standard:connect"] as ConnectFeature;
  const { accounts } = await feature.connect();
  const account = accounts.find((a) => a.chains.some((c) => c.startsWith("solana:"))) ?? accounts[0];
  if (!account) throw new Error(`${wallet.name} did not share an account.`);
  return account.address;
}

export async function disconnectWallet(wallet: Wallet | null): Promise<void> {
  const feature = wallet?.features["standard:disconnect"] as DisconnectFeature | undefined;
  await feature?.disconnect().catch(() => undefined);
}

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export function looksLikeSolanaAddress(value: string): boolean {
  return BASE58.test(value.trim());
}
