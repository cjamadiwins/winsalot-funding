import "server-only";
import { randomBytes, createHash } from "crypto";

// Generates the raw token handed to a provider in their quote link. Only
// its hash is ever stored (see hashProviderToken) — the raw value exists
// only in the URL and in the admin dashboard's one-time "copy link" view.
export function generateProviderToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashProviderToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
