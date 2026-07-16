import { Phone, Mail, Clock, MapPin } from "lucide-react";
import { businessConfig } from "@/config/business";
import FulfillmentNotice from "./FulfillmentNotice";

const items = [
  {
    label: "Phone",
    value: businessConfig.phone.display,
    href: `tel:${businessConfig.phone.href}`,
    icon: Phone,
  },
  {
    label: "Email",
    value: businessConfig.email,
    href: `mailto:${businessConfig.email}`,
    icon: Mail,
  },
  {
    label: "Operating Hours",
    value: businessConfig.hours,
    icon: Clock,
  },
  {
    label: "Service Area",
    value: businessConfig.serviceAreaSummary,
    icon: MapPin,
  },
];

export default function Contact() {
  return (
    <section className="bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">Contact Us</h2>
        </div>

        <div className="mx-auto mt-6 max-w-2xl">
          <FulfillmentNotice variant="compact" />
        </div>

        <div className="mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
          {items.map((item) => (
            <div key={item.label} className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                <item.icon className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">{item.label}</p>
                {item.href ? (
                  <a href={item.href} className="font-semibold text-slate-900 hover:text-sky-600">
                    {item.value}
                  </a>
                ) : (
                  <p className="font-semibold text-slate-900">{item.value}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
