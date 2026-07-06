import { valueProps } from "@/lib/content";

export default function ValueProps() {
  return (
    <div id="about" className="scroll-mt-24 bg-[var(--color-surface-dark)] px-8 py-20 sm:px-14">
      <div className="mx-auto mb-14 max-w-[640px] text-center">
        <h2 className="font-heading text-[32px] font-bold tracking-[-0.02em] text-white sm:text-[38px]">
          Built for how small business actually runs
        </h2>
      </div>
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {valueProps.map((vp) => (
          <div key={vp.title} className="rounded-[18px] bg-[var(--color-surface-dark-2)] p-8 px-[26px]">
            <div
              className="mb-5 h-11 w-11 rounded-xl"
              style={{ background: vp.color }}
            />
            <div className="mb-2.5 font-heading text-lg font-semibold text-white">
              {vp.title}
            </div>
            <div className="text-[14.5px] leading-[1.55] text-[var(--color-text-on-dark-soft)]">
              {vp.body}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
