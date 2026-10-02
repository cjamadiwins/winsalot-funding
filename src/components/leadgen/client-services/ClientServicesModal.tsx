"use client";

import LargeModal from "@/components/crm-ui/LargeModal";
import { AGENT_PRICING_REMINDER, activeServices, formatServicePrice, sortServices, type ClientServiceRow } from "@/lib/leadgen-client-services";
import ServiceDetails from "./ServiceDetails";

// Read-only "Client Services & Pricing" panel for agents (and Admin) working a
// client's campaign. Deliberately has no inputs or save actions: the data comes
// from RLS-scoped reads (active entries of assigned clients only) and there is
// no write path for an agent.
export default function ClientServicesModal({ clientName, services, onClose }: { clientName: string; services: ClientServiceRow[]; onClose: () => void }) {
  const rows = sortServices(activeServices(services));
  return (
    <LargeModal
      open
      onClose={onClose}
      maxWidthClassName="max-w-2xl"
      labelledBy="client-services-title"
      headerLeft={
        <div className="min-w-0">
          <h2 id="client-services-title" className="text-lg font-bold text-slate-900">
            Products, Services &amp; Pricing
          </h2>
          <p className="mt-0.5 truncate text-[12.5px] text-slate-500">{clientName} · read-only reference</p>
        </div>
      }
      footer={
        <div className="flex w-full justify-end">
          <button type="button" onClick={onClose} className="rounded-full border border-slate-300 px-3.5 py-1.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">
            Close
          </button>
        </div>
      }
    >
      <div className="space-y-3 pb-1">
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">{AGENT_PRICING_REMINDER}</p>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No services or pricing have been added for this client yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {rows.map((service) => {
              const price = formatServicePrice(service);
              return (
                <li key={service.id} className="rounded-xl border border-slate-200 bg-white px-3.5 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <h3 className="text-[14px] font-bold text-slate-900">{service.name}</h3>
                    {price && (
                      <p className="text-right text-[13.5px] font-semibold text-sky-800">
                        {price}
                        {service.price_condition && <span className="block text-[11.5px] font-medium text-slate-500">{service.price_condition}</span>}
                      </p>
                    )}
                  </div>
                  <div className="mt-1.5">
                    <ServiceDetails service={service} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </LargeModal>
  );
}
