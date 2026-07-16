import { businessConfig } from "@/config/business";

export default function Pricing() {
  const { gta, toronto, travelTimeNote, disclaimer } = businessConfig.pricing;

  return (
    <section id="pricing" className="bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">Pricing</h2>
          <p className="mt-4 text-slate-600">
            Note that final pricing depends on the size, condition, location and specific
            cleaning requirements of the property.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-8 text-center">
            <h3 className="text-lg font-semibold text-slate-900">{gta.label}</h3>
            <p className="mt-4 text-4xl font-bold text-sky-600">
              ${gta.minRate}&ndash;${gta.maxRate}
              <span className="text-base font-medium text-slate-500"> /hr</span>
            </p>
            <p className="mt-2 text-sm text-slate-500">Starting from, {gta.unit}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-8 text-center">
            <h3 className="text-lg font-semibold text-slate-900">{toronto.label}</h3>
            <p className="mt-4 text-4xl font-bold text-sky-600">
              ${toronto.rate}
              <span className="text-base font-medium text-slate-500"> /hr</span>
            </p>
            <p className="mt-2 text-sm text-slate-500">Starting from, {toronto.unit}</p>
          </div>
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-slate-600">
          <span className="font-medium text-slate-800">Travel time:</span> {travelTimeNote}
        </p>

        <p className="mx-auto mt-4 max-w-2xl rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">
          {disclaimer}
        </p>
      </div>
    </section>
  );
}
