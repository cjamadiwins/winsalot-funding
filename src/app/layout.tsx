import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Sans } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Winsalot Corp | Get funded in 48 hours",
  description:
    "Revenue-based funding and lines of capital for Canadian small businesses. $10K–$2M, approved in hours, funded the same day.",
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
        {children}
      </body>
    </html>
  );
}
