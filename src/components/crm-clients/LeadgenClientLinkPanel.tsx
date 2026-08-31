"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type ActionResult = { error?: string };
type LeadgenClientOption = { id: string; name: string; slug: string };

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px] text-slate-900";
const buttonClass = "rounded-full border border-slate-300 px-3.5 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const primaryButtonClass = "rounded-full bg-indigo-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50";

// Single, shared "Lead Generation Client" link control - both the Monthly
// Client Reports and Client Portal Access sections read the same
// crm_clients.leadgen_client_id set here (via linkAction), so a client is
// only ever linked once instead of the two sections offering their own,
// possibly-conflicting linking UIs.
export default function LeadgenClientLinkPanel({
  crmClientId,
  leadgenClientId,
  leadgenClientName,
  options,
  linkAction,
  createAndLinkAction,
}: {
  crmClientId: string;
  leadgenClientId: string | null;
  leadgenClientName: string | null;
  options: LeadgenClientOption[];
  linkAction: (crmClientId: string, formData: FormData) => Promise<ActionResult>;
  createAndLinkAction: (crmClientId: string, formData: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [showCreateNew, setShowCreateNew] = useState(false);

  function runAction(action: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      setIsEditing(false);
      setShowCreateNew(false);
      router.refresh();
    });
  }

  const showForm = !leadgenClientId || isEditing;

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-[15px] font-bold text-slate-900">Lead Generation Client</h2>
      <p className="mt-1 text-[12.5px] text-slate-500">
        Links this Growth CRM client to its matching Lead Generation CRM client/campaign - used by Monthly Client Reports and Client Portal Access below.
      </p>

      {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}

      {!showForm ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px]">
            <span className="text-slate-500">Linked to: </span>
            <span className="font-semibold text-slate-900">{leadgenClientName}</span>
          </p>
          <button type="button" onClick={() => setIsEditing(true)} className={buttonClass}>
            Change Link
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {!showCreateNew ? (
            <form
              action={(formData) => runAction(() => linkAction(crmClientId, formData))}
              className="flex flex-wrap items-center gap-2"
            >
              <select name="leadgen_client_id" required className={`${inputClass} max-w-xs`} defaultValue={leadgenClientId ?? ""}>
                <option value="" disabled>
                  Select a Lead Generation client…
                </option>
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={isPending} className={primaryButtonClass}>
                Link Client
              </button>
              {leadgenClientId && (
                <button type="button" onClick={() => setIsEditing(false)} className={buttonClass}>
                  Cancel
                </button>
              )}
              <button type="button" onClick={() => setShowCreateNew(true)} className={buttonClass}>
                + Create new Lead Gen client
              </button>
            </form>
          ) : (
            <form action={(formData) => runAction(() => createAndLinkAction(crmClientId, formData))} className="flex flex-wrap items-center gap-2">
              <input name="name" required placeholder="Lead Generation client name" className={`${inputClass} max-w-xs`} />
              <button type="submit" disabled={isPending} className={primaryButtonClass}>
                Create &amp; link
              </button>
              <button type="button" onClick={() => setShowCreateNew(false)} className={buttonClass}>
                Cancel
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
