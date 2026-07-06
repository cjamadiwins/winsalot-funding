import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const MAX_FIELD_LENGTH = 200;

type LeadPayload = {
  businessName: string;
  contactName: string;
  monthlyRevenue: string;
  phone: string;
  email: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= MAX_FIELD_LENGTH;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseRevenue(value: string): number | null {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}

export async function POST(request: Request) {
  let body: Partial<LeadPayload>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { businessName, contactName, monthlyRevenue, phone, email } = body;

  if (!isNonEmptyString(businessName)) {
    return NextResponse.json({ error: "Business name is required." }, { status: 400 });
  }
  if (!isNonEmptyString(contactName)) {
    return NextResponse.json({ error: "Director's name is required." }, { status: 400 });
  }
  if (!isNonEmptyString(phone)) {
    return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
  }
  if (!isNonEmptyString(email) || !isValidEmail(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }
  const revenue = isNonEmptyString(monthlyRevenue) ? parseRevenue(monthlyRevenue) : null;
  if (revenue === null || revenue < 0) {
    return NextResponse.json({ error: "A valid monthly revenue is required." }, { status: 400 });
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (err) {
    console.error("Supabase not configured:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  const { error } = await supabaseAdmin.from("leads").insert({
    company_name: businessName.trim(),
    contact_name: contactName.trim(),
    monthly_revenue: revenue,
    phone: phone.trim(),
    email: email.trim(),
    source_page: "homepage",
  });

  if (error) {
    console.error("Failed to insert lead:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
