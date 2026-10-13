/** Error raised when a live upstream data source fails. Never swallowed into fake values. */
export class UpstreamError extends Error {
  constructor(
    readonly source: string,
    message: string,
    readonly status?: number,
  ) {
    super(`${source}: ${message}`);
    this.name = "UpstreamError";
  }
}

export interface FetchJsonOptions {
  source: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchJson<T>(url: string, opts: FetchJsonOptions): Promise<T> {
  const { source, headers, timeoutMs = 15_000, retries = 1 } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json", ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429) {
        // Respect the documented rate-limit reset header when present.
        const reset = Number(res.headers.get("x-ratelimit-reset"));
        const waitMs = Number.isFinite(reset) && reset > 0 ? Math.max(500, reset * 1000 - Date.now()) : 2_000;
        lastError = new UpstreamError(source, "rate limited (HTTP 429)", 429);
        if (attempt < retries) {
          await sleep(Math.min(waitMs, 10_000));
          continue;
        }
        throw lastError;
      }
      if (!res.ok) {
        const body = (await res.text().catch(() => "")).slice(0, 300);
        throw new UpstreamError(source, `HTTP ${res.status}${body ? ` — ${body}` : ""}`, res.status);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      const retryable =
        !(err instanceof UpstreamError) || (err.status !== undefined && (err.status >= 500 || err.status === 429));
      if (attempt < retries && retryable) {
        await sleep(600 * (attempt + 1));
        continue;
      }
      break;
    }
  }
  if (lastError instanceof UpstreamError) throw lastError;
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new UpstreamError(source, `request failed (${message})`);
}
