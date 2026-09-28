"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Keeps notification/badge data fresh without continuously re-running the
// entire Server Component layout. The previous 25-second router.refresh()
// loop could overlap with slow layout requests on both CRMs, leaving the
// browser tab perpetually busy and making clicks/navigation feel stuck.
//
// Refresh once when the tab becomes visible again, with a short cooldown so
// browser focus/visibility churn cannot trigger a burst of overlapping
// refreshes. Normal route navigation already re-renders the layout, so no
// background polling is needed here.
export default function NotificationRefresher({ cooldownMs = 30_000 }: { cooldownMs?: number }) {
  const router = useRouter();
  const lastRefreshAt = useRef(0);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState !== "visible") return;

      const now = Date.now();
      if (now - lastRefreshAt.current < cooldownMs) return;

      lastRefreshAt.current = now;
      router.refresh();
    }

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [router, cooldownMs]);

  return null;
}
