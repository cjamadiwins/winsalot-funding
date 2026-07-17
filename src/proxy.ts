import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const LEAD_GEN_HOSTS = new Set([
  "leads.winsalotcorp.com",
  "www.leads.winsalotcorp.com",
]);

const CLEANING_QUOTE_HOSTS = new Set([
  "cleaning.winsalotcorp.com",
  "www.cleaning.winsalotcorp.com",
]);

export async function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0];
  const { pathname } = request.nextUrl;

  if (pathname === "/" && LEAD_GEN_HOSTS.has(host)) {
    return NextResponse.rewrite(new URL("/lead-generation", request.url));
  }

  if (pathname === "/" && CLEANING_QUOTE_HOSTS.has(host)) {
    return NextResponse.rewrite(new URL("/commercial-cleaning-quote", request.url));
  }

  if (pathname.startsWith("/admin")) {
    return handleAdminAuth(request);
  }

  return NextResponse.next();
}

// Refreshes the Supabase Auth session cookie and gates /admin/* behind a
// logged-in user. This is the first line of defense, not the only one —
// every admin Server Action independently re-checks the session too (see
// src/lib/admin-auth.ts), since Server Functions can bypass a proxy
// matcher after an unrelated refactor.
async function handleAdminAuth(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    // Fail closed rather than risk exposing the dashboard misconfigured.
    if (request.nextUrl.pathname !== "/admin/login") {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return response;
  }

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const isLoginPage = request.nextUrl.pathname === "/admin/login";

  if (!data.user && !isLoginPage) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (data.user && isLoginPage) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/", "/admin/:path*"],
};
