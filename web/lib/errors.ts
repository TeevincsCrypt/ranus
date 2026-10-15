/** Server-side: turn any failure (including a module that fails to load) into a JSON error response. */
export function describeError(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return `${err.name}: ${err.message}${typeof code === "string" ? ` (${code})` : ""}`;
  }
  return String(err);
}

export function serverError(scope: string, err: unknown): Response {
  console.error(`[ranus] ${scope} failed:`, err);
  return Response.json({ error: `RANUS server error in ${scope} — ${describeError(err)}` }, { status: 500 });
}
