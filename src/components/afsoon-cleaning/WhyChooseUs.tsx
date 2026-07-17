import { ClipboardCheck, CalendarDays, MapPin, ThumbsUp, Sparkles } from "lucide-react";
import { businessConfig } from "@/config/business";

const reasons = [
  {
    title: "Reliable and Professional Service",
    description: "We show up when we say we will and treat your space with respect.",
    icon: ClipboardCheck,
  },
  {
    title: "Flexible Scheduling",
    description: "Book a one-time clean or set up a recurring visit that fits your routine.",
    icon: CalendarDays,
  },
  {
    title: "Local and Regional Service",
    description: `Serving businesses in ${businessConfig.serviceAreaSummary}.`,
    icon: MapPin,
  },
  {
    title: "Personalized Quotes",
    description: "Every quote reflects the specifics of your property and cleaning needs.",
    icon: ThumbsUp,
  },
  {
    title: "Attention to Detail",
    description: "We take the time to cover the details that make a space feel truly clean.",
    icon: Sparkles,
  },
];

export default function WhyChooseUs() {
  return (
    <section className="bg-slate-50 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">Why Choose Us</h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {reasons.map((reason) => (
            <div key={reason.title} className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <reason.icon className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">{reason.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{reason.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
