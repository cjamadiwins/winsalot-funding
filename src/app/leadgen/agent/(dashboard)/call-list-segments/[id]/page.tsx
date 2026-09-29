import Link from "next/link";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isAgentAssignedToActiveSegment } from "@/lib/call-list-segments";
import { resolveSegmentAssignment, CAMPAIGN_ASSIGNMENT_REQUIRED_MESSAGE } from "@/lib/leadgen-campaign-assignment";
import CallListWorkingClient from "@/components/crm-call-list/CallListWorkingClient";
import { isColumnHidden } from "@/lib/call-list-columns";
import type { CallListLeadRow, CallListSegmentRow } from "@/lib/call-list-types";
import type { CallScriptClientOption } from "@/components/leadgen/ClientCallScriptSelector";
import { logCallListCallAction, promoteCallListLeadAction } from "../actions";

export default async function LeadgenAgentCallListSegmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const agent = await requireLeadgenAgent();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  // RLS scopes both of these to segments this agent is actually assigned
  // to and currently deployed/completed - a segment this agent isn't on
  // simply won't be returned here, same as any other id-in-the-URL page
  // in this app.
  const { data: segment } = await supabase.from("call_list_segments").select("*").eq("id", id).maybeSingle();

  // The call list itself decides which client this agent is calling for. If
  // it has no client/campaign, don't guess and don't load any leads - the
  // agent is blocked from client-specific outreach until Admin assigns it.
  const assignment = segment && segment.status !== "draft" ? await resolveSegmentAssignment(segment as CallListSegmentRow) : null;
  if (segment && assignment && assignment.state !== "assigned") {
    const paused = assignment.state === "inactive";
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-amber-300 bg-amber-50 p-8 text-center">
        <h1 className="font-heading text-lg font-bold text-amber-900">{paused ? "Campaign Not Active" : "Campaign Assignment Required"}</h1>
        <p className="mt-1 text-sm font-semibold text-amber-900">{(segment as CallListSegmentRow).name}</p>
        <p className="mt-2 text-sm text-amber-800">
          {paused
            ? `This call list belongs to ${assignment.clientName}, whose campaign is paused or inactive. Ask Admin before calling.`
            : CAMPAIGN_ASSIGNMENT_REQUIRED_MESSAGE}
        </p>
        <Link href="/leadgen/agent/call-list-segments" className="mt-5 inline-block rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white">
          ← Back to My Call Lists
        </Link>
      </div>
    );
  }

  if (!segment || !(await isAgentAssignedToActiveSegment(id, agent.id))) {
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

  // "View Call Script" (brief "Call List") - every lead in a deployed
  // segment shares the same one client (a segment is deployed against a
  // single leadgen_campaign_id), so this is resolved once here rather
  // than per lead. Null when the segment has no linked campaign - the
  // per-lead script button/panel simply doesn't render in that case.
  let callScriptClient: CallScriptClientOption | null = null;
  if (assignment?.state === "assigned") {
    const { data: client } = await supabase
      .from("leadgen_clients")
      .select("id, name, call_script_value_proposition, call_script_services, call_script_closing, call_script_notes, call_script_override")
      .eq("id", assignment.clientId)
      .maybeSingle();
    if (client) callScriptClient = client as CallScriptClientOption;
  }

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
    street_address: isColumnHidden(hiddenFields, "street_address") ? null : lead.street_address,
    city: isColumnHidden(hiddenFields, "city") ? null : lead.city,
    province: isColumnHidden(hiddenFields, "province") ? null : lead.province,
    postal_code: isColumnHidden(hiddenFields, "postal_code") ? null : lead.postal_code,
    country: isColumnHidden(hiddenFields, "country") ? null : lead.country,
    industry: isColumnHidden(hiddenFields, "industry") ? null : lead.industry,
    notes: isColumnHidden(hiddenFields, "notes") ? null : lead.notes,
    callback_at: isColumnHidden(hiddenFields, "callback_at") ? null : lead.callback_at,
  }));

  return (
    <div>
      <Link href="/leadgen/agent/call-list-segments" className="text-sm font-medium text-[var(--color-accent)]">
        ← Back to My Call Lists
      </Link>
      <h1 className="mt-2 font-heading text-2xl font-bold text-[var(--color-ink-strong)]">{(segment as CallListSegmentRow).name}</h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{sanitizedLeads.length} lead(s) in this list.</p>

      <div className="mt-6">
        <CallListWorkingClient
          leads={sanitizedLeads}
          logCallAction={logCallListCallAction}
          promoteAction={promoteCallListLeadAction}
          hiddenFields={hiddenFields}
          callScriptClient={callScriptClient}
          agentName={agent.full_name || agent.email}
          callingFor={assignment?.state === "assigned" ? { clientName: assignment.clientName, campaignName: assignment.campaignName } : null}
        />
      </div>
    </div>
  );
}
