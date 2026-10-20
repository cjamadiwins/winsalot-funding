import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Characterization + regression tests for the session gate in src/proxy.ts.
// @supabase/ssr is mocked so we can count how many Auth-server round trips a
// request causes and control what the session looks like.
const getUser = vi.fn();
const getClaims = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser, getClaims } }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";

const { proxy } = await import("../../proxy");

// /leadgen is served on the Lead Gen host and /admin, /agent on the Growth CRM
// host; the proxy redirects a request that arrives on the wrong one.
const hostFor = (path: string) => (path.startsWith("/leadgen") ? "leads.winsalotcorp.com" : "growth.winsalotcorp.com");
const req = (path: string, opts: { host?: string; serverAction?: boolean } = {}) => {
  const host = opts.host ?? hostFor(path);
  return new NextRequest(`https://${host}${path}`, {
    method: opts.serverAction ? "POST" : "GET",
    headers: { host, ...(opts.serverAction ? { "next-action": "abc123" } : {}) },
  });
};
type Session = { id: string; user_metadata: Record<string, unknown> } | null;
let session: Session = null;
// One session model behind both lookups, so a test describes "who is signed in"
// and the proxy may verify it either way.
const signedIn = (meta: Record<string, unknown> = {}) => { session = { id: "u1", user_metadata: meta }; };
const signedOut = () => { session = null; };
const location = (res: Response) => res.headers.get("location");

beforeEach(() => {
  session = null;
  getUser.mockReset().mockImplementation(async () => ({ data: { user: session }, error: null }));
  getClaims.mockReset().mockImplementation(async () =>
    session ? { data: { claims: { sub: session.id, user_metadata: session.user_metadata } }, error: null } : { data: null, error: null }
  );
});

describe("page requests", () => {
  it("sends an anonymous visitor to the login page and remembers where they were going", async () => {
    signedOut();
    const res = await proxy(req("/agent/dashboard"));
    expect(res.status).toBe(307);
    expect(location(res)).toContain("/agent/login");
    expect(location(res)).toContain("redirectTo=%2Fagent%2Fdashboard");
  });

  it("lets a signed-in user through", async () => {
    signedIn();
    const res = await proxy(req("/agent/dashboard"));
    expect(res.status).toBe(200);
    expect(location(res)).toBeNull();
  });

  it("bounces a signed-in user away from the login page", async () => {
    signedIn();
    const res = await proxy(req("/leadgen/login"));
    expect(location(res)).toContain("/leadgen");
    expect(location(res)).not.toContain("/login");
  });

  it("serves public auth pages to anonymous visitors", async () => {
    signedOut();
    expect((await proxy(req("/agent/forgot-password"))).status).toBe(200);
    expect((await proxy(req("/agent/login"))).status).toBe(200);
  });

  it("forces admins with a temporary password to the set-password page", async () => {
    signedIn({ must_change_password: true });
    const res = await proxy(req("/admin/crm"));
    expect(location(res)).toContain("/admin/set-password");
  });

  it("treats a hung Auth server as 'no session' instead of hanging the request", async () => {
    vi.useFakeTimers();
    getUser.mockReturnValue(new Promise(() => {}));
    getClaims.mockReturnValue(new Promise(() => {}));
    const pending = proxy(req("/agent/dashboard"));
    await vi.advanceTimersByTimeAsync(8100);
    const res = await pending;
    vi.useRealTimers();
    expect(location(res)).toContain("/agent/login");
  });
});

describe("server actions (POST with a next-action header)", () => {
  it("never redirects, signed in or not - each action checks the user itself", async () => {
    signedOut();
    expect((await proxy(req("/leadgen/agent", { serverAction: true }))).status).toBe(200);
    signedIn({ must_change_password: true });
    expect((await proxy(req("/admin/crm", { serverAction: true }))).status).toBe(200);
    signedIn();
    expect(location(await proxy(req("/leadgen/login", { serverAction: true })))).toBeNull();
  });

  it("does not make an Auth-server round trip of its own (the action authenticates itself)", async () => {
    signedIn();
    await proxy(req("/leadgen/agent", { serverAction: true }));
    expect(getUser).not.toHaveBeenCalled();
    expect(getClaims).not.toHaveBeenCalled();
  });
});

describe("local token verification (getClaims) on protected pages", () => {
  it("uses getClaims, not an Auth-server lookup, for agent / leadgen / subcontractor / client pages", async () => {
    signedIn();
    for (const path of ["/agent/dashboard", "/leadgen/agent", "/subcontractor/dashboard"]) {
      const res = await proxy(req(path));
      expect(res.status).toBe(200);
    }
    expect(getClaims).toHaveBeenCalledTimes(3);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("redirects to login when the token is missing, invalid or expired", async () => {
    for (const result of [{ data: null, error: null }, { data: null, error: new Error("bad jwt") }, { data: { claims: {} }, error: null }]) {
      getClaims.mockResolvedValue(result);
      expect(location(await proxy(req("/agent/dashboard")))).toContain("/agent/login");
    }
  });

  it("a revoked session whose token still verifies cannot cause a login <-> dashboard redirect loop", async () => {
    // Token verifies locally (not expired) but the Auth server no longer knows the session.
    getClaims.mockResolvedValue({ data: { claims: { sub: "u1", user_metadata: {} } }, error: null });
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await proxy(req("/agent/dashboard"))).status).toBe(200); // the page's own getUser() then sends them to login
    const login = await proxy(req("/agent/login"));
    expect(login.status).toBe(200); // login page is served, not bounced back to the dashboard
    expect(location(login)).toBeNull();
  });

  it("keeps the authoritative Auth-server lookup on login/public pages", async () => {
    signedOut();
    const res = await proxy(req("/agent/login"));
    expect(res.status).toBe(200);
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(getClaims).not.toHaveBeenCalled();
  });

  it("keeps the authoritative lookup for /admin, where the forced password change flag must be fresh", async () => {
    signedIn({ must_change_password: true });
    expect(location(await proxy(req("/admin/crm")))).toContain("/admin/set-password");
    expect(getClaims).not.toHaveBeenCalled();
  });

  it("treats a hung verification as no session", async () => {
    vi.useFakeTimers();
    getClaims.mockReturnValue(new Promise(() => {}));
    const pending = proxy(req("/agent/dashboard"));
    await vi.advanceTimersByTimeAsync(8100);
    const res = await pending;
    vi.useRealTimers();
    expect(location(res)).toContain("/agent/login");
  });
});
