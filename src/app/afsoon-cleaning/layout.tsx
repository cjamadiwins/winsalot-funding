import type { Metadata } from "next";
import { businessConfig } from "@/config/business";

const title = "Request a Commercial Cleaning Quote";
const description =
  "Tell us about your cleaning needs and receive a customized quote from a professional cleaning provider.";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "commercial cleaning quote",
    "office cleaning services",
    "custom cleaning quote",
    "professional cleaning services",
    "business cleaning services",
    "cleaning service request",
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
