import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { LEAD_GEN_HOSTS, isLeadGenHost, isGrowthCrmHost, authCookieName } from "@/lib/hosts";

export async function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0];
  const { pathname } = request.nextUrl;

  if (pathname === "/" && LEAD_GEN_HOSTS.has(host)) {
    return NextResponse.rewrite(new URL("/lead-generation", request.url));
  }

  if (isLeadGenHost(host) && (pathname.startsWith("/admin") || pathname.startsWith("/agent"))) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (isGrowthCrmHost(host) && (pathname.startsWith("/leadgen") || pathname.startsWith("/client"))) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (isLeadGenHost(host) && pathname.startsWith("/subcontractor")) {
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
    return handleSessionGate(request, host, "/client", "/client/dashboard", [
      "/client/auth/callback",
      "/client/setup",
      "/client/reset-password",
    ]);
  }

  if (pathname.startsWith("/subcontractor")) {
    return handleSessionGate(request, host, "/subcontractor", "/subcontractor/dashboard", [
      "/subcontractor/auth/callback",
      "/subcontractor/setup",
      "/subcontractor/reset-password",
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

  const { data } = await getUserWithTimeout(supabase, pathname);

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

async function getUserWithTimeout(
  supabase: SupabaseClient,
  pathname: string
): Promise<{ data: { user: User | null } }> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), GET_USER_TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([supabase.auth.getUser(), timeout]);
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
  matcher: ["/", "/admin/:path*", "/agent/:path*", "/leadgen/:path*", "/client/:path*", "/subcontractor/:path*"],
};
