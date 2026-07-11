import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

import { getResendClient } from "@/lib/resend";
export const runtime = "nodejs";

const MAX_FIELD_LENGTH = 300;
const MAX_NOTES_LENGTH = 2000;

const LEAD_NOTIFICATION_TO = "info@winsalotcorp.com";
const LEAD_NOTIFICATION_FROM =
  process.env.RESEND_FROM_EMAIL ?? "Winsalot Lead Generation <info@winsalotcorp.com>";

type IntakePayload = {
  businessName: string;
  contactPerson: string;
  businessEmail: string;
  phoneNumber: string;
  businessWebsite: string;
  targetIndustry: string;
  servicesToPromote: string;
  leadsPerMonth: string;
  preferredStartDate: string;
  additionalNotes: string;
};

function isNonEmptyString(value: unknown, maxLength = MAX_FIELD_LENGTH): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
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

function isValidLeadsPerMonth(value: string): boolean {
  return /^\d+$/.test(value.trim()) && Number(value) > 0;
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

async function sendLeadNotificationEmail(payload: IntakePayload) {
  const fields: [string, string][] = [
    ["Business Name", payload.businessName],
    ["Contact Person", payload.contactPerson],
    ["Business Email", payload.businessEmail],
    ["Phone Number", payload.phoneNumber],
    ["Business Website", payload.businessWebsite || "—"],
    ["Target Industry", payload.targetIndustry],
    ["Services to Promote", payload.servicesToPromote],
    ["Leads Required Per Month", payload.leadsPerMonth],
    ["Preferred Start Date", payload.preferredStartDate || "—"],
    ["Additional Notes", payload.additionalNotes || "—"],
  ];

  const text = fields.map(([label, value]) => `${label}: ${value}`).join("\n");
  const html = `
    <h2>New Lead Generation Client Intake</h2>
    <table cellpadding="6" cellspacing="0">
      ${fields
        .map(
          ([label, value]) =>
            `<tr><td><strong>${escapeHtml(label)}</strong></td><td>${escapeHtml(value)}</td></tr>`
        )
        .join("")}
    </table>
  `;

  console.log("[lead-generation-intake] Resend config check:", {
    hasApiKey: Boolean(process.env.RESEND_API_KEY),
    apiKeyLength: process.env.RESEND_API_KEY?.length ?? 0,
    fromEnvVarSet: Boolean(process.env.RESEND_FROM_EMAIL),
    resolvedFrom: LEAD_NOTIFICATION_FROM,
    resolvedTo: LEAD_NOTIFICATION_TO,
  });

  const resend = getResendClient();
  const { data, error } = await resend.emails.send({
    from: LEAD_NOTIFICATION_FROM,
    to: LEAD_NOTIFICATION_TO,
    replyTo: payload.businessEmail,
    subject: `New Lead Generation Signup: ${payload.businessName}`,
    text,
    html,
  });

  if (error) {
    console.error(
      "[lead-generation-intake] Resend API returned an error:",
      JSON.stringify(error, null, 2)
    );
    throw new Error(error.message ?? "Unknown Resend error.");
  }

  console.log("[lead-generation-intake] Resend notification sent:", { id: data?.id });
}

export async function POST(request: Request) {
  let body: Partial<IntakePayload>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const {
    businessName,
    contactPerson,
    businessEmail,
    phoneNumber,
    businessWebsite = "",
    targetIndustry,
    servicesToPromote,
    leadsPerMonth,
    preferredStartDate = "",
    additionalNotes = "",
  } = body;

  if (!isNonEmptyString(businessName)) {
    return NextResponse.json({ error: "Business name is required." }, { status: 400 });
  }
  if (!isNonEmptyString(contactPerson)) {
    return NextResponse.json({ error: "Contact person is required." }, { status: 400 });
  }
  if (!isNonEmptyString(businessEmail) || !isValidEmail(businessEmail)) {
    return NextResponse.json({ error: "A valid business email is required." }, { status: 400 });
  }
  if (!isNonEmptyString(phoneNumber, 40)) {
    return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
  }
  if (businessWebsite && !isValidUrl(businessWebsite)) {
    return NextResponse.json({ error: "Business website must be a valid URL." }, { status: 400 });
  }
  if (!isNonEmptyString(targetIndustry)) {
    return NextResponse.json({ error: "Target industry is required." }, { status: 400 });
  }
  if (!isNonEmptyString(servicesToPromote, MAX_NOTES_LENGTH)) {
    return NextResponse.json({ error: "Services to promote is required." }, { status: 400 });
  }
  if (!isNonEmptyString(leadsPerMonth, 10) || !isValidLeadsPerMonth(leadsPerMonth)) {
    return NextResponse.json(
      { error: "Number of leads required per month must be a positive whole number." },
      { status: 400 }
    );
  }
  if (preferredStartDate && !isValidDate(preferredStartDate)) {
    return NextResponse.json({ error: "Preferred start date must be a valid date." }, { status: 400 });
  }
  if (additionalNotes.length > MAX_NOTES_LENGTH) {
    return NextResponse.json({ error: "Additional notes is too long." }, { status: 400 });
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (err) {
    console.error("Supabase is not configured:", err);
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: `Database is not configured: ${message}` }, { status: 500 });
  }

  const { error: insertError } = await supabaseAdmin.from("lead_generation").insert({
    business_name: businessName.trim(),
    contact_person: contactPerson.trim(),
    business_email: businessEmail.trim(),
    phone_number: phoneNumber.trim(),
    business_website: businessWebsite.trim() || null,
    target_industry: targetIndustry.trim(),
    services_to_promote: servicesToPromote.trim(),
    leads_per_month: Number(leadsPerMonth.trim()),
    preferred_start_date: preferredStartDate.trim() || null,
    additional_notes: additionalNotes.trim() || null,
  });

  if (insertError) {
    console.error("Failed to save lead generation submission:", insertError);
    return NextResponse.json({ error: `Database error: ${insertError.message}` }, { status: 500 });
  }

  console.log("[lead-generation-intake] Lead saved, sending notification email:", {
    businessName: businessName.trim(),
    businessEmail: businessEmail.trim(),
  });

  try {
    await sendLeadNotificationEmail({
      businessName,
      contactPerson,
      businessEmail,
      phoneNumber,
      businessWebsite,
      targetIndustry,
      servicesToPromote,
      leadsPerMonth,
      preferredStartDate,
      additionalNotes,
    });
  } catch (err) {
    console.error("[lead-generation-intake] Failed to send lead notification email:", err);
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json(
      {
        ok: true,
        error: `Lead was saved, but the notification email failed to send: ${message}`,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}