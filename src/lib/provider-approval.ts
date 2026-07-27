import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { findCleaningProviderMatch } from "./provider-duplicates";
import { recalculateProviderScoreSafely } from "./provider-score";
import type { CrmUserRow } from "./crm-types";
import type { ProviderLeadRow } from "./provider-types";

export type ApproveProviderResult = { cleaningProviderId: string; matched: boolean };

// "Approve and Add to Providers" (admin-only quick action): the single
// place a Provider Acquisition lead becomes - or reconnects to - the
// permanent operational Provider Profile (cleaning_providers). This is
// the *only* way provider_leads.cleaning_provider_id ever gets set; there
// is no manual "link" step for an admin to perform separately.
//
// Duplicate prevention: matches an existing cleaning_providers record by
// email, then phone, then business name (src/lib/provider-duplicates.ts)
// before ever creating a new one, and is idempotent - approving an
// already-linked lead again just re-confirms the status instead of
// creating a second operational record.
export async function approveProviderAndAddToDirectory(
  providerLeadId: string,
  approvedBy: CrmUserRow
): Promise<ApproveProviderResult> {
  const admin = getSupabaseAdmin();

  const { data: lead, error: fetchError } = await admin
    .from("provider_leads")
    .select("*")
    .eq("id", providerLeadId)
    .maybeSingle();
  if (fetchError || !lead) throw new Error("Provider lead not found.");
  const leadRow = lead as ProviderLeadRow;

  if (leadRow.cleaning_provider_id) {
    await admin
      .from("provider_leads")
      .update({ status: "Approved Provider" })
      .eq("id", providerLeadId);
    return { cleaningProviderId: leadRow.cleaning_provider_id, matched: true };
  }

  const match = await findCleaningProviderMatch({
    businessName: leadRow.business_name,
    email: leadRow.email,
    phone: leadRow.phone,
  });

  const copiedContactFields = {
    company_name: leadRow.business_name,
    contact_person: leadRow.contact_person,
    job_title: leadRow.job_title,
    email: leadRow.email,
    phone: leadRow.phone,
    website: leadRow.website,
    street_address: leadRow.street_address,
    city: leadRow.city,
    province: leadRow.province,
    postal_code: leadRow.postal_code,
    cities_served: leadRow.cities_served,
    services_offered: leadRow.services_offered,
    years_in_business: leadRow.years_in_business,
    number_of_employees: leadRow.number_of_employees,
    business_description: leadRow.business_description,
    wsib_wcb_applicable: leadRow.wsib_wcb_applicable,
    ...(leadRow.logo_path ? { logo_path: leadRow.logo_path } : {}),
  };

  let cleaningProviderId: string;
  let matched: boolean;

  if (match) {
    matched = true;
    cleaningProviderId = match.id;

    const { data: existing } = await admin
      .from("cleaning_providers")
      .select("assigned_agent_id, internal_notes, status")
      .eq("id", cleaningProviderId)
      .maybeSingle();

    const mergedNotes = leadRow.notes
      ? [existing?.internal_notes, `From Provider Acquisition:\n${leadRow.notes}`]
          .filter((v): v is string => Boolean(v))
          .join("\n\n")
      : existing?.internal_notes ?? null;

    const { error: updateError } = await admin
      .from("cleaning_providers")
      .update({
        ...copiedContactFields,
        internal_notes: mergedNotes,
        // Never silently reassign or un-suspend an existing operational
        // provider just because an unrelated acquisition record matched
        // it - only fill in an assignment/activate if it doesn't already
        // have one of its own.
        ...(existing?.assigned_agent_id ? {} : { assigned_agent_id: leadRow.assigned_agent_id }),
        ...(existing?.status === "suspended" ? {} : { status: "active" }),
      })
      .eq("id", cleaningProviderId);
    if (updateError) throw new Error("Failed to update the matching operational provider.");
  } else {
    matched = false;
    const { data: created, error: insertError } = await admin
      .from("cleaning_providers")
      .insert({
        ...copiedContactFields,
        internal_notes: leadRow.notes ? `From Provider Acquisition:\n${leadRow.notes}` : null,
        assigned_agent_id: leadRow.assigned_agent_id,
        created_by: approvedBy.id,
        status: "active",
      })
      .select("id")
      .single();
    if (insertError || !created) throw new Error("Failed to create the operational provider.");
    cleaningProviderId = created.id;
  }

  // Carry forward pre-approval notes/documents/SMS history by linking the
  // same rows to the operational profile, rather than copying them into
  // new rows - so nothing is duplicated and nothing from the recruiting
  // phase is lost.
  await admin.from("provider_notes").update({ cleaning_provider_id: cleaningProviderId }).eq("provider_lead_id", providerLeadId);
  await admin.from("provider_documents").update({ cleaning_provider_id: cleaningProviderId }).eq("provider_lead_id", providerLeadId);
  await admin.from("provider_sms_messages").update({ cleaning_provider_id: cleaningProviderId }).eq("provider_lead_id", providerLeadId);

  const { error: linkError } = await admin
    .from("provider_leads")
    .update({ cleaning_provider_id: cleaningProviderId, status: "Approved Provider" })
    .eq("id", providerLeadId);
  if (linkError) throw new Error("Failed to link the approved provider.");

  const approverName = approvedBy.full_name || approvedBy.email;
  await admin.from("crm_activities").insert([
    {
      provider_lead_id: providerLeadId,
      agent_id: approvedBy.id,
      activity_type: "status_change",
      notes: matched
        ? `Approved by ${approverName} and linked to the existing operational provider record.`
        : `Approved by ${approverName} and added as a new operational provider.`,
    },
    {
      cleaning_provider_id: cleaningProviderId,
      agent_id: approvedBy.id,
      activity_type: "outcome",
      notes: matched
        ? `Profile updated from Provider Acquisition (approved by ${approverName}).`
        : `Onboarded from Provider Acquisition (approved by ${approverName}).`,
    },
  ]);

  recalculateProviderScoreSafely(cleaningProviderId, "Approved from Provider Acquisition");

  return { cleaningProviderId, matched };
}
