import "server-only";

// Temporary diagnostic-only instrumentation for the 2026-08-29 "stuck on
// Signing in..." incident. The stall observed in production jumped between
// different Supabase calls on different attempts (the password grant once,
// the crm_users lookup another time, getUser() after that) rather than any
// one of them being reliably slow - this traces every step of the login
// server actions with both an absolute timestamp (to cross-reference
// against Supabase's own edge/auth logs) and an elapsed-since-start delta
// (to read a single attempt's timeline at a glance in Vercel's logs).
// Intentionally does not log email/password - only a random per-attempt id
// to correlate lines from the same request. Remove once the underlying
// network stall between Vercel and Supabase is root-caused and fixed.
export function newLoginAttemptId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function logLoginTiming(attemptId: string, label: string, startedAt: number): void {
  const now = Date.now();
  console.log(`[login-timing:${attemptId}] ${label} at=${new Date(now).toISOString()} t=+${now - startedAt}ms`);
}
