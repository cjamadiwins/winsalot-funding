"use client";

import { useEffect } from "react";

// Defense in depth for Supabase Auth email links: if Supabase's Site URL /
// Redirect URLs configuration doesn't exactly match what the app asked
// for in `redirectTo`, Supabase silently falls back to redirecting to the
// bare Site URL root instead - which, on this project, is a public
// marketing/quote page. The access_token still ends up in the URL hash
// (hash fragments are never sent to or altered by the server), just on
// the wrong page. This component runs on every page via the root layout
// and, the instant it sees an invite/recovery hash fragment, immediately
// forwards the browser to /agent/set-password with that same fragment
// intact - so an invitation link can never leave someone stranded on a
// public page with a live token doing nothing, even if the Supabase
// dashboard config drifts again later.
export default function AuthInviteRedirector() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname.startsWith("/agent/set-password")) return;

    const hash = window.location.hash;
    if (!hash || !hash.includes("access_token=")) return;
    if (!/type=(invite|recovery)/.test(hash)) return;

    window.location.replace(`/agent/set-password${hash}`);
  }, []);

  return null;
}
