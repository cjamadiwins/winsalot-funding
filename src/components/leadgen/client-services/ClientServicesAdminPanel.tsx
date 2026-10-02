"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  HISTORY_LABELS,
  PRICING_TYPES,
  PRICING_TYPE_LABELS,
  SERVICE_CURRENCIES,
  formatServicePrice,
  serviceToFormInput,
  sortServices,
  type ClientServiceHistoryRow,
  type ClientServiceRow,
  type ServiceFormInput,
} from "@/lib/leadgen-client-services";
import ServiceDetails from "./ServiceDetails";

type ActionResult = { error?: string; message?: string };

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] text-slate-900";
const labelClass = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

// Admin "Products, Services & Pricing" section of the Client Profile: add, edit,
// update pricing, deactivate/reactivate and reorder. Every control calls an
// Admin-only server action (which re-checks the Admin role and that the entry
// belongs to this client); agents never receive this component.
export default function ClientServicesAdminPanel({
  clientId,
  services,
  history,
  userNames,
  actions,
}: {
  clientId: string;
  services: ClientServiceRow[];
  history: ClientServiceHistoryRow[];
  userNames: Record<string, string>;
  actions: {
    save: (clientId: string, serviceId: string | null, input: ServiceFormInput) => Promise<ActionResult>;
    setActive: (clientId: string, serviceId: string, active: boolean) => Promise<ActionResult>;
    move: (clientId: string, serviceId: string, direction: "up" | "down") => Promise<ActionResult>;
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<ServiceFormInput>(serviceToFormInput(null));
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const rows = sortServices(services);
  const set = <K extends keyof ServiceFormInput>(key: K, value: ServiceFormInput[K]) => setForm((current) => ({ ...current, [key]: value }));

  function run(action: () => Promise<ActionResult>, after?: () => void) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setMessage({ kind: "error", text: result.error });
        return;
      }
      if (result.message) setMessage({ kind: "ok", text: result.message });
      after?.();
      router.refresh();
    });
  }

  function startEdit(row: ClientServiceRow | null) {
    setForm(serviceToFormInput(row));
    setEditingId(row ? row.id : "new");
    setMessage(null);
  }

  const isNote = form.entry_type === "note";
  const needsAmount = !isNote && form.pricing_type !== "custom_quote";

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-sky-700">Products, Services &amp; Pricing</h2>
          <p className="mt-0.5 text-[12px] text-slate-500">Internal reference supplied by this client. Visible to Admin and to agents assigned to this client (read-only); never shown in the client portal.</p>
        </div>
        {editingId === null && (
          <button type="button" onClick={() => startEdit(null)} className="text-sm font-semibold text-sky-600 hover:text-sky-700">
            + Add Service / Note
          </button>
        )}
      </div>

      {message && <p className={`mt-2 text-[12.5px] font-medium ${message.kind === "error" ? "text-rose-700" : "text-emerald-700"}`}>{message.text}</p>}

      {editingId !== null && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => actions.save(clientId, editingId === "new" ? null : editingId, form),
              () => setEditingId(null),
            );
          }}
          className="mt-3 space-y-3 rounded-xl border border-sky-200 bg-white p-3.5"
        >
          <p className="text-[13px] font-bold text-slate-900">{editingId === "new" ? "Add Service / Note" : "Edit"}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className={labelClass}>Service / Product Name</span>
              <input required maxLength={120} value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Type</span>
              <select value={form.entry_type} onChange={(e) => set("entry_type", e.target.value)} className={inputClass}>
                <option value="service">Priced service / product</option>
                <option value="note">Reference note (no price)</option>
              </select>
            </label>
          </div>

          {!isNote && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Billing Type</span>
                <select value={form.pricing_type} onChange={(e) => set("pricing_type", e.target.value)} className={inputClass}>
                  {PRICING_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {PRICING_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Starting Price / Price</span>
                <input inputMode="decimal" disabled={!needsAmount} value={needsAmount ? form.price_amount : ""} onChange={(e) => set("price_amount", e.target.value)} placeholder={needsAmount ? "e.g. 465" : "—"} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Currency</span>
                <select value={form.currency} onChange={(e) => set("currency", e.target.value)} className={inputClass}>
                  {SERVICE_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Condition (optional)</span>
                <input maxLength={120} value={form.price_condition} onChange={(e) => set("price_condition", e.target.value)} placeholder="e.g. Two-year signup" className={inputClass} />
              </label>
              <label className="col-span-2 flex items-center gap-2 text-[12.5px] text-slate-700 sm:col-span-4">
                <input type="checkbox" checked={form.plus_taxes} onChange={(e) => set("plus_taxes", e.target.checked)} /> Show “+ applicable taxes”
              </label>
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className={labelClass}>Description</span>
            <textarea rows={2} maxLength={2000} value={form.description} onChange={(e) => set("description", e.target.value)} className={inputClass} />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>What Is Included · one per line</span>
              <textarea rows={4} value={form.included} onChange={(e) => set("included", e.target.value)} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Additional Costs / Exclusions · one per line</span>
              <textarea rows={4} value={form.additional_costs} onChange={(e) => set("additional_costs", e.target.value)} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Technical Notes</span>
              <textarea rows={3} maxLength={2000} value={form.technical_notes} onChange={(e) => set("technical_notes", e.target.value)} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Sales Notes</span>
              <textarea rows={3} maxLength={2000} value={form.sales_notes} onChange={(e) => set("sales_notes", e.target.value)} className={inputClass} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-[12.5px] text-slate-700">
            <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Active (agents can see it)
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
              {isPending ? "Saving…" : "Save"}
            </button>
            <button type="button" disabled={isPending} onClick={() => setEditingId(null)} className="rounded-full border border-slate-300 px-4 py-1.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </form>
      )}

      {rows.length === 0 ? (
        <p className="mt-3 text-[13px] text-slate-500">No products, services or pricing added for this client yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((service, index) => {
            const price = formatServicePrice(service);
            const entryHistory = history.filter((h) => h.service_id === service.id);
            const updatedBy = service.updated_by ? userNames[service.updated_by] : null;
            return (
              <li key={service.id} className={`rounded-xl border px-3.5 py-2.5 ${service.is_active ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50 opacity-80"}`}>
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                  <div className="min-w-0">
                    <h3 className="flex flex-wrap items-center gap-2 text-[14px] font-bold text-slate-900">
                      {service.name}
                      {service.entry_type === "note" && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-600">Note</span>}
                      <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${service.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>
                        {service.is_active ? "Active" : "Inactive"}
                      </span>
                    </h3>
                    <p className="text-[11.5px] text-slate-400">
                      Last updated {formatDate(service.updated_at)}
                      {updatedBy ? ` by ${updatedBy}` : ""}
                    </p>
                  </div>
                  {price && (
                    <p className="text-right text-[13.5px] font-semibold text-sky-800">
                      {price}
                      {service.price_condition && <span className="block text-[11.5px] font-medium text-slate-500">{service.price_condition}</span>}
                    </p>
                  )}
                </div>

                <details className="mt-1.5">
                  <summary className="cursor-pointer text-[12px] font-semibold text-slate-600">Details</summary>
                  <div className="mt-1.5">
                    <ServiceDetails service={service} />
                  </div>
                </details>

                {entryHistory.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[12px] font-semibold text-slate-600">History ({entryHistory.length})</summary>
                    <ul className="mt-1 space-y-0.5 text-[12px] text-slate-600">
                      {entryHistory.map((h) => {
                        const before = h.previous ? formatServicePrice({ entry_type: service.entry_type, pricing_type: h.previous.pricing_type ?? null, price_amount: h.previous.price_amount ?? null, currency: h.previous.currency ?? "CAD", plus_taxes: h.previous.plus_taxes ?? true }) : null;
                        const after = formatServicePrice({ entry_type: service.entry_type, pricing_type: h.snapshot.pricing_type ?? null, price_amount: h.snapshot.price_amount ?? null, currency: h.snapshot.currency ?? "CAD", plus_taxes: h.snapshot.plus_taxes ?? true });
                        return (
                          <li key={h.id}>
                            {formatDate(h.changed_at)} · {HISTORY_LABELS[h.change_type]}
                            {h.change_type === "price_changed" && before && after ? ` (${before} → ${after})` : ""}
                            {h.changed_by && userNames[h.changed_by] ? ` · ${userNames[h.changed_by]}` : ""}
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-3 text-[12.5px] font-semibold">
                  <button type="button" disabled={isPending} onClick={() => startEdit(service)} className="text-sky-600 hover:text-sky-700 disabled:opacity-50">
                    Edit
                  </button>
                  <button type="button" disabled={isPending} onClick={() => run(() => actions.setActive(clientId, service.id, !service.is_active))} className="text-slate-600 hover:text-slate-800 disabled:opacity-50">
                    {service.is_active ? "Deactivate" : "Reactivate"}
                  </button>
                  <button type="button" aria-label={`Move ${service.name} up`} disabled={isPending || index === 0} onClick={() => run(() => actions.move(clientId, service.id, "up"))} className="text-slate-500 hover:text-slate-800 disabled:opacity-30">
                    ↑
                  </button>
                  <button type="button" aria-label={`Move ${service.name} down`} disabled={isPending || index === rows.length - 1} onClick={() => run(() => actions.move(clientId, service.id, "down"))} className="text-slate-500 hover:text-slate-800 disabled:opacity-30">
                    ↓
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
