import { NextResponse } from "next/server";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import { CANADIAN_PROVINCES_AND_TERRITORIES, PROVIDER_SERVICES_OFFERED } from "@/lib/provider-types";
import { submitPublicProviderIntake } from "@/lib/provider-intake-submission";

export const runtime = "nodejs";

const MAX_FIELD_LENGTH = 200;
const MAX_NOTES_LENGTH = 2000;

type IntakeBody = {
  businessName: string;
  contactPerson: string;
  email: string;
  phone: string;
  city: string;
  province: string;
  website: string;
  servicesOffered: string[];
  yearsInBusiness: string;
  notes: string;
  // Honeypot field. Real visitors never fill this in - only bots that
  // auto-fill every field on a form do (same pattern as
  // commercial-cleaning-quote's route.ts).
  companyFax: string;
};

function isNonEmptyString(value: unknown, maxLength = MAX_FIELD_LENGTH): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

function isOptionalString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return Boolean(url.hostname) && url.hostname.includes(".");
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const clientIp = getClientIp(request);
  if (isRateLimited(clientIp)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  let body: Partial<IntakeBody>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Honeypot: pretend success so a bot doesn't learn to look elsewhere.
  if (typeof body.companyFax === "string" && body.companyFax.trim().length > 0) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const {
    businessName,
    contactPerson = "",
    email = "",
    phone,
    city,
    province,
    website = "",
    servicesOffered = [],
    yearsInBusiness = "",
    notes = "",
  } = body;

  if (!isNonEmptyString(businessName)) {
    return NextResponse.json({ error: "Business name is required." }, { status: 400 });
  }
  if (!isOptionalString(contactPerson, MAX_FIELD_LENGTH)) {
    return NextResponse.json({ error: "Contact person is too long." }, { status: 400 });
  }
  if (email && (!isOptionalString(email, MAX_FIELD_LENGTH) || !isValidEmail(email))) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (!isNonEmptyString(phone, 40)) {
    return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
  }
  if (!isNonEmptyString(city)) {
    return NextResponse.json({ error: "City is required." }, { status: 400 });
  }
  if (
    !isNonEmptyString(province) ||
    !CANADIAN_PROVINCES_AND_TERRITORIES.includes(
      province as (typeof CANADIAN_PROVINCES_AND_TERRITORIES)[number]
    )
  ) {
    return NextResponse.json({ error: "Please select a valid province or territory." }, { status: 400 });
  }
  if (website && !isValidUrl(website)) {
    return NextResponse.json({ error: "Website must be a valid URL." }, { status: 400 });
  }
  if (!Array.isArray(servicesOffered) || servicesOffered.length === 0) {
    return NextResponse.json({ error: "Select at least one service offered." }, { status: 400 });
  }
  const validServices = servicesOffered.filter((s): s is string =>
    typeof s === "string" &&
    PROVIDER_SERVICES_OFFERED.includes(s as (typeof PROVIDER_SERVICES_OFFERED)[number])
  );
  if (validServices.length === 0) {
    return NextResponse.json({ error: "Select at least one valid service offered." }, { status: 400 });
  }
  if (!isOptionalString(yearsInBusiness, 40)) {
    return NextResponse.json({ error: "Years in business is too long." }, { status: 400 });
  }
  if (!isOptionalString(notes, MAX_NOTES_LENGTH)) {
    return NextResponse.json({ error: "Additional notes is too long." }, { status: 400 });
  }

  try {
    await submitPublicProviderIntake({
      businessName: businessName.trim(),
      contactPerson: contactPerson.trim(),
      email: email.trim(),
      phone: phone.trim(),
      city: city.trim(),
      province: province as (typeof CANADIAN_PROVINCES_AND_TERRITORIES)[number],
      website: website.trim(),
      servicesOffered: validServices,
      yearsInBusiness: yearsInBusiness.trim(),
      notes: notes.trim(),
    });
  } catch (err) {
    console.error("[provider-intake] Submission failed:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again later." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
