import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";
import type { ProviderLeadRow } from "@/lib/provider-types";
import ProviderAcquisitionAgentClient from "./ProviderAcquisitionAgentClient";

export default async function AgentProviderAcquisitionPage() {
  await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  // RLS (provider_leads_agent_select_own) already restricts this to
  // providers assigned to the signed-in agent.
  const { data: providers, error } = await supabase
    .from("provider_leads")
    .select("*")
    .order("created_at", { ascending: false });

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

      {error && (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load provider leads: {error.message}
        </p>
      )}

      {!error && <ProviderAcquisitionAgentClient providers={(providers ?? []) as ProviderLeadRow[]} />}
    </div>
  );
}
