import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getResendClient } from "@/lib/resend";
import { sendSms } from "@/lib/twilio";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import { businessConfig } from "@/config/business";

export const runtime = "nodejs";

const PROPERTY_TYPES = ["residential", "commercial"] as const;
const SERVICE_FREQUENCIES = ["one-time", "recurring"] as const;
const CONTACT_METHODS = ["phone", "email", "text"] as const;

type QuotePayload = {
  fullName: string;
  phone: string;
  email: string;
  city: string;
  serviceAddress: string;
  propertyType: string;
  cleaningType: string;
  bedrooms: string;
  bathrooms: string;
  propertySize: string;
  preferredDate: string;
  serviceFrequency: string;
  preferredContactMethod: string;
  description: string;
  consent: boolean;
  // Honeypot field. Real visitors never fill this in — only bots that
  // auto-fill every field on a form do.
  website: string;
};

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

function isOptionalString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime());
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(value: string, maxLength: number): string {
  const trimmed = value.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength).trim()}...` : trimmed;
}

async function sendQuoteNotificationSms(payload: QuotePayload) {
  const lines = [
    "New Cleaning Quote Request",
    `Name: ${payload.fullName}`,
    `Phone: ${payload.phone}`,
    `City: ${payload.city}`,
    `Property: ${payload.propertyType}`,
    `Cleaning: ${payload.cleaningType}`,
  ];
  if (payload.preferredDate) lines.push(`Date: ${payload.preferredDate}`);
  lines.push(`Details: ${truncate(payload.description, 120)}`);

  await sendSms(lines.join("\n"));
}

async function sendQuoteNotificationEmail(payload: QuotePayload) {
  const fields: [string, string][] = [
    ["Full Name", payload.fullName],
    ["Phone", payload.phone],
    ["Email", payload.email || "—"],
    ["City", payload.city],
    ["Service Address", payload.serviceAddress || "—"],
    ["Property Type", payload.propertyType],
    ["Cleaning Type", payload.cleaningType],
    ["Bedrooms", payload.bedrooms || "—"],
    ["Bathrooms", payload.bathrooms || "—"],
    ["Approximate Property Size", payload.propertySize || "—"],
    ["Preferred Service Date", payload.preferredDate || "—"],
    ["One-Time or Recurring", payload.serviceFrequency || "—"],
    ["Preferred Contact Method", payload.preferredContactMethod || "—"],
    ["Description", payload.description],
    ["Consent to Contact", payload.consent ? "Yes" : "No"],
  ];

  const text = fields.map(([label, value]) => `${label}: ${value}`).join("\n");
  const html = `
    <h2>New Cleaning Quote Request</h2>
    <table cellpadding="6" cellspacing="0">
      ${fields
        .map(
          ([label, value]) =>
            `<tr><td><strong>${escapeHtml(label)}</strong></td><td>${escapeHtml(value)}</td></tr>`
        )
        .join("")}
    </table>
  `;

  const toEmail = process.env.NOTIFICATION_EMAIL || businessConfig.email;
  const fromEmail = process.env.EMAIL_FROM || "Cleaning Quote Request <onboarding@resend.dev>";

  const resend = getResendClient();
  const { error } = await resend.emails.send({
    from: fromEmail,
    to: toEmail,
    subject: "New Cleaning Quote Request",
    text,
    html,
  });

  if (error) {
    throw new Error(error.message ?? "Unknown Resend error.");
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

  let body: Partial<QuotePayload>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Honeypot: bots fill every field, real visitors never see or fill this
  // one. Pretend success so the bot doesn't learn to look elsewhere.
  if (typeof body.website === "string" && body.website.trim().length > 0) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const {
    fullName,
    phone,
    email = "",
    city,
    serviceAddress = "",
    propertyType,
    cleaningType,
    bedrooms = "",
    bathrooms = "",
    propertySize = "",
    preferredDate = "",
    serviceFrequency = "",
    preferredContactMethod = "",
    description,
    consent,
  } = body;

  if (!isNonEmptyString(fullName, 150)) {
    return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  }
  if (!isNonEmptyString(phone, 40)) {
    return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
  }
  if (email && (!isOptionalString(email, 200) || !isValidEmail(email))) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (!isNonEmptyString(city, 100)) {
    return NextResponse.json({ error: "City is required." }, { status: 400 });
  }
  if (!isOptionalString(serviceAddress, 300)) {
    return NextResponse.json({ error: "Service address is too long." }, { status: 400 });
  }
  if (
    !isNonEmptyString(propertyType, 20) ||
    !PROPERTY_TYPES.includes(propertyType as (typeof PROPERTY_TYPES)[number])
  ) {
    return NextResponse.json({ error: "Please select a property type." }, { status: 400 });
  }
  if (!isNonEmptyString(cleaningType, 100)) {
    return NextResponse.json({ error: "Please select the type of cleaning required." }, { status: 400 });
  }
  if (!isOptionalString(bedrooms, 20) || !isOptionalString(bathrooms, 20) || !isOptionalString(propertySize, 100)) {
    return NextResponse.json({ error: "One of the property details fields is too long." }, { status: 400 });
  }
  if (preferredDate && !isValidDate(preferredDate)) {
    return NextResponse.json({ error: "Preferred service date must be a valid date." }, { status: 400 });
  }
  if (
    serviceFrequency &&
    !SERVICE_FREQUENCIES.includes(serviceFrequency as (typeof SERVICE_FREQUENCIES)[number])
  ) {
    return NextResponse.json({ error: "Please select a valid service frequency." }, { status: 400 });
  }
  if (
    preferredContactMethod &&
    !CONTACT_METHODS.includes(preferredContactMethod as (typeof CONTACT_METHODS)[number])
  ) {
    return NextResponse.json({ error: "Please select a valid contact method." }, { status: 400 });
  }
  if (!isNonEmptyString(description, 2000)) {
    return NextResponse.json({ error: "Please describe the cleaning you need." }, { status: 400 });
  }
  if (consent !== true) {
    return NextResponse.json(
      { error: "Please agree to be contacted about your quote request." },
      { status: 400 }
    );
  }

  const payload: QuotePayload = {
    fullName: fullName.trim(),
    phone: phone.trim(),
    email: email.trim(),
    city: city.trim(),
    serviceAddress: serviceAddress.trim(),
    propertyType: propertyType.trim(),
    cleaningType: cleaningType.trim(),
    bedrooms: bedrooms.trim(),
    bathrooms: bathrooms.trim(),
    propertySize: propertySize.trim(),
    preferredDate: preferredDate.trim(),
    serviceFrequency: serviceFrequency.trim(),
    preferredContactMethod: preferredContactMethod.trim(),
    description: description.trim(),
    consent: true,
    website: "",
  };

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (err) {
    console.error("[commercial-cleaning-quote] Supabase is not configured:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again later." },
      { status: 500 }
    );
  }

  const { error: insertError } = await supabaseAdmin.from("quote_requests").insert({
    full_name: payload.fullName,
    phone: payload.phone,
    email: payload.email || null,
    city: payload.city,
    service_address: payload.serviceAddress || null,
    property_type: payload.propertyType,
    cleaning_type: payload.cleaningType,
    bedrooms: payload.bedrooms || null,
    bathrooms: payload.bathrooms || null,
    property_size: payload.propertySize || null,
    preferred_date: payload.preferredDate || null,
    service_frequency: payload.serviceFrequency || null,
    preferred_contact_method: payload.preferredContactMethod || null,
    description: payload.description,
    consent_to_contact: payload.consent,
  });

  if (insertError) {
    console.error("[commercial-cleaning-quote] Failed to save quote request:", insertError);
    return NextResponse.json(
      { error: "Something went wrong. Please try again later." },
      { status: 500 }
    );
  }

  // Notifications are best-effort. The quote request is already saved, so a
  // failure here must never surface as an error to the customer.
  const [smsResult, emailResult] = await Promise.allSettled([
    sendQuoteNotificationSms(payload),
    sendQuoteNotificationEmail(payload),
  ]);

  if (smsResult.status === "rejected") {
    console.error("[commercial-cleaning-quote] Failed to send SMS notification:", smsResult.reason);
  }
  if (emailResult.status === "rejected") {
    console.error("[commercial-cleaning-quote] Failed to send email notification:", emailResult.reason);
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
