import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Weekly Dialpad CSV exports are committed straight to the repo root
  // (no import statement ever references them), so Vercel's per-function
  // file tracing would otherwise drop them from the deployed bundle -
  // this keeps them available to fs.readFileSync at runtime for every
  // route (findLatestDialpadUserStatisticsCsv, src/lib/dialpad-csv-source.ts).
  outputFileTracingIncludes: {
    "/**": ["./*.csv"],
    // Blank lender application forms served by admin-gated route handlers.
    "/admin/crm/lending-partners/canacap/application": ["./lender-forms/**/*.pdf"],
  },
};

export default nextConfig;
