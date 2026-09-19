import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Generic at-rest encryption for secrets this app must store in the
// database (currently just the Call List Segments feature's Google OAuth
// tokens - see src/lib/call-list-connections.ts). No existing table in
// this schema stores a third-party secret, so there's no prior pattern to
// follow here; AES-256-GCM with a single Vercel-project env var key is
// the simplest correct option, consistent with how every other
// integration in this app (Twilio, Resend, Calendly) already keeps its
// credentials in env vars rather than the database.
function getKey(): Buffer {
  const raw = process.env.GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY is not set - cannot encrypt or decrypt Google OAuth tokens.");
  }
  const key = raw.trim().length === 64 ? Buffer.from(raw.trim(), "hex") : Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) {
    throw new Error("GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (a base64 or hex-encoded AES-256 key).");
  }
  return key;
}

// Format: base64(iv).base64(authTag).base64(ciphertext) - self-contained,
// so no separate column is needed for the IV/tag.
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decryptSecret(encoded: string): string {
  const [ivB64, authTagB64, ciphertextB64] = encoded.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted secret.");
  }
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}
