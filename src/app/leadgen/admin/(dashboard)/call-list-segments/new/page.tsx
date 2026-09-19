import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import UploadSegmentClient from "@/components/crm-call-list/UploadSegmentClient";
import { previewUploadFileAction, uploadSegmentAction } from "../actions";

export default async function NewLeadgenCallListSegmentPage() {
  await requireLeadgenAdmin();

  const admin = getSupabaseAdmin();
  const { data: campaigns } = await admin
    .from("leadgen_campaigns")
    .select("id, name, client_id")
    .eq("status", "active")
    .order("name");
  const campaignRows = (campaigns ?? []) as { id: string; name: string; client_id: string }[];

  const clientIds = [...new Set(campaignRows.map((c) => c.client_id))];
  const { data: clients } = clientIds.length
    ? await admin.from("leadgen_clients").select("id, name").in("id", clientIds)
    : { data: [] as { id: string; name: string }[] };
  const clientNameById = new Map(((clients ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));

  const typeOptions = campaignRows.map((campaign) => ({
    value: campaign.id,
    label: `${clientNameById.get(campaign.client_id) ?? "Unknown client"} — ${campaign.name}`,
  }));

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900">Upload Call List</h1>
      <p className="mt-1 text-sm text-slate-500">
        Lead Generation CRM · Admin-only. Upload a CSV or XLSX export (e.g. from LeadSwift) to create a new Draft
        segment you can clean up before deploying it to agents.
      </p>

      <div className="mt-6">
        <UploadSegmentClient
          typeOptions={typeOptions}
          typeFieldLabel="Campaign"
          typeFieldName="leadgen_campaign_id"
          previewAction={previewUploadFileAction}
          uploadAction={uploadSegmentAction}
        />
      </div>
    </div>
  );
}
