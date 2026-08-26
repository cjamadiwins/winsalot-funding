import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Sans } from "next/font/google";
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
  weight: ["400", "500", "600", "700"],
});

// Default/fallback metadata for any route that doesn't declare its own
// (e.g. the root "/" landing page). Routes with their own metadata
// (lead-generation, funding) fully override this and are unaffected.
export const metadata: Metadata = {
  title: "Winsalot Growth CRM",
  description: "Empowering Businesses, One Solution at a Time. — Winsalot Corp.",
  openGraph: {
    title: "Winsalot Growth CRM",
    description: "Empowering Businesses, One Solution at a Time. — Winsalot Corp.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Winsalot Growth CRM",
    description: "Empowering Businesses, One Solution at a Time. — Winsalot Corp.",
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
    </html>
  );
}
