import { steps } from "@/lib/content";

export default function HowItWorks() {
  return (
    <div id="how-it-works" className="scroll-mt-24 bg-[var(--color-surface-warm)] px-8 py-24 sm:px-14">
      <div className="mx-auto mb-16 max-w-[600px] text-center">
        <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--color-accent)]">
          How it works
        </div>
        <h2 className="mt-2.5 font-heading text-[32px] font-bold tracking-[-0.02em] sm:text-[38px]">
          From application to funded in three steps
        </h2>
      </div>
      <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-8 sm:grid-cols-3">
        {steps.map((step) => (
          <div key={step.n} className="relative pt-2">
            <div className="mb-3.5 font-heading text-[46px] font-bold text-[var(--color-step-num)]">
              {step.n}
            </div>
            <div className="mb-2.5 font-heading text-[19px] font-semibold">
              {step.title}
            </div>
            <div className="text-[14.5px] leading-[1.6] text-[var(--color-text-muted-2)]">
              {step.body}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
