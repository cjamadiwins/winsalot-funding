import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase-admin";
import { getResendClient } from "./resend";
import { sendSms } from "./twilio";
import { getSiteUrl } from "./site-url";
import { escapeHtml } from "./html";
import { recalculateProviderScoreSafely } from "./provider-score";
import type { CanadianProvinceOrTerritory, ProviderLeadRow } from "./provider-types";

// Handles a submission from the public Provider Intake Form
// (src/app/provider-intake, POST /api/provider-intake) - the missing link
// between that form and the Provider Acquisition CRM section
// (provider_leads, migration 0026). Uses the service-role client
// throughout since a public visitor has no Supabase session/RLS identity.

export type PublicProviderIntakePayload = {
  businessName: string;
  contactPerson: string;
  email: string;
  phone: string;
  city: string;
  province: CanadianProvinceOrTerritory;
  website: string;
  servicesOffered: string[];
  yearsInBusiness: string;
  notes: string;
};

export type PublicProviderIntakeResult = {
  providerId: string;
  matched: boolean;
};

function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

// Match order per the brief: email first, phone second, business name as a
// fallback - this is also what prevents a duplicate provider_leads row
// from being created when the same provider submits more than once.
async function findMatchingProviderLead(
  admin: SupabaseClient,
  payload: PublicProviderIntakePayload
): Promise<ProviderLeadRow | null> {
  const email = payload.email.trim();
  if (email) {
    const { data } = await admin
      .from("provider_leads")
      .select("*")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (data) return data as ProviderLeadRow;
  }

  const phoneDigits = normalizePhoneDigits(payload.phone);
  if (phoneDigits.length >= 7) {
    const last10 = phoneDigits.slice(-10);
    const { data } = await admin
      .from("provider_leads")
      .select("*")
      .ilike("phone", `%${last10}%`)
      .limit(1)
      .maybeSingle();
    if (data) return data as ProviderLeadRow;
  }

  const businessName = payload.businessName.trim();
  if (businessName) {
    const { data } = await admin
      .from("provider_leads")
      .select("*")
      .ilike("business_name", businessName)
      .limit(1)
      .maybeSingle();
    if (data) return data as ProviderLeadRow;
  }

  return null;
}

async function notifyCrmUsers(
  admin: SupabaseClient,
  input: {
    providerId: string;
    businessName: string;
    contactPerson: string;
    city: string;
    province: string;
    submittedAtIso: string;
    assignedAgentId: string | null;
  }
): Promise<void> {
  const { data: admins } = await admin
    .from("crm_users")
    .select("id")
    .eq("role", "admin")
    .eq("active", true);

  const recipients: { user_id: string; link_path: string }[] = (admins ?? []).map((a) => ({
    user_id: a.id as string,
    link_path: `/admin/crm/provider-acquisition/${input.providerId}`,
  }));

  if (input.assignedAgentId) {
    recipients.push({
      user_id: input.assignedAgentId,
      link_path: `/agent/provider-acquisition/${input.providerId}`,
    });
  }

  if (recipients.length === 0) return;

  const title = `Provider intake form completed: ${input.businessName}`;
  const body = `${input.businessName}${input.contactPerson ? ` (${input.contactPerson})` : ""} — ${input.city}, ${input.province}. Submitted ${new Date(
    input.submittedAtIso
  ).toLocaleString("en-CA")}.`;

  const { error } = await admin.from("crm_notifications").insert(
    recipients.map((r) => ({
      user_id: r.user_id,
      provider_lead_id: input.providerId,
      title,
      body,
      link_path: r.link_path,
    }))
  );
  if (error) {
    console.error("[provider-intake] Failed to create CRM notifications:", error);
  }
}

async function sendCompletionAlerts(
  payload: PublicProviderIntakePayload,
  providerId: string,
  matched: boolean
): Promise<void> {
  const recordUrl = `${getSiteUrl()}/admin/crm/provider-acquisition/${providerId}`;
  const submittedAt = new Date();
  const heading = matched
    ? "Provider Intake Form Completed"
    : "New Provider Lead — Intake Form Completed";

  const fields: [string, string][] = [
    ["Business Name", payload.businessName],
    ["Contact Person", payload.contactPerson || "—"],
    ["Email", payload.email || "—"],
    ["Phone", payload.phone],
    ["City", payload.city],
    ["Province", payload.province],
    ["Website", payload.website || "—"],
    ["Services Offered", payload.servicesOffered.join(", ") || "—"],
    ["Years in Business", payload.yearsInBusiness || "—"],
    ["Additional Notes", payload.notes || "—"],
    ["Submitted", submittedAt.toLocaleString("en-CA")],
  ];

  const smsLines = [
    heading,
    `Business: ${payload.businessName}`,
    `Contact: ${payload.contactPerson || "—"}`,
    `City: ${payload.city}, ${payload.province}`,
    `View: ${recordUrl}`,
  ];

  const text = `${fields.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\nView in CRM: ${recordUrl}`;
  const html = `
    <h2>${escapeHtml(heading)}</h2>
    <table cellpadding="6" cellspacing="0">
      ${fields
        .map(
          ([label, value]) =>
            `<tr><td><strong>${escapeHtml(label)}</strong></td><td>${escapeHtml(value)}</td></tr>`
        )
        .join("")}
    </table>
    <p><a href="${recordUrl}">Open provider record in CRM</a></p>
  `;

  const toEmail = process.env.NOTIFICATION_EMAIL || "info@winsalotcorp.com";
  const fromEmail = process.env.EMAIL_FROM || "Winsalot Corp <info@winsalotcorp.com>";

  const [smsResult, emailResult] = await Promise.allSettled([
    sendSms(smsLines.join("\n")),
    (async () => {
      const resend = getResendClient();
      const { error } = await resend.emails.send({
        from: fromEmail,
        to: toEmail,
        subject: matched
          ? `Provider Intake Form Completed: ${payload.businessName}`
          : `New Provider Lead: ${payload.businessName}`,
        text,
        html,
      });
      if (error) throw new Error(error.message ?? "Unknown Resend error.");
    })(),
  ]);

  if (smsResult.status === "rejected") {
    console.error("[provider-intake] Failed to send SMS notification:", smsResult.reason);
  }
  if (emailResult.status === "rejected") {
    console.error("[provider-intake] Failed to send email notification:", emailResult.reason);
  }
}

export async function submitPublicProviderIntake(
  payload: PublicProviderIntakePayload
): Promise<PublicProviderIntakeResult> {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  const existing = await findMatchingProviderLead(admin, payload);
  let providerId: string;
  let matched: boolean;
  let assignedAgentId: string | null = null;

  if (existing) {
    matched = true;
    providerId = existing.id;
    assignedAgentId = existing.assigned_agent_id;

    const mergedNotes = payload.notes
      ? [existing.notes, `Submitted via Public Provider Intake Form:\n${payload.notes}`]
          .filter((v): v is string => Boolean(v))
          .join("\n\n")
      : existing.notes;

    const { error: updateError } = await admin
      .from("provider_leads")
      .update({
        business_name: payload.businessName || existing.business_name,
        contact_person: payload.contactPerson || existing.contact_person,
        phone: payload.phone || existing.phone,
        email: payload.email || existing.email,
        city: payload.city || existing.city,
        province: payload.province || existing.province,
        website: payload.website || existing.website,
        services_offered:
          payload.servicesOffered.length > 0 ? payload.servicesOffered : existing.services_offered,
        years_in_business: payload.yearsInBusiness || existing.years_in_business,
        notes: mergedNotes,
        status: "Intake Form Completed",
        intake_completed_at: now,
        intake_submission: payload,
        last_contacted_at: now,
      })
      .eq("id", providerId);

    if (updateError) {
      console.error("[provider-intake] Failed to update matching provider lead:", updateError);
      throw new Error("Failed to update the matching provider lead.");
    }

    const { error: activityError } = await admin.from("crm_activities").insert({
      provider_lead_id: providerId,
      agent_id: null,
      activity_type: "outcome",
      notes:
        "Provider completed the Public Provider Intake Form. Submitted intake information has been attached to this record.",
      occurred_at: now,
    });
    if (activityError) {
      console.error("[provider-intake] Failed to log completion activity:", activityError);
    }

    // Provider Profile intake-form version history (brief "PROVIDER
    // INTAKE FORM": "If the provider updates the intake form later, keep
    // version history") - the update above already overwrote
    // provider_leads.intake_submission with the latest answers; this
    // preserves the version being replaced *and* the new one so nothing
    // submitted is ever lost.
    const versionRows: { provider_lead_id: string; submission: unknown; completed_at: string; completed_by_label: string }[] = [];
    if (existing.intake_submission && existing.intake_completed_at) {
      versionRows.push({
        provider_lead_id: providerId,
        submission: existing.intake_submission,
        completed_at: existing.intake_completed_at,
        completed_by_label: "Provider (self-submitted)",
      });
    }
    versionRows.push({
      provider_lead_id: providerId,
      submission: payload,
      completed_at: now,
      completed_by_label: "Provider (self-submitted)",
    });
    const { error: versionError } = await admin.from("provider_intake_versions").insert(versionRows);
    if (versionError) {
      console.error("[provider-intake] Failed to record intake version history:", versionError);
    }
  } else {
    matched = false;

    const { data: created, error: insertError } = await admin
      .from("provider_leads")
      .insert({
        business_name: payload.businessName,
        contact_person: payload.contactPerson || null,
        phone: payload.phone,
        email: payload.email || null,
        city: payload.city,
        province: payload.province,
        website: payload.website || null,
        services_offered: payload.servicesOffered,
        years_in_business: payload.yearsInBusiness || null,
        notes: payload.notes || null,
        lead_source: "Public Provider Intake Form",
        status: "Intake Form Completed",
        intake_completed_at: now,
        intake_submission: payload,
        assigned_agent_id: null,
        created_by: null,
      })
      .select("id")
      .single();

    if (insertError || !created) {
      console.error("[provider-intake] Failed to create new provider lead:", insertError);
      throw new Error("Failed to create a new provider lead.");
    }
    providerId = created.id;

    const { error: activityError } = await admin.from("crm_activities").insert({
      provider_lead_id: providerId,
      agent_id: null,
      activity_type: "outcome",
      notes: "New provider lead created automatically from the Public Provider Intake Form.",
      occurred_at: now,
    });
    if (activityError) {
      console.error("[provider-intake] Failed to log creation activity:", activityError);
    }

    const { error: versionError } = await admin.from("provider_intake_versions").insert({
      provider_lead_id: providerId,
      submission: payload,
      completed_at: now,
      completed_by_label: "Provider (self-submitted)",
    });
    if (versionError) {
      console.error("[provider-intake] Failed to record intake version history:", versionError);
    }
  }

  recalculateProviderScoreSafely(providerId, "Intake form completed");

  // The provider_leads write above is the critical path - it already
  // succeeded by this point. In-app CRM notifications and the email/SMS
  // alert are best-effort, same as every other public form in this app
  // (see commercial-cleaning-quote's route.ts), so a failure here never
  // turns into a 500 for the submitter.
  await Promise.allSettled([
    notifyCrmUsers(admin, {
      providerId,
      businessName: payload.businessName,
      contactPerson: payload.contactPerson,
      city: payload.city,
      province: payload.province,
      submittedAtIso: now,
      assignedAgentId,
    }),
    sendCompletionAlerts(payload, providerId, matched),
  ]);

  return { providerId, matched };
}
