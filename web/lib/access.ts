import { timingSafeEqual } from "node:crypto";

/**
 * Optional shared access code for public deployments. When RANUS_ACCESS_CODE is set, the chat
 * endpoint (which spends Amazon Bedrock quota) requires it in the `x-ranus-access-code` header.
 */
export function accessCodeRequired(): boolean {
  return Boolean(process.env.RANUS_ACCESS_CODE?.trim());
}

export function hasAccess(req: Request): boolean {
  const code = process.env.RANUS_ACCESS_CODE?.trim();
  if (!code) return true;
  const given = Buffer.from(req.headers.get("x-ranus-access-code")?.trim() ?? "");
  const expected = Buffer.from(code);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
