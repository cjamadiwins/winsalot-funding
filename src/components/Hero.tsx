import { heroRequirements, heroStats } from "@/lib/content";
import LeadForm from "./LeadForm";

export default function Hero() {
  return (
    <div className="relative overflow-hidden px-8 pb-[110px] pt-24 sm:px-14">
      <div
        className="pointer-events-none absolute -right-40 -top-30 h-[520px] w-[520px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, oklch(0.55 0.15 250 / 0.14), transparent 70%)",
        }}
      />
      <div className="relative grid grid-cols-1 items-start gap-12 lg:grid-cols-[minmax(320px,680px)_minmax(300px,380px)]">
        <div className="animate-float-up">
          <div className="mb-[26px] inline-flex items-center gap-2 rounded-full bg-[var(--color-accent-soft)] px-4 py-[7px] text-[13px] font-semibold text-[var(--color-accent-soft-text)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            Now funding Canadian SMEs coast to coast
          </div>
          <h1 className="font-heading text-[40px] font-bold leading-[1.06] tracking-[-0.03em] text-[var(--color-ink-strong)] sm:text-[56px]">
            Get funded in 48 hours.
          </h1>
          <div className="mt-6 text-[19px] leading-[1.55] text-[var(--color-ink-soft)]">
            To get funded, Winsalot Corp requires:
          </div>
          <ul className="mt-4 flex flex-col gap-2.5">
            {heroRequirements.map((req) => (
              <li key={req} className="flex items-start gap-2.5 text-[16.5px] leading-[1.5] text-[var(--color-text-body-2)]">
                <span className="mt-[9px] h-1.5 w-1.5 flex-none rounded-full bg-[var(--color-accent)]" />
                {req}
              </li>
            ))}
          </ul>
          <div className="mt-[38px] flex flex-wrap items-center gap-4">
            <a
              href="#apply"
              className="whitespace-nowrap rounded-full bg-[var(--color-accent)] px-[30px] py-4 text-base font-semibold text-white hover:opacity-90 transition-opacity"
            >
              Get Funded Today
            </a>
            <a
              href="#how-it-works"
              className="whitespace-nowrap px-[26px] py-4 text-base font-semibold text-[var(--color-ink)] hover:opacity-70 transition-opacity"
            >
              See how it works →
            </a>
          </div>
          <div className="mt-14 flex flex-wrap gap-10">
            {heroStats.map((stat) => (
              <div key={stat.label}>
                <div className="font-heading text-[28px] font-bold text-[var(--color-ink-strong)]">
                  {stat.value}
                </div>
                <div className="mt-1 text-[13.5px] text-[var(--color-text-muted)]">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          id="apply"
          className="animate-float-up-slow w-full scroll-mt-24 justify-self-end rounded-[20px] bg-white p-7"
          style={{ boxShadow: "0 30px 60px -20px var(--color-card-shadow)" }}
        >
          <LeadForm />
        </div>
      </div>
    </div>
  );
}
