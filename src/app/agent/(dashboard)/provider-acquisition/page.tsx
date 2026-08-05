import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";
import type { ProviderFollowUpWithLead, ProviderLeadRow } from "@/lib/provider-types";
import ProviderAcquisitionAgentClient from "./ProviderAcquisitionAgentClient";

export default async function AgentProviderAcquisitionPage() {
  await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  // RLS (provider_leads_agent_select_own / crm_followups' equivalent
  // agent-scoping) already restricts both of these to this agent's own
  // providers - same fetch shape as the admin page
  // (/admin/crm/provider-acquisition), just automatically narrower.
  const [
    { data: providers, error: providersError },
    { data: followUps, error: followUpsError },
  ] = await Promise.all([
    supabase.from("provider_leads").select("*").order("created_at", { ascending: false }),
    supabase
      .from("crm_followups")
      .select("*, provider_leads(id, business_name, contact_person, phone, email, status, assigned_agent_id)")
      .eq("status", "pending")
      .not("provider_lead_id", "is", null)
      .order("scheduled_at", { ascending: true }),
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-[24px] font-bold text-[var(--color-ink-strong)]">
            Provider Acquisition
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Recruit and onboard cleaning providers — separate from customer quote requests.
          </p>
        </div>
        <Link
          href="/agent/provider-acquisition/new"
          className="whitespace-nowrap rounded-full bg-[var(--color-accent)] px-5 py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          + Add Provider Lead
        </Link>
      </div>

      {(providersError || followUpsError) && (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load provider leads: {(providersError ?? followUpsError)?.message}
        </p>
      )}

      {!providersError && !followUpsError && (
        <ProviderAcquisitionAgentClient
          providers={(providers ?? []) as ProviderLeadRow[]}
          followUps={(followUps ?? []) as ProviderFollowUpWithLead[]}
        />
      )}
    </div>
  );
}
