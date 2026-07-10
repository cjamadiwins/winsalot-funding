import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const MAX_FIELD_LENGTH = 300;
const MAX_NOTES_LENGTH = 2000;

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

  return NextResponse.json({ ok: true }, { status: 201 });
}
