import { defineConfig } from "vitest/config";
import path from "node:path";

// Vitest runs test files through plain Node, not Next.js's own bundler -
// so the `server-only` package's unconditional `throw` (its only job
// under webpack/Turbopack is a build-time-enforced boundary, a no-op at
// actual runtime) needs a stub here, same as Next.js's own recommended
// testing setup. Files that `import "server-only"` (email-senders.ts,
// send-crm-invoice-email.ts, etc.) can otherwise never be imported by a
// test at all.
export default defineConfig({
  resolve: {
    alias: [
      { find: "server-only", replacement: path.resolve(import.meta.dirname, "test/stubs/server-only.ts") },
      { find: /^@\//, replacement: path.resolve(import.meta.dirname, "src") + "/" },
    ],
  },
});
