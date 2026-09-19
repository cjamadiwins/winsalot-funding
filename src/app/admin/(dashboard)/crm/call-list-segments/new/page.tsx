import { requireCrmAdmin } from "@/lib/crm-auth";
import UploadSegmentClient from "@/components/crm-call-list/UploadSegmentClient";
import { previewUploadFileAction, uploadSegmentAction } from "../actions";

const OPPORTUNITY_TYPE_OPTIONS = [
  { value: "lead_generation", label: "Lead Generation" },
  { value: "business_financing", label: "Business Financing" },
  { value: "both_services", label: "Lead Gen + Financing" },
];

export default async function NewCallListSegmentPage() {
  await requireCrmAdmin();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900">Upload Call List</h1>
      <p className="mt-1 text-sm text-slate-500">
        Growth CRM · Admin-only. Upload a CSV or XLSX export (e.g. from LeadSwift) to create a new Draft segment you
        can clean up before deploying it to agents.
      </p>

      <div className="mt-6">
        <UploadSegmentClient
          typeOptions={OPPORTUNITY_TYPE_OPTIONS}
          typeFieldLabel="CRM Service"
          typeFieldName="opportunity_type"
          previewAction={previewUploadFileAction}
          uploadAction={uploadSegmentAction}
        />
      </div>
    </div>
  );
}
