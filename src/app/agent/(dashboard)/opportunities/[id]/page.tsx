import Link from "next/link";
import { requireCrmUser } from "@/lib/crm-auth";
import { loadAgentOpportunityDetail } from "@/lib/agent-opportunity-detail-data";
import OpportunityDetailClient from "./OpportunityDetailClient";

export default async function AgentOpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const crmUser = await requireCrmUser();
  const { id } = await params;

  const detail = await loadAgentOpportunityDetail(id);

  if (!detail) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-8 text-center">
        <h1 className="font-heading text-lg font-bold text-[var(--color-ink-strong)]">Business record not found</h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          This opportunity may have been deleted, reassigned, or the link may be incorrect.
        </p>
        <Link
          href="/agent/my-opportunities"
          className="mt-5 inline-block rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          ← Back to My Opportunities
        </Link>
      </div>
    );
  }

  return (
    <OpportunityDetailClient
      opportunity={detail.opportunity}
      activities={detail.activities}
      followUps={detail.followUps}
      currentAgentId={crmUser.id}
      emailHistory={detail.emailHistory}
      isEmailSuppressed={detail.isEmailSuppressed}
      dncSuppression={detail.dncSuppression}
      bookingUrl={detail.bookingUrl}
    />
  );
}
