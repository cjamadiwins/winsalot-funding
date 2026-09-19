import Link from "next/link";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import CallListWorkingClient from "@/components/crm-call-list/CallListWorkingClient";
import { isColumnHidden } from "@/lib/call-list-columns";
import type { CallListLeadRow, CallListSegmentRow } from "@/lib/call-list-types";
import { logCallListCallAction, promoteCallListLeadAction } from "../actions";

export default async function LeadgenAgentCallListSegmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireLeadgenAgent();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  // RLS scopes both of these to segments this agent is actually assigned
  // to and currently deployed/completed - a segment this agent isn't on
  // simply won't be returned here, same as any other id-in-the-URL page
  // in this app.
  const { data: segment } = await supabase.from("call_list_segments").select("*").eq("id", id).maybeSingle();
  if (!segment) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-8 text-center">
        <h1 className="font-heading text-lg font-bold text-[var(--color-ink-strong)]">Call list not found</h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">It may not be assigned to you, or no longer exists.</p>
        <Link href="/leadgen/agent/call-list-segments" className="mt-5 inline-block rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white">
          ← Back to My Call Lists
        </Link>
      </div>
    );
  }

  const [{ data: leads }, { data: visibility }] = await Promise.all([
    supabase.from("call_list_leads").select("*").eq("segment_id", id).order("created_at", { ascending: true }),
    // RLS: agent select-only on call_list_column_visibility - Admin's
    // "Manage Columns" setting for this CRM, enforced server-side (not
    // just a client-side conditional) below.
    supabase.from("call_list_column_visibility").select("hidden_fields").eq("crm", "lead_generation").maybeSingle(),
  ]);
  const hiddenFields = (visibility?.hidden_fields as string[] | null) ?? [];

  // Hidden columns must not reach the agent's browser at all "through
  // agent-side API responses if possible" - extra_fields (imported junk
  // columns like IS_WORDPRESS) is never rendered by this view regardless,
  // so it's dropped unconditionally. Every other core calling field is
  // nulled out here too when Admin has explicitly hidden it, on top of
  // CallListWorkingClient's own conditional rendering - business_name is
  // never nulled (the card's only identifier) and last_outcome is
  // deliberately left alone (CallListWorkingClient's "Not yet contacted"
  // filter depends on its true value even when the column is hidden from
  // display). None of these are hidden by default - only an explicit
  // Admin choice in Manage Columns ever adds one to hiddenFields.
  const sanitizedLeads = ((leads ?? []) as CallListLeadRow[]).map((lead) => ({
    ...lead,
    extra_fields: {},
    contact_name: isColumnHidden(hiddenFields, "contact_name") ? null : lead.contact_name,
    phone: isColumnHidden(hiddenFields, "phone") ? null : lead.phone,
    email: isColumnHidden(hiddenFields, "email") ? null : lead.email,
    website: isColumnHidden(hiddenFields, "website") ? null : lead.website,
    industry: isColumnHidden(hiddenFields, "industry") ? null : lead.industry,
    notes: isColumnHidden(hiddenFields, "notes") ? null : lead.notes,
    callback_at: isColumnHidden(hiddenFields, "callback_at") ? null : lead.callback_at,
  }));

  return (
    <div>
      <Link href="/leadgen/agent/call-list-segments" className="text-[13px] font-medium text-[var(--color-accent)]">
        ← Back to My Call Lists
      </Link>
      <h1 className="mt-2 font-heading text-2xl font-bold text-[var(--color-ink-strong)]">{(segment as CallListSegmentRow).name}</h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{sanitizedLeads.length} lead(s) in this list.</p>

      <div className="mt-6">
        <CallListWorkingClient leads={sanitizedLeads} logCallAction={logCallListCallAction} promoteAction={promoteCallListLeadAction} hiddenFields={hiddenFields} />
      </div>
    </div>
  );
}
