import {
  House,
  Building2,
  Briefcase,
  Boxes,
  Truck,
  SprayCan,
  Repeat,
  type LucideIcon,
} from "lucide-react";

const services: { title: string; description: string; icon: LucideIcon }[] = [
  {
    title: "Residential Cleaning",
    description: "Routine and one-time cleaning for houses, condos and apartments.",
    icon: House,
  },
  {
    title: "Commercial Cleaning",
    description: "Cleaning for retail spaces, clinics and other commercial properties.",
    icon: Building2,
  },
  {
    title: "Office Cleaning",
    description: "Keep workspaces tidy and welcoming for staff and clients.",
    icon: Briefcase,
  },
  {
    title: "Move-In Cleaning",
    description: "A thorough clean before you settle into a new home.",
    icon: Boxes,
  },
  {
    title: "Move-Out Cleaning",
    description: "Leave a property spotless for the next tenant or owner.",
    icon: Truck,
  },
  {
    title: "Deep Cleaning",
    description: "A more detailed clean covering areas routine cleaning may miss.",
    icon: SprayCan,
  },
  {
    title: "Regular Scheduled Cleaning",
    description: "Weekly, bi-weekly or monthly visits on a schedule that suits you.",
    icon: Repeat,
  },
];

export default function Services() {
  return (
    <section id="services" className="bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">Our Services</h2>
          <p className="mt-4 text-slate-600">
            Cleaning services for homes and businesses of every size, serving your area.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <div
              key={service.title}
              className="rounded-2xl border border-slate-200 p-6 transition hover:border-sky-200 hover:shadow-md"
            >
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                <service.icon className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">{service.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{service.description}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-slate-500">
          Don&apos;t see what you need? You can request other cleaning services through the
          quote form below.
        </p>
      </div>
    </section>
  );
}
