import { headers } from "next/headers";
import Script from "next/script";
import { CLEANING_QUOTE_HOSTS } from "@/lib/hosts";

const GOOGLE_ADS_ID = "AW-18338307179";

// Renders the Google Ads base tag only when the request's Host header is
// the public cleaning quote site. This app serves several unrelated
// products (admin/agent CRM, sales tracker, funding pitch, lead
// generation) from the same deployment, so gating on the host - the same
// check src/proxy.ts uses to route cleaning.winsalotcorp.com - is what
// keeps Ads conversion tracking off everything else.
//
// Also renders on this project's own Vercel Preview deployments
// (VERCEL_ENV, a server-only build-time value Vercel sets itself - not
// something a visitor's request can spoof) so a reviewer can validate the
// tag/conversion wiring with Google Tag Assistant directly on a PR's
// preview URL, no local hosts-file override needed. Real ad traffic only
// ever lands on the production domain (ad campaigns don't link to preview
// URLs), so this doesn't put real ad-spend attribution at risk - same
// "scoped to this project's own deployments, not any arbitrary host"
// rationale as the Preview Redirect URL wildcard documented in
// docs/crm.md.
export default async function GoogleAdsTag() {
  const host = (await headers()).get("host")?.split(":")[0] ?? "";
  const isPreviewDeployment = process.env.VERCEL_ENV === "preview";
  if (!CLEANING_QUOTE_HOSTS.has(host) && !isPreviewDeployment) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-ads-gtag" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GOOGLE_ADS_ID}');
        `}
      </Script>
    </>
  );
}
