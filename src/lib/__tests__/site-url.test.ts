import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthRedirectBaseUrl, getSiteUrl } from "../site-url";

const KEYS = ["NEXT_PUBLIC_SITE_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL", "VERCEL_ENV"] as const;
const saved: Record<string, string | undefined> = {};

function env(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, values);
}

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

const LEADGEN_PROD = { VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "winsalot-leadgen-crm.vercel.app", VERCEL_URL: "winsalot-leadgen-abc-x.vercel.app" };
const GROWTH_PROD = { VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "winsalot-funding.vercel.app", VERCEL_URL: "winsalot-funding-abc-x.vercel.app" };

describe("site urls", () => {
  it("ignores the Growth domain saved on the Lead Gen project", () => {
    env({ ...LEADGEN_PROD, NEXT_PUBLIC_SITE_URL: "https://growth.winsalotcorp.com" });
    expect(getSiteUrl()).toBe("https://leads.winsalotcorp.com");
    expect(getAuthRedirectBaseUrl()).toBe("https://leads.winsalotcorp.com");
  });
  it("keeps a correct Lead Gen value", () => {
    env({ ...LEADGEN_PROD, NEXT_PUBLIC_SITE_URL: "https://leads.winsalotcorp.com/" });
    expect(getSiteUrl()).toBe("https://leads.winsalotcorp.com");
    expect(getAuthRedirectBaseUrl()).toBe("https://leads.winsalotcorp.com");
  });
  it("keeps the Growth domain on the Growth project", () => {
    env({ ...GROWTH_PROD, NEXT_PUBLIC_SITE_URL: "https://growth.winsalotcorp.com" });
    expect(getSiteUrl()).toBe("https://growth.winsalotcorp.com");
    expect(getAuthRedirectBaseUrl()).toBe("https://growth.winsalotcorp.com");
  });
  it("replaces the retired domain with the real Growth domain in production", () => {
    env({ ...GROWTH_PROD, NEXT_PUBLIC_SITE_URL: "https://cleaning.winsalotcorp.com" });
    expect(getSiteUrl()).toBe("https://growth.winsalotcorp.com");
    expect(getAuthRedirectBaseUrl()).toBe("https://growth.winsalotcorp.com");
  });
  it("keeps preview deployments on their own URL", () => {
    env({ VERCEL_ENV: "preview", VERCEL_PROJECT_PRODUCTION_URL: "winsalot-leadgen-crm.vercel.app", VERCEL_URL: "winsalot-leadgen-git-x.vercel.app" });
    expect(getAuthRedirectBaseUrl()).toBe("https://winsalot-leadgen-git-x.vercel.app");
    expect(getSiteUrl()).toBe("https://winsalot-leadgen-crm.vercel.app");
  });
  it("falls back to localhost with no Vercel environment", () => {
    env({});
    expect(getSiteUrl()).toBe("http://localhost:3000");
    expect(getAuthRedirectBaseUrl()).toBe("http://localhost:3000");
  });
});
