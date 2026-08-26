import { requireCrmUser } from "@/lib/crm-auth";
import OpportunityFieldsForm from "@/components/OpportunityFieldsForm";
import { createOpportunityAction } from "./actions";

export default async function NewOpportunityPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireCrmUser();
  const params = await searchParams;

  return (
    <div>
      <h1 className="font-heading text-[24px] font-bold text-[var(--color-ink-strong)]">
        New Opportunity
      </h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        Add a new Lead Generation or Business Financing opportunity. It will be assigned to you.
      </p>

      <form
        action={createOpportunityAction}
        className="mt-6 max-w-2xl rounded-xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-5 sm:p-6"
      >
        {params.error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {params.error}
          </p>
        )}

        <OpportunityFieldsForm />

        <button
          type="submit"
          className="mt-6 w-full rounded-full bg-[var(--color-accent)] px-6 py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 sm:w-auto"
        >
          Save Opportunity
        </button>
      </form>
    </div>
  );
}
