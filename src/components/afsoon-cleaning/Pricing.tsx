import { businessConfig } from "@/config/business";

export default function Pricing() {
  return (
    <section id="pricing" className="bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">How Pricing Works</h2>
        </div>

        <p className="mx-auto mt-8 max-w-2xl rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-slate-600 sm:p-8">
          {businessConfig.pricingNote}
        </p>
      </div>
    </section>
  );
}
