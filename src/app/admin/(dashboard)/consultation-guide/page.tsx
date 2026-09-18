import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  CONSULTATION_GUIDE_STATUS_LABELS,
  CONSULTATION_GUIDE_STATUS_STYLES,
  type CrmConsultationGuideRow,
} from "@/lib/consultation-guide";

// Admin-only Client Consultation Guide index - "Keep historical
// consultations available so Admin can reopen them later." Opening this
// page with ?opportunityId=<id> (from an opportunity record's own
// "Consultation Guide" link) skips straight to a new, pre-filled guide
// rather than showing the list first.
export default async function ConsultationGuideIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ opportunityId?: string }>;
}) {
  await requireCrmAdmin();
  const { opportunityId } = await searchParams;
  if (opportunityId) {
    redirect(`/admin/consultation-guide/new?opportunityId=${encodeURIComponent(opportunityId)}`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("crm_consultation_guides")
    .select("id, created_at, updated_at, status, business_name, contact_name, consultation_date, consultant_name")
    .order("created_at", { ascending: false });

  const guides = (data ?? []) as Pick<
    CrmConsultationGuideRow,
    "id" | "created_at" | "updated_at" | "status" | "business_name" | "contact_name" | "consultation_date" | "consultant_name"
  >[];

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

      <div className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Business</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Consultant</th>
                <th className="px-3 py-2">Consultation Date</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Last Updated</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {guides.map((guide) => (
                <tr key={guide.id} className="border-b border-slate-100 last:border-0">
                  <td className="max-w-[220px] px-3 py-2 font-medium text-slate-900">
                    <Link href={`/admin/consultation-guide/${guide.id}`} className="line-clamp-2 break-words hover:text-sky-600">
                      {guide.business_name || "Untitled consultation"}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{guide.contact_name || "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{guide.consultant_name || "—"}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {guide.consultation_date ? new Date(guide.consultation_date).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${CONSULTATION_GUIDE_STATUS_STYLES[guide.status]}`}
                    >
                      {CONSULTATION_GUIDE_STATUS_LABELS[guide.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{new Date(guide.updated_at).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/admin/consultation-guide/${guide.id}`}
                      className="inline-flex whitespace-nowrap rounded-md border border-sky-600 px-2.5 py-1 text-[11px] font-semibold text-sky-600 hover:bg-sky-600 hover:text-white"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}

              {guides.length === 0 && !error && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    No consultations logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
