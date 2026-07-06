import { lineFeatures, revenueFeatures } from "@/lib/content";

export default function Products() {
  return (
    <div className="px-8 py-24 sm:px-14">
      <div className="mx-auto mb-[60px] max-w-[600px] text-center">
        <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--color-accent)]">
          Funding products
        </div>
        <h2 className="mt-2.5 font-heading text-[32px] font-bold tracking-[-0.02em] sm:text-[38px]">
          Two ways to get capital moving
        </h2>
      </div>
      <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-7 md:grid-cols-2">
        <div
          id="revenue-advance"
          className="scroll-mt-24 rounded-[22px] border border-[var(--color-border)] bg-white p-11"
        >
          <div className="mb-3 font-heading text-2xl font-bold">Revenue Advance</div>
          <div className="mb-7 text-[15.5px] leading-[1.6] text-[var(--color-ink-soft)]">
            Get $10K–$2M today, repaid through small automatic remittances tied
            to your daily or weekly revenue. Existing loans or a rough credit
            score? Still workable.
          </div>
          <div className="mb-8 flex flex-col gap-3">
            {revenueFeatures.map((feature) => (
              <div key={feature} className="flex items-center gap-2.5 text-[14.5px] text-[var(--color-text-body)]">
                <span className="h-[18px] w-[18px] flex-none rounded-full bg-[var(--color-accent-soft)]" />
                {feature}
              </div>
            ))}
          </div>
          <a href="#apply" className="text-[15px] font-semibold text-[var(--color-accent)] hover:opacity-80 transition-opacity">
            Explore Revenue Advance →
          </a>
        </div>
        <div
          id="capital-line"
          className="scroll-mt-24 rounded-[22px] border border-[var(--color-border)] bg-white p-11"
        >
          <div className="mb-3 font-heading text-2xl font-bold">Capital Line</div>
          <div className="mb-7 text-[15.5px] leading-[1.6] text-[var(--color-ink-soft)]">
            Draw funds as you need them and pay only for what you use — no
            reapplying every time cash flow gets tight. Ideal for ongoing,
            seasonal needs.
          </div>
          <div className="mb-8 flex flex-col gap-3">
            {lineFeatures.map((feature) => (
              <div key={feature} className="flex items-center gap-2.5 text-[14.5px] text-[var(--color-text-body)]">
                <span className="h-[18px] w-[18px] flex-none rounded-full bg-[var(--color-green-soft)]" />
                {feature}
              </div>
            ))}
          </div>
          <a href="#apply" className="text-[15px] font-semibold text-[var(--color-green)] hover:opacity-80 transition-opacity">
            Explore Capital Line →
          </a>
        </div>
      </div>
    </div>
  );
}
