/** Rounds for compact, model-friendly tool output. */
export function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return value;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** USD with cents; tiny values keep more precision so they don't read as zero. */
export function usd(value: number): number {
  return Math.abs(value) < 1 ? round(value, 4) : round(value, 2);
}

/** Fraction (0.0475) → percent number (4.75). */
export function pct(fraction: number, digits = 2): number {
  return round(fraction * 100, digits);
}

/** Token amounts: keep significant precision for small balances. */
export function tokenAmount(value: number): number {
  if (value === 0) return 0;
  const abs = Math.abs(value);
  if (abs >= 1000) return round(value, 2);
  if (abs >= 1) return round(value, 4);
  return Number(value.toPrecision(6));
}

/** Converts a human amount to integer base units without floating-point drift. */
export function toBaseUnits(amount: number, decimals: number): string {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be a positive number.");
  const [whole, frac = ""] = amount.toFixed(Math.min(decimals, 20)).split(".");
  const raw = BigInt(whole + frac.padEnd(decimals, "0").slice(0, decimals));
  if (raw === 0n) throw new Error("Amount is too small for this token's precision.");
  return raw.toString();
}

export function fromBaseUnits(raw: string, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
