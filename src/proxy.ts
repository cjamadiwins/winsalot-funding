import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { LEAD_GEN_HOSTS, isLeadGenHost, isGrowthCrmHost, authCookieName } from "@/lib/hosts";

export async function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0];
  const { pathname } = request.nextUrl;

  if (pathname === "/" && LEAD_GEN_HOSTS.has(host)) {
    return NextResponse.redirect(new URL("/leadgen", request.url));
  }

  if (isLeadGenHost(host) && (pathname.startsWith("/admin") || pathname.startsWith("/agent") || pathname.startsWith("/subcontractor"))) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (isGrowthCrmHost(host) && (pathname.startsWith("/leadgen") || pathname.startsWith("/client"))) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (pathname.startsWith("/admin")) {
    return handleSessionGate(
      request,
      host,
      "/admin/login",
      "/admin",
      ["/admin/forgot-password", "/admin/set-password"],
      "/admin/set-password"
    );
  }

  if (pathname.startsWith("/agent")) {
    return handleSessionGate(request, host, "/agent/login", "/agent/dashboard", [
      "/agent/set-password",
      "/agent/forgot-password",
    ]);
  }

  if (pathname.startsWith("/subcontractor")) {
    return handleSessionGate(request, host, "/subcontractor/login", "/subcontractor/dashboard", [
      "/subcontractor/set-password",
      "/subcontractor/forgot-password",
    ]);
  }

  if (pathname.startsWith("/leadgen")) {
    return handleSessionGate(request, host, "/leadgen/login", "/leadgen", [
      "/leadgen/set-password",
      "/leadgen/forgot-password",
    ]);
  }

  if (pathname.startsWith("/client")) {
    // These three endpoints are part of the branded client auth handshake.
    // The callback must be reachable before a session exists; setup/reset
    // pages then perform their own role checks server-side. No Supabase URL
    // or Growth CRM route is exposed to the browser during this flow.
    return handleSessionGate(request, host, "/client", "/leadgen", [
      "/client/auth/callback",
      "/client/setup",
      "/client/reset-password",
    ]);
  }

  return NextResponse.next();
}

async function handleSessionGate(
  request: NextRequest,
  host: string,
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
  const isServerAction = request.headers.has("next-action");

  if (!supabaseUrl || !anonKey) {
    if (!isPublicPath && !isServerAction) {
      return NextResponse.redirect(new URL(loginPath, request.url));
    }
    return response;
  }

  // Server Actions are never redirected or blocked here (every branch below
  // returns `response` untouched for them - each action authenticates itself
  // through the require*() gates, which also refresh an expiring session and
  // may set cookies from an action). The Auth-server lookup below would only
  // add one network round trip per action, which adds up for the background
  // check-ins (attendance and script-status) that fire every 30-60 seconds
  // for every clocked-in agent.
  if (isServerAction) return response;

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookieOptions: { name: authCookieName(host) },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Verify the session token locally (getClaims) instead of asking the Auth
  // server (getUser) when it is safe to: only on protected pages (never the
  // login/public pages, where a revoked-but-unexpired token would otherwise
  // bounce between login and dashboard) and only on gates with no forced
  // password-change check (that flag lives in user metadata, which a cached
  // token does not reflect until it is refreshed). With asymmetric JWT signing
  // keys this saves one Auth round trip per page request/prefetch; with the
  // legacy shared secret the Supabase client transparently falls back to
  // getUser(), so behaviour is identical. Every page and action still calls
  // getUser() itself via the require*() gates, so a revoked session is
  // rejected there regardless.
  const useLocalClaims = !isPublicPath && !forcePasswordChangePath;
  const { data } = await getUserWithTimeout(supabase, pathname, useLocalClaims);

  if (!data.user && !isPublicPath) {
    if (isServerAction) return response;
    const loginUrl = new URL(loginPath, request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (data.user && pathname === loginPath) {
    if (isServerAction) return response;
    return NextResponse.redirect(new URL(postLoginPath, request.url));
  }

  if (
    forcePasswordChangePath &&
    data.user?.user_metadata?.must_change_password &&
    pathname !== forcePasswordChangePath &&
    !isPublicPath
  ) {
    if (isServerAction) return response;
    return NextResponse.redirect(new URL(forcePasswordChangePath, request.url));
  }

  return response;
}

const GET_USER_TIMEOUT_MS = 8000;

// getClaims() verifies the access token's signature and expiry locally (it also
// refreshes a token that is about to expire). Anything other than a verified
// token - no session, invalid or expired token, an error - means "no session",
// exactly like getUser() returning no user.
async function getUserFromClaims(supabase: SupabaseClient): Promise<{ data: { user: User | null } }> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return { data: { user: null } };
  const claims = data.claims as { sub: string; user_metadata?: Record<string, unknown> };
  return { data: { user: { id: claims.sub, user_metadata: claims.user_metadata ?? {} } as unknown as User } };
}

async function getUserWithTimeout(
  supabase: SupabaseClient,
  pathname: string,
  useLocalClaims = false
): Promise<{ data: { user: User | null } }> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), GET_USER_TIMEOUT_MS);
  });

  try {
    const lookup = useLocalClaims ? getUserFromClaims(supabase) : supabase.auth.getUser();
    const result = await Promise.race([lookup, timeout]);
    if (result === "timeout") {
      console.error(
        `[proxy:getUserWithTimeout] supabase.auth.getUser() did not respond within ${GET_USER_TIMEOUT_MS}ms for ${pathname} - treating as no session.`
      );
      return { data: { user: null } };
    }
    return result;
  } catch (error) {
    console.error(`[proxy:getUserWithTimeout] supabase.auth.getUser() threw for ${pathname} - treating as no session.`, error);
    return { data: { user: null } };
  } finally {
    clearTimeout(timer!);
  }
}

export const config = {
  matcher: ["/", "/admin/:path*", "/agent/:path*", "/subcontractor/:path*", "/leadgen/:path*", "/client/:path*"],
};
