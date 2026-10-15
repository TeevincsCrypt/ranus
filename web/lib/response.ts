/**
 * Browser-side: read a JSON API response, and when it isn't usable (HTTP error, empty or non-JSON
 * body) throw an error that names the HTTP status and what the server actually sent.
 */
export interface ApiErrorInfo {
  message: string;
  code?: string;
}

async function parseBody(res: Response): Promise<{ text: string; json: Record<string, unknown> | null }> {
  const text = await res.text();
  if (!text) return { text, json: null };
  try {
    const json = JSON.parse(text) as unknown;
    return { text, json: json && typeof json === "object" ? (json as Record<string, unknown>) : null };
  } catch {
    return { text, json: null };
  }
}

function describe(res: Response, text: string, json: Record<string, unknown> | null): ApiErrorInfo {
  if (typeof json?.error === "string") return { message: json.error, code: typeof json.code === "string" ? json.code : undefined };
  const snippet = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
  return { message: `Server returned HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}: ${snippet || "empty response"}` };
}

export async function readApiJson<T>(res: Response): Promise<T> {
  const { text, json } = await parseBody(res);
  if (!res.ok || !json) throw new Error(describe(res, text, json).message);
  return json as T;
}

export async function readApiError(res: Response): Promise<ApiErrorInfo> {
  const { text, json } = await parseBody(res);
  return describe(res, text, json);
}
