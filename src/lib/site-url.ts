import "server-only";

// Resolves the absolute base URL to use for links inside server-sent
// notifications (SMS/email), where a relative path won't work. Prefers an
// explicit override so links point at the real custom domain rather than a
// Vercel preview/production hostname.
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;

  return "http://localhost:3000";
}
