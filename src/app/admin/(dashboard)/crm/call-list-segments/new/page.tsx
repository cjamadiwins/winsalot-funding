import { requireCrmAdmin } from "@/lib/crm-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { listGoogleConnections } from "@/lib/call-list-connections";
import NewSegmentClient from "@/components/crm-call-list/NewSegmentClient";
import { createSegmentAction, loadSheetPreviewAction, loadSheetTabsAction } from "../actions";

const OPPORTUNITY_TYPE_OPTIONS = [
  { value: "lead_generation", label: "Lead Generation" },
  { value: "business_financing", label: "Business Financing" },
  { value: "both_services", label: "Lead Gen + Financing" },
] as const;

export default async function NewCallListSegmentPage({
  searchParams,
}: {
  searchParams: Promise<{ googleConnectionId?: string; googleConnectError?: string }>;
}) {
  await requireCrmAdmin();
  const { googleConnectionId, googleConnectError } = await searchParams;

  const [connections, agentsResult] = await Promise.all([
    listGoogleConnections("growth"),
    getSupabaseAdmin().from("crm_users").select("id, full_name").eq("role", "agent").eq("active", true).order("full_name"),
  ]);

  const agents = ((agentsResult.data ?? []) as { id: string; full_name: string }[]).map((a) => ({ id: a.id, name: a.full_name }));

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900">New Call List Segment</h1>
      <p className="mt-1 text-sm text-slate-500">
        Growth CRM · Admin-only. Set up the segment, then connect the Google Sheet tab it will sync from.
      </p>

      <div className="mt-6">
        <NewSegmentClient
          listHref="/admin/crm/call-list-segments"
          connectOAuthHref={`/api/google/oauth/connect?returnTo=${encodeURIComponent("/admin/crm/call-list-segments/new")}`}
          initialConnectionId={googleConnectionId}
          connectError={googleConnectError}
          connections={connections.map((c) => ({ id: c.id, googleEmail: c.google_email }))}
          agents={agents}
          typeOptions={OPPORTUNITY_TYPE_OPTIONS as unknown as { value: string; label: string }[]}
          typeFieldLabel="CRM Service"
          loadSheetTabsAction={loadSheetTabsAction}
          loadSheetPreviewAction={loadSheetPreviewAction}
          createSegmentAction={createSegmentAction}
        />
      </div>
    </div>
  );
}
