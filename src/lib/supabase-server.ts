import "server-only";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { authCookieName } from "./hosts";

// Session-aware Supabase client for use in Server Components, Route
// Handlers, and Server Actions under /admin. Uses the public anon key and
// is only ever used to check *who is logged in* (auth.getUser / signOut) —
// actual admin data reads/writes go through the service-role client in
// supabase-admin.ts after the caller has been verified with this client.
// Create a fresh instance per request; never share across requests.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const host = (await headers()).get("host") ?? "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables."
    );
  }

  return createServerClient(supabaseUrl, anonKey, {
    // A distinct cookie name per CRM (see src/lib/hosts.ts) so a session
    // for one can never be read, overwritten, or invalidated by the
    // other, even if something ever collapsed both apps onto what the
    // browser sees as a single origin.
    cookieOptions: { name: authCookieName(host.split(":")[0]) },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // Diagnostic-only (2026-08-29 "stuck on Signing in..." incident) -
        // this is the actual session/cookie-creation step in the login
        // flow: the Supabase client calls this synchronously while
        // processing a signInWithPassword/refresh response, before that
        // call's own promise resolves. An absolute timestamp here (rather
        // than an elapsed delta, since this file has no attempt id) can be
        // cross-referenced against src/lib/login-timing.ts's own absolute
        // timestamps and Supabase's edge/auth logs. Remove alongside that
        // instrumentation once the login stall is root-caused and fixed.
        if (cookiesToSet.length > 0) {
          console.log(
            `[login-timing] session cookies written at=${new Date().toISOString()} count=${cookiesToSet.length}`
          );
        }
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component that can't set cookies directly.
          // Safe to ignore: proxy.ts refreshes the session on every /admin
          // request, so the cookie still gets written on the next hop.
        }
      },
    },
  });
}

// Request-scoped memoization for the single most expensive step every
// admin/agent auth gate performs. auth.getUser() always validates the
// session against Supabase's Auth server over the network (never just a
// local JWT decode), and nearly every route in this app calls a
// require*() gate in BOTH its shared layout and its own page.tsx
// (defense in depth - see requireAdminUser/requireCrmAdmin's own
// comments), plus getUserTimeZonePreferences() does its own separate
// getUser() call in every layout on top of that. That used to mean 3+
// separate network round trips for the exact same session on every
// single navigation - a significant, measurable contributor to slow/
// unresponsive sidebar clicks. cache() (from "react") ensures every
// call to this within one request/render reuses the same in-flight or
// resolved result instead of re-issuing it - it changes nothing about
// who is authenticated or what they can access, only how many times the
// identical check runs.
export const getCachedAuthUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  return supabase.auth.getUser();
});
