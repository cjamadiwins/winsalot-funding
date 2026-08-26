// Test-only stub for the `server-only` package (aliased in vitest.config.ts).
// The real package unconditionally throws when required - a build-time-only
// enforcement mechanism under Next.js's own bundler, meaningless (and
// actively harmful) under plain Node, which is what Vitest runs on.
export {};
