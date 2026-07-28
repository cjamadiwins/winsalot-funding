import Link from "next/link";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { LeadgenLeadRow } from "@/lib/leadgen-types";
import AgentLeadsListClient from "./AgentLeadsListClient";

export default async function LeadgenAgentLeadsPage() {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();
  const { data: leads } = await supabase
    .from("leadgen_leads")
    .select("*")
    .eq("assigned_agent_id", agent.id)
    .order("next_follow_up_at", { ascending: true, nullsFirst: false });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Leads</h1>
          <p className="mt-1 text-sm text-slate-500">Prospects assigned to you.</p>
        </div>
        <Link
          href="/leadgen/agent/leads/new"
          className="rounded-full bg-sky-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-sky-700"
        >
          + Add Lead
        </Link>
      </div>
      <AgentLeadsListClient leads={(leads ?? []) as LeadgenLeadRow[]} />
    </div>
  );
}
