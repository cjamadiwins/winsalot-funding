import Link from "next/link";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { loadAdminOpportunityDetail } from "@/lib/admin-opportunity-detail-data";
import AdminOpportunityDetailClient from "./AdminOpportunityDetailClient";

export default async function AdminOpportunityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  await requireCrmAdmin();
  const { id } = await params;
  const { from } = await searchParams;
  const backHref = from === "opportunity-finder" ? "/admin/crm/opportunity-finder" : "/admin/crm/opportunities";
  const backLabel = from === "opportunity-finder" ? "Back to Opportunity Finder" : "Back to Opportunities";

  const detail = await loadAdminOpportunityDetail(id);

  if (!detail) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-8 text-center">
        <h1 className="text-lg font-bold text-slate-900">Business record not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          This opportunity may have been deleted, or the link may be incorrect.
        </p>
        <Link
          href={backHref}
          className="mt-5 inline-block rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          ← {backLabel}
        </Link>
      </div>
    );
  }

  return <AdminOpportunityDetailClient {...detail} />;
}
