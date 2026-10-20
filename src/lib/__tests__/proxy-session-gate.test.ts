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
const loggedIn = (meta: Record<string, unknown> = {}) => ({ data: { user: { id: "u1", user_metadata: meta } }, error: null });
const loggedOut = { data: { user: null }, error: null };
const location = (res: Response) => res.headers.get("location");

beforeEach(() => { getUser.mockReset(); getClaims.mockReset(); });

describe("page requests", () => {
  it("sends an anonymous visitor to the login page and remembers where they were going", async () => {
    getUser.mockResolvedValue(loggedOut);
    const res = await proxy(req("/agent/dashboard"));
    expect(res.status).toBe(307);
    expect(location(res)).toContain("/agent/login");
    expect(location(res)).toContain("redirectTo=%2Fagent%2Fdashboard");
  });

  it("lets a signed-in user through", async () => {
    getUser.mockResolvedValue(loggedIn());
    const res = await proxy(req("/agent/dashboard"));
    expect(res.status).toBe(200);
    expect(location(res)).toBeNull();
  });

  it("bounces a signed-in user away from the login page", async () => {
    getUser.mockResolvedValue(loggedIn());
    const res = await proxy(req("/leadgen/login"));
    expect(location(res)).toContain("/leadgen");
    expect(location(res)).not.toContain("/login");
  });

  it("serves public auth pages to anonymous visitors", async () => {
    getUser.mockResolvedValue(loggedOut);
    expect((await proxy(req("/agent/forgot-password"))).status).toBe(200);
    expect((await proxy(req("/agent/login"))).status).toBe(200);
  });

  it("forces admins with a temporary password to the set-password page", async () => {
    getUser.mockResolvedValue(loggedIn({ must_change_password: true }));
    const res = await proxy(req("/admin/crm"));
    expect(location(res)).toContain("/admin/set-password");
  });

  it("treats a hung Auth server as 'no session' instead of hanging the request", async () => {
    vi.useFakeTimers();
    getUser.mockReturnValue(new Promise(() => {}));
    const pending = proxy(req("/agent/dashboard"));
    await vi.advanceTimersByTimeAsync(8100);
    const res = await pending;
    vi.useRealTimers();
    expect(location(res)).toContain("/agent/login");
  });
});

describe("server actions (POST with a next-action header)", () => {
  it("never redirects, signed in or not - each action checks the user itself", async () => {
    getUser.mockResolvedValue(loggedOut);
    expect((await proxy(req("/leadgen/agent", { serverAction: true }))).status).toBe(200);
    getUser.mockResolvedValue(loggedIn({ must_change_password: true }));
    expect((await proxy(req("/admin/crm", { serverAction: true }))).status).toBe(200);
    getUser.mockResolvedValue(loggedIn());
    expect(location(await proxy(req("/leadgen/login", { serverAction: true })))).toBeNull();
  });

  it("does not make an Auth-server round trip of its own (the action authenticates itself)", async () => {
    getUser.mockResolvedValue(loggedIn());
    getClaims.mockResolvedValue({ data: { claims: { sub: "u1" } }, error: null });
    await proxy(req("/leadgen/agent", { serverAction: true }));
    expect(getUser).not.toHaveBeenCalled();
    expect(getClaims).not.toHaveBeenCalled();
  });
});
