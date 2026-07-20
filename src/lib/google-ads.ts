// Event snippet Google Ads generates for the "Request quote" conversion
// action (AW-18338307179/g7jVCJfE69McEOu4sahE), kept as close to that
// snippet as possible. The only change is the guard on window.gtag: the
// base gtag.js tag only loads on cleaning.winsalotcorp.com (see
// src/components/GoogleAdsTag.tsx), so on every other host this quietly
// no-ops instead of throwing - which is what restricts this conversion
// event to that same host.
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function gtag_report_conversion(url?: string) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") {
    return false;
  }

  const callback = function () {
    if (typeof url != "undefined") {
      window.location.href = url;
    }
  };
  window.gtag("event", "conversion", {
    send_to: "AW-18338307179/g7jVCJfE69McEOu4sahE",
    value: 1.0,
    currency: "CAD",
    event_callback: callback,
  });
  return false;
}
