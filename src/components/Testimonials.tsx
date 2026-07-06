import { testimonials } from "@/lib/content";

export default function Testimonials() {
  return (
    <div className="bg-[var(--color-surface-warm)] px-8 py-20 sm:px-14">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-6 sm:grid-cols-3">
        {testimonials.map((t) => (
          <div key={t.name} className="rounded-[18px] border border-[var(--color-border)] bg-white p-8">
            <div className="mb-5 text-[15px] leading-[1.6] text-[var(--color-text-body)]">
              &ldquo;{t.quote}&rdquo;
            </div>
            <div className="text-[13.5px] font-semibold text-[var(--color-ink-strong)]">
              {t.name}
            </div>
            <div className="text-[13px] text-[var(--color-text-muted)]">{t.biz}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
