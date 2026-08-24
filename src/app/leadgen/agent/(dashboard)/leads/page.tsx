import Link from "next/link";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { LeadgenEmailStatus, LeadgenLeadRow } from "@/lib/leadgen-types";
import AgentLeadsListClient from "./AgentLeadsListClient";

export default async function LeadgenAgentLeadsPage({
  searchParams,
}: {
  // status/followup are set by the agent dashboard's clickable stat
  // cards (see /leadgen/agent/(dashboard)/page.tsx) to land here
  // pre-filtered - same convention as the admin leads page. `client` is
  // set by the dashboard's "My Results by Client" section.
  searchParams: Promise<{ status?: string; followup?: string; client?: string }>;
}) {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();
  const { status, followup, client } = await searchParams;
  const [{ data: leads }, { data: clients }] = await Promise.all([
    supabase
      .from("leadgen_leads")
      .select("*")
      .eq("assigned_agent_id", agent.id)
      .order("next_follow_up_at", { ascending: true, nullsFirst: false }),
    supabase.from("leadgen_clients").select("id, name"),
  ]);
  const viewingClient = client ? (clients ?? []).find((c) => c.id === client) ?? null : null;

  // Quick-glance email delivery status per lead for this list view - each
  // lead's own page already shows the full Sent/Delivered/Bounced/Failed
  // history (LeadgenEmailStatusPanel), this just surfaces the latest one
  // here too so an agent doesn't have to open every lead to see it.
  // leadgen_emails RLS (leadgen_emails_agent_select_own) already scopes
  // this agent to only rows tied to their own leads; scoping by this
  // page's own lead ids on top of that is just to keep the query small.
  const leadIds = (leads ?? []).map((l) => l.id);
  const { data: emails } = leadIds.length
    ? await supabase
        .from("leadgen_emails")
        .select("lead_id, status, created_at")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: false })
    : { data: [] as { lead_id: string | null; status: LeadgenEmailStatus }[] };

  const emailStatusByLeadId: Record<string, LeadgenEmailStatus> = {};
  for (const email of emails ?? []) {
    if (email.lead_id && !(email.lead_id in emailStatusByLeadId)) {
      emailStatusByLeadId[email.lead_id] = email.status as LeadgenEmailStatus;
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Leads</h1>
          <p className="mt-1 text-sm text-slate-500">Prospects assigned to you.</p>
        </div>
        <Link
          href={client ? `/leadgen/agent/leads/new?client=${client}` : "/leadgen/agent/leads/new"}
          className="rounded-full bg-sky-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-sky-700"
        >
          + Add Lead
        </Link>
      </div>
      <AgentLeadsListClient
        leads={(leads ?? []) as LeadgenLeadRow[]}
        clients={(clients ?? []) as { id: string; name: string }[]}
        initialStatusFilter={status}
        initialFollowUpFilter={followup === "due_today" || followup === "overdue" ? followup : undefined}
        initialClientFilter={client}
        viewingClientName={viewingClient?.name ?? null}
        emailStatusByLeadId={emailStatusByLeadId}
      />
    </div>
  );
}
