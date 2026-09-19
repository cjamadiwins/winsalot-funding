import Link from "next/link";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import CallListWorkingClient from "@/components/crm-call-list/CallListWorkingClient";
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

  const { data: leads } = await supabase.from("call_list_leads").select("*").eq("segment_id", id).order("created_at", { ascending: true });

  return (
    <div>
      <Link href="/leadgen/agent/call-list-segments" className="text-[13px] font-medium text-[var(--color-accent)]">
        ← Back to My Call Lists
      </Link>
      <h1 className="mt-2 font-heading text-2xl font-bold text-[var(--color-ink-strong)]">{(segment as CallListSegmentRow).name}</h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{(leads ?? []).length} lead(s) in this list.</p>

      <div className="mt-6">
        <CallListWorkingClient leads={(leads ?? []) as CallListLeadRow[]} logCallAction={logCallListCallAction} promoteAction={promoteCallListLeadAction} />
      </div>
    </div>
  );
}
