"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Brief: "Update the status automatically without requiring the page to
// be refreshed, or refresh it when the user returns to the
// communication history." Re-fetches this Server Component page's data
// (router.refresh()) whenever the tab regains focus/visibility, so a
// delivery-status change that arrived via the Resend webhook while the
// user was away shows up the moment they come back - no manual reload
// needed. Renders nothing; drop it anywhere on a page that shows
// leadgen_emails status.
export default function RefreshOnFocus() {
  const router = useRouter();

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") router.refresh();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [router]);

  return null;
}
