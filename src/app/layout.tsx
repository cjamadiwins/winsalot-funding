import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Sans } from "next/font/google";
import Script from "next/script";
import AuthInviteRedirector from "@/components/AuthInviteRedirector";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Default/fallback metadata for any route that doesn't declare its own
// (e.g. the funding homepage at "/", which has no page-level metadata of
// its own). The funding pitch previously lived here; per project decision
// it's parked — not deleted — until a dedicated financing landing page is
// requested again. Routes with their own metadata (commercial-cleaning-quote,
// lead-generation) fully override this and are unaffected.
export const metadata: Metadata = {
  title: "Winsalot Corp",
  description: "Professional business solutions from Winsalot Corp.",
  openGraph: {
    title: "Winsalot Corp",
    description: "Professional business solutions from Winsalot Corp.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Winsalot Corp",
    description: "Professional business solutions from Winsalot Corp.",
  },
};

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
      {/* Google tag (gtag.js) */}
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=AW-18338307179"
        strategy="afterInteractive"
      />
      <Script id="google-ads-gtag" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'AW-18338307179');
        `}
      </Script>
    </html>
  );
}
