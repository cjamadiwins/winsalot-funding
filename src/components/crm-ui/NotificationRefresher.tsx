"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Keeps the notification bell (and any nav badge counts computed in the
// same Server Component layout) reasonably close to real-time without
// Supabase Realtime, which nothing in this app uses yet - "Use Supabase
// Realtime if it is already supported safely; otherwise use reliable
// refresh/polling." Re-fetches the layout's data (router.refresh()) on
// an interval, and immediately whenever the tab regains focus/visibility
// so a notification that arrived while the user was away shows up the
// moment they come back. Renders nothing; drop it once anywhere inside
// a CRM dashboard layout.
export default function NotificationRefresher({ intervalMs = 25_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), intervalMs);

    function handleVisibility() {
      if (document.visibilityState === "visible") router.refresh();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [router, intervalMs]);

  return null;
}
