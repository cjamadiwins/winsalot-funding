import { createBrowserClient } from "@supabase/ssr";

// The only browser-side Supabase client in this codebase - every other
// page uses the cookie-based server client (supabase-server.ts). Needed
// specifically for /agent/set-password: Supabase invite/recovery links
// can arrive as a URL hash fragment (#access_token=...), which only ever
// reaches the browser, never the server. createBrowserClient (unlike the
// plain supabase-js client) syncs the resulting session into cookies, so
// the rest of the app's server-side session checks pick it up immediately
// afterward.
export function createSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables."
    );
  }

  return createBrowserClient(supabaseUrl, anonKey);
}
