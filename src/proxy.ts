import { NextRequest, NextResponse } from "next/server";

const LEAD_GEN_HOSTS = new Set([
  "leads.winsalotcorp.com",
  "www.leads.winsalotcorp.com",
]);

export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0];

  if (LEAD_GEN_HOSTS.has(host)) {
    return NextResponse.rewrite(new URL("/lead-generation", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/",
};