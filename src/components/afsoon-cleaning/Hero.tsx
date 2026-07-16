import { Phone } from "lucide-react";
import { businessConfig } from "@/config/business";

export default function Hero() {
  return (
    <section id="home" className="bg-gradient-to-b from-sky-50 to-white">
      <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-24">
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          Reliable Cleaning Services Across Toronto and the GTA
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
          Professional, dependable and affordable cleaning services tailored to your home or
          business. Tell us what you need and receive a personalized quote.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="#quote"
            className="w-full rounded-full bg-sky-600 px-8 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-sky-700 sm:w-auto"
          >
            Request a Free Quote
          </a>
          <a
            href={`tel:${businessConfig.phone.href}`}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-8 py-3.5 text-base font-semibold text-slate-800 transition hover:border-slate-400 sm:w-auto"
          >
            <Phone className="h-4 w-4" />
            Call Now: {businessConfig.phone.display}
          </a>
        </div>
      </div>
    </section>
  );
}
