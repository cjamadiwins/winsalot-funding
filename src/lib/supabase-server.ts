import "server-only";
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
