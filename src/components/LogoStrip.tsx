import { industries } from "@/lib/content";

export default function LogoStrip() {
  return (
    <div className="px-8 pb-[70px] sm:px-14">
      <div className="mb-[26px] text-center text-[12.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-faint)]">
        Trusted by owners in restaurants, trades, retail &amp; logistics
      </div>
      <div className="flex flex-wrap justify-center gap-16 opacity-55">
        {industries.map((industry) => (
          <div key={industry} className="font-heading text-[15px] font-semibold text-[var(--color-ink-soft)]">
            {industry}
          </div>
        ))}
      </div>
    </div>
  );
}
