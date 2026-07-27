import NewProviderLeadForm from "./NewProviderLeadForm";

export default function NewProviderLeadPage() {
  return (
    <div>
      <h1 className="font-heading text-[24px] font-bold text-[var(--color-ink-strong)]">
        Add Provider Lead
      </h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        Enter the cleaning company&apos;s information. It will be assigned to you.
      </p>

      <NewProviderLeadForm />
    </div>
  );
}
