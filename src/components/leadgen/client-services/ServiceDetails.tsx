import type { ClientServiceRow } from "@/lib/leadgen-client-services";

const headingClass = "text-[10.5px] font-semibold uppercase tracking-wide text-slate-400";

// Read-only body of one product/service/note, shared by the Admin profile and
// the agent modal so both always show the same content. Renders nothing for a
// field that is empty (nothing is invented or padded).
export default function ServiceDetails({ service }: { service: ClientServiceRow }) {
  return (
    <div className="space-y-2 text-[13px] text-slate-700">
      {service.description && <p>{service.description}</p>}
      {service.included.length > 0 && (
        <div>
          <p className={headingClass}>What Is Included</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
            {service.included.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {service.additional_costs.length > 0 && (
        <div>
          <p className={headingClass}>Additional Costs / Exclusions</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
            {service.additional_costs.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {service.technical_notes && (
        <div>
          <p className={headingClass}>Technical / Service Notes</p>
          <p className="mt-0.5 whitespace-pre-line">{service.technical_notes}</p>
        </div>
      )}
      {service.sales_notes && (
        <div className="rounded-lg bg-sky-50 px-2.5 py-1.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-sky-700">Sales Notes</p>
          <p className="mt-0.5 whitespace-pre-line text-slate-800">{service.sales_notes}</p>
        </div>
      )}
    </div>
  );
}
