import type { Metadata } from "next";
import { businessConfig } from "@/config/business";

const title = "Afsoon Cleaning Team | Cleaning Services in Toronto and the GTA";
const description =
  "Request a quote from Afsoon Cleaning Team for dependable residential and commercial cleaning services across Toronto and the Greater Toronto Area.";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "cleaning services Toronto",
    "GTA cleaning company",
    "residential cleaning Toronto",
    "commercial cleaning GTA",
    "office cleaning Toronto",
    "move-in move-out cleaning Toronto",
    "deep cleaning services GTA",
    "house cleaning Greater Toronto Area",
  ],
  openGraph: {
    title,
    description,
    type: "website",
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: businessConfig.name,
  description,
  telephone: businessConfig.phone.href,
  email: businessConfig.email,
  areaServed: businessConfig.serviceAreas,
  priceRange: "$$",
};

export default function AfsoonCleaningLayout({
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
