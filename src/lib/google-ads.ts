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
    dataLayer?: unknown[];
  }
}

const CONVERSION_SEND_TO = "AW-18338307179/g7jVCJfE69McEOu4sahE";

function fireConversion(url?: string) {
  const callback = function () {
    if (typeof url != "undefined") {
      window.location.href = url;
    }
  };

  // Some ad blockers / privacy extensions replace window.gtag with a
  // silent no-op rather than leaving it undefined, so the `typeof ===
  // "function"` check the caller already did can pass while nothing
  // actually happens. Recording dataLayer's length before/after the call
  // catches that case too - the real gtag() implementation always does
  // `dataLayer.push(arguments)` synchronously, so a genuine call grows it
  // immediately, before event_callback ever fires.
  const lengthBefore = Array.isArray(window.dataLayer) ? window.dataLayer.length : -1;

  window.gtag!("event", "conversion", {
    send_to: CONVERSION_SEND_TO,
    value: 1.0,
    currency: "CAD",
    event_callback: callback,
  });

  const dataLayerAfter = window.dataLayer;
  const grew = Array.isArray(dataLayerAfter) && dataLayerAfter.length > lengthBefore;
  if (!grew) {
    console.warn(
      "[google-ads] gtag_report_conversion: called window.gtag() but dataLayer" +
        (Array.isArray(dataLayerAfter) ? " did not grow" : " does not exist") +
        " - the conversion was likely silently blocked by a browser extension (ad blocker / privacy tool - some redirect googletagmanager.com/gtag/js to a local no-op stub instead of just blocking it outright), not an application bug. Try again in an incognito window with extensions disabled to confirm."
    );
  }
}

export function gtag_report_conversion(url?: string) {
  if (typeof window === "undefined") return false;

  if (typeof window.gtag === "function") {
    fireConversion(url);
    return false;
  }

  // window.gtag isn't defined yet. The base tag's inline script (see
  // GoogleAdsTag.tsx) normally runs on page load, well before a visitor
  // could fill out and submit the quote form - but rather than silently
  // dropping a conversion for a request that *did* save successfully if
  // that script is ever slow (or briefly delayed by the browser), poll
  // for up to 2s before giving up. Logs either way so a real gap between
  // "the quote saved" and "no conversion recorded" is diagnosable from
  // the browser console instead of failing silently.
  let attempts = 0;
  const maxAttempts = 20; // 20 x 100ms = 2s
  const interval = setInterval(() => {
    attempts++;
    if (typeof window.gtag === "function") {
      clearInterval(interval);
      fireConversion(url);
    } else if (attempts >= maxAttempts) {
      clearInterval(interval);
      console.warn(
        "[google-ads] gtag_report_conversion: window.gtag never became available after a successful quote save - no conversion was sent. This usually means the base tag script (googletagmanager.com/gtag/js) was blocked - check for an ad blocker or privacy extension."
      );
    }
  }, 100);

  return false;
}
