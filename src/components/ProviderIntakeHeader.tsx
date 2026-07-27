export default function ProviderIntakeHeader() {
  return (
    <div className="flex flex-col items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-8 py-12 text-center sm:px-14">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/winsalot-logo.png" alt="Winsalot Corp" className="h-16 w-auto" />
      <div className="font-heading text-[13.5px] font-semibold uppercase tracking-wide text-[var(--color-ink-mute)]">
        Winsalot Corp
      </div>
      <h1 className="max-w-lg font-heading text-[26px] font-bold text-[var(--color-ink-strong)] sm:text-[30px]">
        Cleaning Provider Intake Form
      </h1>
      <p className="max-w-md text-[14.5px] leading-[1.5] text-[var(--color-text-muted)]">
        Tell us about your cleaning company so we can consider your business for upcoming
        opportunities. Completing this form does not obligate you to accept any job.
      </p>
    </div>
  );
}
