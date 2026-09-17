import { escapeHtml } from "./html";

export const DEFAULT_LEAD_GENERATION_PRICE_CENTS = 75_000;

export type DetailedService = "lead_generation" | "business_financing";

export const DETAILED_SERVICE_LABELS: Record<DetailedService, string> = {
  lead_generation: "Lead Generation",
  business_financing: "Business Finance",
};

export type ServicePricing = {
  priceCents: number;
  billingPeriod: "month";
};

export function formatLeadGenerationPrice(pricing: ServicePricing): string {
  const dollars = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(pricing.priceCents / 100);
  return `${dollars}/${pricing.billingPeriod}`;
}

function firstNameOnly(value: string | null): string {
  return value?.trim().split(/\s+/)[0] || "there";
}

export function getDetailedServicePricingTemplate(input: {
  service: DetailedService;
  contactName: string | null;
  businessName: string;
  leadGenerationPricing: ServicePricing;
}) {
  const firstName = firstNameOnly(input.contactName);
  const price = formatLeadGenerationPrice(input.leadGenerationPricing);

  if (input.service === "business_financing") {
    return {
      subject: "Winsalot Corp Business Finance — Service Information",
      priceSent: null,
      paragraphs: [
        `Hi ${firstName},`,
        "Thank you for taking the time to speak with us and for your interest in Winsalot Corp.",
        "As requested, here is some additional information about our Business Finance support.",
        `For ${input.businessName}, Winsalot Corp can help explore financing options through our network of lending partners. We help review the business's funding needs, collect the required information, and connect the application with suitable lenders.`,
        "Available financing amounts, rates, repayment terms, and approval conditions are not fixed. They depend on the business profile, lender, approval, revenue, time in business, bank statements, and funding requirements.",
        "There is no upfront fee charged by Winsalot Corp for this support. If you would like to discuss your funding needs and next steps, continue with Winsalot Corp below.",
        "If you have any questions, simply reply to this email and we will be happy to assist.",
        "Best regards,\nWinsalot Corp\nEmpowering Businesses, One Solution at a Time.",
      ],
      bullets: [] as string[],
    };
  }

  return {
    subject: "Winsalot Corp Lead Generation — Service & Pricing Information",
    priceSent: price,
    paragraphs: [
      `Hi ${firstName},`,
      "Thank you for taking the time to speak with us and for your interest in Winsalot Corp.",
      "As requested, here is some additional information about our Lead Generation service and pricing.",
      "Winsalot Corp helps businesses generate qualified B2B opportunities through targeted outbound prospecting, follow-up, and appointment setting.",
      `For ${input.businessName}, our team works to identify and contact potential business customers, introduce your services, determine interest, and help create conversations with qualified decision-makers.`,
      "What Our Lead Generation Service Includes",
      "Our goal is not simply to provide a list of contacts. We focus on generating real business conversations and qualified opportunities for your company.",
      `Pricing\nWinsalot Corp Lead Generation Service:\n${price}`,
      "If you would like to move forward, you can continue with Winsalot Corp using the button below.",
      "If you have any questions about the campaign, targeting, service, or pricing, simply reply to this email and we will be happy to assist.",
      "Best regards,\nWinsalot Corp\nEmpowering Businesses, One Solution at a Time.",
    ],
    bullets: [
      "Targeted B2B prospecting",
      "Outbound calling",
      "Lead qualification",
      "Follow-up with interested prospects",
      "Appointment setting",
      "Call and activity tracking",
      "Campaign reporting",
      "Ongoing campaign optimization",
    ],
  };
}

export function buildDetailedServicePricingText(input: {
  service: DetailedService;
  contactName: string | null;
  businessName: string;
  leadGenerationPricing: ServicePricing;
  continueUrl: string;
}) {
  const template = getDetailedServicePricingTemplate(input);
  const parts = [...template.paragraphs];
  if (template.bullets.length) {
    const headingIndex = parts.indexOf("What Our Lead Generation Service Includes");
    parts.splice(headingIndex + 1, 0, template.bullets.map((item) => `- ${item}`).join("\n"));
  }
  return parts.join("\n\n");
}

function paragraphHtml(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1f2937;">${escapeHtml(text).replace(/\n/g, "<br>")}</p>`;
}

export function buildDetailedServicePricingHtml(input: {
  service: DetailedService;
  contactName: string | null;
  businessName: string;
  leadGenerationPricing: ServicePricing;
  continueUrl: string;
}) {
  const template = getDetailedServicePricingTemplate(input);
  const parts = template.paragraphs.map((paragraph) => {
    if (paragraph === "What Our Lead Generation Service Includes") {
      return `<h2 style="margin:22px 0 10px;font-size:17px;color:#0f172a;">${paragraph}</h2><ul style="margin:0 0 18px;padding-left:22px;color:#1f2937;line-height:1.7;">${template.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
    }
    if (paragraph.startsWith("Pricing\n")) {
      return `<div style="margin:22px 0;padding:18px;border-radius:10px;background:#eff6ff;border:1px solid #bfdbfe;">${paragraphHtml(paragraph).replace('margin:0 0 16px', 'margin:0')}</div>`;
    }
    return paragraphHtml(paragraph);
  });
  const ctaIndex = template.paragraphs.findIndex((part) => part.startsWith("If you would like to move forward"));
  const insertionIndex = ctaIndex >= 0 ? ctaIndex + 1 : Math.max(parts.length - 2, 0);
  const safeUrl = escapeHtml(input.continueUrl);
  parts.splice(
    insertionIndex,
    0,
    `<div style="margin:22px 0;text-align:center;"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 24px;border-radius:8px;background:#0284c7;color:#ffffff;font-weight:700;text-decoration:none;">Continue with Winsalot Corp</a></div>`
  );

  return `<div style="max-width:640px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#1f2937;"><div style="padding:18px 22px;background:#0f172a;color:#ffffff;border-radius:12px 12px 0 0;"><div style="font-size:20px;font-weight:700;">Winsalot Corp</div><div style="margin-top:3px;font-size:13px;color:#bae6fd;">Empowering Businesses, One Solution at a Time.</div></div><div style="padding:24px 22px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;background:#ffffff;">${parts.join("\n")}</div></div>`;
}
