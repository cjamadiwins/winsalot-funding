import type { Metadata } from "next";
import { headers } from "next/headers";
import { Space_Grotesk, IBM_Plex_Sans } from "next/font/google";
import AuthInviteRedirector from "@/components/AuthInviteRedirector";
import { isLeadGenHost } from "@/lib/hosts";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Default/fallback metadata for any route that doesn't declare its own
// (e.g. the root "/" landing page). Routes with their own metadata
// (lead-generation, funding) fully override this and are unaffected.
//
// The browser-tab title is resolved per request from the incoming Host
// header (same isLeadGenHost() check src/proxy.ts and src/lib/hosts.ts
// already use for cross-CRM isolation), not hardcoded to one CRM's name -
// this single codebase is deployed to both growth.winsalotcorp.com and
// leads.winsalotcorp.com, and each domain must show its own product name
// regardless of which route actually renders. Reading headers() here
// opts this layout (and everything under it) out of static rendering,
// which is the necessary cost of a title that depends on which domain
// the request arrived on.
export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = (headersList.get("host") ?? "").split(":")[0];
  const title = isLeadGenHost(host) ? "Winsalot Lead Generation CRM" : "Winsalot Growth CRM";
  const description = "Empowering Businesses, One Solution at a Time. — Winsalot Corp.";

  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${ibmPlexSans.variable} scroll-smooth`}
    >
      <body className="font-sans bg-[var(--color-bg)] text-[var(--color-ink)] min-h-screen">
        <AuthInviteRedirector />
        {children}
      </body>
    </html>
  );
}
