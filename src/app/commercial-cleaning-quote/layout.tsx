import type { Metadata } from "next";
import { businessConfig } from "@/config/business";

const title = "Winsalot Corp Cleaning Services";
const description = "Request a free commercial or home cleaning quote.";
const canonicalUrl = "https://cleaning.winsalotcorp.com";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "commercial cleaning quote",
    "home cleaning quote",
    "residential cleaning services",
    "office cleaning services",
    "house cleaning quote",
    "custom cleaning quote",
    "professional cleaning services",
    "cleaning service request",
  ],
  alternates: {
    canonical: canonicalUrl,
  },
  openGraph: {
    title,
    description,
    url: canonicalUrl,
    type: "website",
  },
  twitter: {
    card: "summary",
    title,
    description,
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: businessConfig.name,
  description,
  telephone: businessConfig.phone.href,
  email: businessConfig.email,
};

export default function CommercialCleaningQuoteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      {children}
    </>
  );
}
