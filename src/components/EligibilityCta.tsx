import { eligibility } from "@/lib/content";

export default function EligibilityCta() {
  return (
    <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-14 px-8 py-24 sm:px-14 lg:grid-cols-2">
      <div>
        <h2 className="mb-[22px] font-heading text-[28px] font-bold tracking-[-0.02em] sm:text-[32px]">
          Simple to qualify
        </h2>
        <div className="flex flex-col gap-[18px]">
          {eligibility.map((item) => (
            <div key={item} className="flex items-start gap-3.5">
              <span className="mt-0.5 flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg bg-[var(--color-ink)] text-[13px] font-bold text-white">
                ✓
              </span>
              <div className="text-[15.5px] leading-[1.5] text-[var(--color-text-body)]">
                {item}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col justify-center rounded-3xl bg-[var(--color-ink)] p-12">
        <h3 className="mb-3.5 font-heading text-[28px] font-bold tracking-[-0.02em] text-white">
          Ready to move on your next opportunity?
        </h3>
        <div className="mb-[30px] text-[15px] leading-[1.6] text-[var(--color-text-on-dark-soft-2)]">
          Applying takes under 5 minutes. A funding specialist reviews it right
          away — no long queues, no runaround.
        </div>
        <a
          href="#apply"
          className="rounded-full bg-[var(--color-accent)] py-4 text-center text-base font-semibold text-white hover:opacity-90 transition-opacity"
        >
          Start Your Application
        </a>
      </div>
    </div>
  );
}
