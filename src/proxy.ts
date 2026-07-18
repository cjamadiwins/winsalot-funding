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
    return handleSessionGate(
      request,
      "/admin/login",
      "/admin",
      ["/admin/forgot-password", "/admin/set-password"],
      "/admin/set-password"
    );
  }

  if (pathname.startsWith("/agent")) {
    // set-password and forgot-password must work for a signed-out visitor
    // (that's the whole point of an invite/reset link), and shouldn't
    // bounce someone away just because they happen to already have an
    // unrelated session - unlike the login page itself, which does bounce
    // an already-authenticated visitor onward.
    return handleSessionGate(request, "/agent/login", "/agent/dashboard", [
      "/agent/set-password",
      "/agent/forgot-password",
    ]);
  }

  return NextResponse.next();
}

// Refreshes the Supabase Auth session cookie and gates a section of the
// site (/admin/* or /agent/*) behind a logged-in user. This is the first
// line of defense, not the only one — every admin/agent Server Action
// independently re-checks the session too (see src/lib/admin-auth.ts and
// src/lib/crm-auth.ts), since Server Functions can bypass a proxy matcher
// after an unrelated refactor.
//
// This only confirms *a* Supabase session exists, same as before this
// function was shared between /admin and /agent — role-specific checks
// (e.g. blocking a CRM agent account from /admin, or requiring an active
// crm_users row for /agent) happen server-side in requireAdminUser() and
// requireCrmUser()/requireCrmAdmin(), not here.
//
// publicPaths are reachable whether or not a session exists, and never
// trigger the "already signed in, bounce to postLoginPath" redirect that
// the login page itself gets - only exact-matching loginPath does that.
//
// forcePasswordChangePath, when given, redirects a signed-in visitor
// whose account has user_metadata.must_change_password set (an operator-
// initiated reset, see src/lib/admin-auth.ts) to that path before letting
// them reach anything else in this section - except the public paths and
// that path itself, so the reset flow doesn't redirect-loop.
async function handleSessionGate(
  request: NextRequest,
  loginPath: string,
  postLoginPath: string,
  publicPaths: string[] = [],
  forcePasswordChangePath?: string
) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const pathname = request.nextUrl.pathname;
  const isPublicPath = pathname === loginPath || publicPaths.includes(pathname);

  if (!supabaseUrl || !anonKey) {
    // Fail closed rather than risk exposing the dashboard misconfigured.
    if (!isPublicPath) {
      return NextResponse.redirect(new URL(loginPath, request.url));
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

  if (!data.user && !isPublicPath) {
    const loginUrl = new URL(loginPath, request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (data.user && pathname === loginPath) {
    return NextResponse.redirect(new URL(postLoginPath, request.url));
  }

  if (
    forcePasswordChangePath &&
    data.user?.user_metadata?.must_change_password &&
    pathname !== forcePasswordChangePath &&
    !isPublicPath
  ) {
    return NextResponse.redirect(new URL(forcePasswordChangePath, request.url));
  }

  return response;
}

export const config = {
  matcher: ["/", "/admin/:path*", "/agent/:path*"],
};
