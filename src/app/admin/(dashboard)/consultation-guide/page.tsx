import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import ConsultationGuideListClient, { type ConsultationGuideListRow } from "./ConsultationGuideListClient";

// Admin-only Client Consultation Guide index - "Keep historical
// consultations available so Admin can reopen them later." Opening this
// page with ?opportunityId=<id> (from an opportunity record's own
// "Consultation Guide" link) skips straight to a new, pre-filled guide
// rather than showing the list first. ?deleted=<business name> arrives
// from a confirmed "Delete consultation" on the Edit page (see
// ConsultationGuideForm) and becomes the success message below.
export default async function ConsultationGuideIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ opportunityId?: string; deleted?: string }>;
}) {
  await requireCrmAdmin();
  const { opportunityId, deleted } = await searchParams;
  if (opportunityId) {
    redirect(`/admin/consultation-guide/new?opportunityId=${encodeURIComponent(opportunityId)}`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("crm_consultation_guides")
    .select(
      "id, created_at, updated_at, status, business_name, contact_name, consultation_date, consultant_name, opportunity_id, appointment_id, service, follow_up_email_status"
    )
    .order("created_at", { ascending: false });

  const guides = (data ?? []) as ConsultationGuideListRow[];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <ClipboardCheck className="h-6 w-6 text-[var(--crm-accent,#3e7ef7)]" />
            Client Consultation Guide
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Use during prospect consultations to capture goals, campaign requirements, qualification criteria, and next steps.
          </p>
        </div>
        <Link
          href="/admin/consultation-guide/new"
          className="flex items-center gap-2 rounded-[11px] bg-[var(--crm-accent,#3e7ef7)] px-4 py-2.5 text-[13.5px] font-bold text-white shadow-sm transition hover:bg-[var(--crm-accent-hover,#2e63d6)]"
        >
          + New Consultation
        </Link>
      </div>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load consultation guides: {error.message}
        </p>
      )}

      {!error && <ConsultationGuideListClient guides={guides} successMessage={deleted ? `Deleted the consultation record for ${deleted}.` : null} />}
    </div>
  );
}
