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

  // Growth CRM hosts render "/" directly (src/app/page.tsx is already the
  // Growth CRM landing page) - no rewrite needed, unlike the Lead Gen
  // host above.

  // Cross-CRM isolation: /admin and /agent belong exclusively to the
  // Growth CRM, /leadgen/* exclusively to the Lead Gen CRM. Both Vercel
  // projects deploy this exact same codebase, so without this check
  // either CRM's routes render identically on the other's domain - this
  // is exactly what produced leads.winsalotcorp.com/admin displaying the
  // Growth CRM. Redirecting to "/" is safe on both hosts: the Lead Gen
  // host still gets its own rewrite above, and "/" is a fine landing page
  // on a Growth CRM host too.
  if (isLeadGenHost(host) && (pathname.startsWith("/admin") || pathname.startsWith("/agent"))) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  // /client is the Client Portal (brief: "MAIN CLIENT PORTAL LOCATION" -
  // https://leads.winsalotcorp.com/client) - it belongs exclusively to the
  // Lead Gen CRM, same as /leadgen itself, so it gets the same Growth CRM
  // host guard below.
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
    // set-password and forgot-password must work for a signed-out visitor
    // (that's the whole point of an invite/reset link), and shouldn't
    // bounce someone away just because they happen to already have an
    // unrelated session - unlike the login page itself, which does bounce
    // an already-authenticated visitor onward.
    return handleSessionGate(request, host, "/agent/login", "/agent/dashboard", [
      "/agent/set-password",
      "/agent/forgot-password",
    ]);
  }

  if (pathname.startsWith("/leadgen")) {
    // The Lead Generation CRM - a separate application from the cleaning
    // CRM above, with its own login/session (still Supabase Auth, just a
    // different leadgen_users role table - see src/lib/leadgen-auth.ts).
    // Same coarse "is there any session at all" gate as /admin and
    // /agent; role- and client-slug-specific authorization happens
    // server-side in requireLeadgenAdmin()/requireLeadgenAgent()/
    // requireLeadgenClient(). postLoginPath is /leadgen itself, which
    // dispatches to the right role's home.
    return handleSessionGate(request, host, "/leadgen/login", "/leadgen", [
      "/leadgen/set-password",
      "/leadgen/forgot-password",
    ]);
  }

  if (pathname.startsWith("/client")) {
    // The Client Portal itself - /client is both the login page and the
    // gate's loginPath (unlike every other section, which logs in at a
    // nested /login path), landing at /client/dashboard. Same Supabase
    // Auth session/cookie as /leadgen/* (authCookieName only varies by
    // host, not path) - role-specific authorization (must be an active
    // leadgen_users role='client' row) happens server-side in
    // requireLeadgenPortalClient() (src/lib/leadgen-auth.ts).
    return handleSessionGate(request, host, "/client", "/client/dashboard");
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

  // Server Action submissions (e.g. removeAgentAction, loginAction) POST
  // back to the current page URL carrying a `Next-Action` header, and the
  // browser's action runtime expects a Server Action response back - not
  // an arbitrary 3xx. A raw NextResponse.redirect() here breaks that fetch
  // and surfaces as an opaque error in the UI (this is what "removing an
  // agent produces an error" traced back to: the session had expired, this
  // gate 307'd the removeAgentAction POST to /admin/login, and the browser
  // couldn't parse a redirect where it expected an action response).
  // Every admin/agent Server Action already re-checks the session itself
  // (requireAdminUser/requireCrmAdmin/requireCrmUser, see src/lib/
  // admin-auth.ts and src/lib/crm-auth.ts) and calls redirect() from
  // *within* the action when it fails, which Next.js does encode correctly
  // for the client to follow - so it's safe to let these through and let
  // the action's own check redirect instead.
  const isServerAction = request.headers.has("next-action");

  if (!supabaseUrl || !anonKey) {
    // Fail closed rather than risk exposing the dashboard misconfigured.
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
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
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

// Root-cause fix for the "stuck on Signing in..." reports (2026-08-27,
// -28, -29): supabase.auth.getUser() makes a real network call to
// Supabase Auth, and neither the Supabase client nor Node's fetch applies
// a default timeout - on the rare occasion that call stalls instead of
// erroring, it used to hang until Vercel's own 300-second function cap
// killed the whole request, including a login-page POST that doesn't even
// need this check's result. Bounding it here means a stall now fails fast
// into "treat as not-yet-verified" (data.user = null) - on the login page
// itself that simply falls through to the real sign-in action instead of
// hanging, and on any other route it degrades to the same redirect-to-
// login path as a genuinely missing session. The loud console.error (shows
// up in Vercel's runtime logs/get_runtime_errors) is deliberate: it's the
// one signal that tells us whether a future "stuck signing in" report is
// this exact stall recurring, rather than something new.
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
  matcher: ["/", "/admin/:path*", "/agent/:path*", "/leadgen/:path*", "/client/:path*"],
};
