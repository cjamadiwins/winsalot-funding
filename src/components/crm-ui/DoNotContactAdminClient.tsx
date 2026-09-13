"use client";

import { useMemo, useState, useTransition } from "react";
import { blockedChannelsOf, type DncAuditLogRow, type DncChannel, type DncSourceCrm, type DncSuppressionRow } from "@/lib/dnc-types";
import DncBadge from "./DncBadge";
import Modal from "@/components/Modal";
import RowsPerPagePager, { usePagedRows } from "./RowsPerPagePager";

type ActionResult = { error?: string; success?: string };

// Server actions this view calls - every Do Not Contact dashboard trigger
// in both CRMs (admin AND agent - see DoNotContactModalTrigger) supplies
// its own concrete implementations, each bound to that CRM/role's own
// requireCrmAdmin()/requireCrmUser()/requireLeadgenAdmin()/
// requireLeadgenAgent() gate, but every one of them ultimately reads/
// writes the exact same shared crm_dnc_suppressions table
// (src/lib/dnc-suppression.ts) - this is what makes cross-CRM visibility
// possible from either dashboard, for either role.
//
// Only `addSuppression` is required - agents may add a restriction (Item
// 3) but the remove/reactivate/edit/history/CSV actions are admin-only
// (Item 4/5). This component renders the corresponding button/column only
// when the caller actually supplies that action, so an agent-facing
// caller that simply omits them gets a read-and-add-only view for free -
// there is no separate "agent mode" flag to keep in sync, and no
// client-reachable way to invoke an action that was never wired in. The
// underlying server actions re-verify the caller's role independently
// regardless (see src/app/*/do-not-contact*/actions.ts), so omitting a
// prop here is a UI convenience, not the actual access control.
export type DoNotContactAdminActions = {
  addSuppression: (formData: FormData) => Promise<ActionResult>;
  removeSuppression?: (formData: FormData) => Promise<ActionResult>;
  reactivateSuppression?: (formData: FormData) => Promise<ActionResult>;
  editSuppression?: (formData: FormData) => Promise<ActionResult>;
  importCsv?: (formData: FormData) => Promise<{ error?: string; success?: string; added?: number; merged?: number; skipped?: number }>;
  getAuditLog?: (suppressionId: string) => Promise<DncAuditLogRow[]>;
};

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const CHANNEL_LABELS: Record<DncChannel, string> = { phone: "Phone", sms: "SMS", email: "Email" };
const CHANNELS: DncChannel[] = ["phone", "sms", "email"];

// Renders as the body of a LargeModal (see DoNotContactModalTrigger) -
// no page-level heading of its own; the modal's own header supplies the
// title/subtitle so this starts straight into the filter bar/table, the
// same "search+filters bar, then scrollable content" layout every other
// LargeModal-hosted feature in this app uses (Opportunity Finder, Smart
// Opportunities).
export default function DoNotContactAdminClient({
  rows,
  exportHref,
  actions,
}: {
  rows: DncSuppressionRow[];
  // Admin-only CSV export (Item 5) - omitted entirely for an agent-facing
  // caller, which hides the "Export CSV" link rather than disabling it.
  exportHref?: string;
  actions: DoNotContactAdminActions;
}) {
  // Whether this row of buttons/column has anything to show at all - an
  // agent-facing caller supplies none of these, so the whole Actions
  // column (and its header cell) is omitted rather than rendered empty.
  const canManageRows = Boolean(actions.getAuditLog || actions.editSuppression || actions.removeSuppression || actions.reactivateSuppression);
  const columnCount = canManageRows ? 10 : 9;
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "removed" | "all">("active");
  const [channelFilter, setChannelFilter] = useState<DncChannel | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<DncSourceCrm | "all">("all");

  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [historyRow, setHistoryRow] = useState<DncSuppressionRow | null>(null);
  const [auditLog, setAuditLog] = useState<DncAuditLogRow[] | null>(null);
  const [editRow, setEditRow] = useState<DncSuppressionRow | null>(null);
  const [removingRow, setRemovingRow] = useState<DncSuppressionRow | null>(null);
  const [reactivatingRow, setReactivatingRow] = useState<DncSuppressionRow | null>(null);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (channelFilter !== "all" && !blockedChannelsOf(row).includes(channelFilter)) return false;
      if (sourceFilter !== "all" && row.source_crm !== sourceFilter) return false;
      if (!q) return true;
      return [row.contact_name, row.business_name, row.phone, row.normalized_phone, row.email]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(q));
    });
  }, [rows, search, statusFilter, channelFilter, sourceFilter]);

  const { pageRows, page, pageCount, pageSize, setPage, setPageSize, totalCount, rangeStart, rangeEnd } = usePagedRows(
    filteredRows,
    25
  );

  function runAction(fn: () => Promise<ActionResult>, onSuccess: () => void) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      else {
        if (result.success) setMessage(result.success);
        onSuccess();
      }
    });
  }

  async function openHistory(row: DncSuppressionRow) {
    if (!actions.getAuditLog) return;
    setHistoryRow(row);
    setAuditLog(null);
    const log = await actions.getAuditLog(row.id);
    setAuditLog(log);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, business, phone, or email…"
          className={`${inputClass} max-w-[220px]`}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="rounded-lg border border-slate-300 px-2.5 py-2 text-[13px]">
          <option value="active">Active</option>
          <option value="removed">Removed</option>
          <option value="all">All Statuses</option>
        </select>
        <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value as typeof channelFilter)} className="rounded-lg border border-slate-300 px-2.5 py-2 text-[13px]">
          <option value="all">All Channels</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {CHANNEL_LABELS[c]}
            </option>
          ))}
        </select>
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)} className="rounded-lg border border-slate-300 px-2.5 py-2 text-[13px]">
          <option value="all">Both CRMs</option>
          <option value="growth">Growth CRM</option>
          <option value="lead_generation">Lead Generation CRM</option>
        </select>

        {/* Export/Import are admin-only (Item 5) - an agent-facing caller
            simply never passes exportHref/actions.importCsv, so these are
            never rendered for them at all (not just disabled). */}
        <div className="ml-auto flex flex-wrap gap-2">
          {exportHref && (
            <a
              href={exportHref}
              className="rounded-full border border-slate-300 px-3.5 py-2 text-[12.5px] font-semibold text-slate-700 hover:border-slate-400"
            >
              Export CSV
            </a>
          )}
          {actions.importCsv && (
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="rounded-full border border-slate-300 px-3.5 py-2 text-[12.5px] font-semibold text-slate-700 hover:border-slate-400"
            >
              Import CSV
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="rounded-full bg-red-600 px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-red-700"
          >
            + Add
          </button>
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {message && <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>}

      {/* `table-fixed` + a <colgroup> (rather than min-w-[…] + overflow-x-auto,
          the convention every full-page admin table in this app uses) is
          deliberate here: this table only ever renders inside the
          Do Not Contact modal, and LargeModal's own contract is that no
          child introduces its own horizontal scroll - long values truncate
          with a `title` tooltip instead, so the table always fits the
          modal's width on a normal desktop window. */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full table-fixed text-left text-[12.5px]">
          <colgroup>
            <col className={canManageRows ? "w-[19%]" : "w-[21%]"} />
            <col className={canManageRows ? "w-[11%]" : "w-[12%]"} />
            <col className={canManageRows ? "w-[15%]" : "w-[16%]"} />
            <col className={canManageRows ? "w-[10%]" : "w-[11%]"} />
            <col className={canManageRows ? "w-[14%]" : "w-[15%]"} />
            <col className={canManageRows ? "w-[8%]" : "w-[9%]"} />
            <col className={canManageRows ? "w-[9%]" : "w-[10%]"} />
            <col className={canManageRows ? "w-[8%]" : "w-[8%]"} />
            <col className={canManageRows ? "w-[6%]" : "w-[8%]"} />
            {canManageRows && <col className="w-[13%]" />}
          </colgroup>
          <thead className="border-b border-slate-200 bg-slate-50 text-[10.5px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2.5 py-2.5">Business / Contact</th>
              <th className="px-2.5 py-2.5">Phone</th>
              <th className="px-2.5 py-2.5">Email</th>
              <th className="px-2.5 py-2.5">Channels</th>
              <th className="px-2.5 py-2.5">Reason</th>
              <th className="px-2.5 py-2.5">Source</th>
              <th className="px-2.5 py-2.5">Agent</th>
              <th className="px-2.5 py-2.5">Added</th>
              <th className="px-2.5 py-2.5">Status</th>
              {canManageRows && <th className="px-2.5 py-2.5">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="px-3 py-8 text-center text-slate-500">
                  No Do Not Contact records match your filters.
                </td>
              </tr>
            )}
            {pageRows.map((row) => (
              <tr key={row.id} className="align-top">
                <td className="px-2.5 py-2.5 font-semibold text-slate-800">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate" title={row.business_name || row.contact_name || undefined}>
                      {row.business_name || row.contact_name || "—"}
                    </span>
                    {row.status === "active" && <DncBadge suppression={row} className="shrink-0" />}
                  </div>
                  {row.business_name && row.contact_name && (
                    <div className="truncate text-[11px] font-normal text-slate-500" title={row.contact_name}>
                      {row.contact_name}
                    </div>
                  )}
                </td>
                <td className="truncate px-2.5 py-2.5 text-slate-600">{row.phone || "—"}</td>
                <td className="truncate px-2.5 py-2.5 text-slate-600" title={row.email ?? undefined}>
                  {row.email || "—"}
                </td>
                <td className="px-2.5 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {blockedChannelsOf(row).map((c) => (
                      <span key={c} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                        {CHANNEL_LABELS[c]}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="truncate px-2.5 py-2.5 text-slate-600" title={row.reason}>
                  {row.reason}
                </td>
                <td className="truncate px-2.5 py-2.5 text-slate-600">{row.source_crm === "growth" ? "Growth" : "Lead Gen"}</td>
                <td className="truncate px-2.5 py-2.5 text-slate-600" title={row.added_by_name ?? undefined}>
                  {row.added_by_name || "—"}
                </td>
                <td className="px-2.5 py-2.5 text-slate-600">{new Date(row.created_at).toLocaleDateString()}</td>
                <td className="px-2.5 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${row.status === "active" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600"}`}>
                    {row.status === "active" ? "Active" : "Removed"}
                  </span>
                </td>
                {canManageRows && (
                  <td className="px-2.5 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {actions.getAuditLog && (
                        <button type="button" onClick={() => openHistory(row)} className="text-[11.5px] font-semibold text-sky-600 hover:text-sky-700">
                          History
                        </button>
                      )}
                      {actions.editSuppression && (
                        <button type="button" onClick={() => setEditRow(row)} className="text-[11.5px] font-semibold text-slate-600 hover:text-slate-800">
                          Edit
                        </button>
                      )}
                      {/* Item 3/4: only Admin can remove/reactivate - these
                          two buttons only exist at all when the caller
                          passed the corresponding action. */}
                      {row.status === "active"
                        ? actions.removeSuppression && (
                            <button type="button" onClick={() => setRemovingRow(row)} className="text-[11.5px] font-semibold text-rose-600 hover:text-rose-700">
                              Remove
                            </button>
                          )
                        : actions.reactivateSuppression && (
                            <button type="button" onClick={() => setReactivatingRow(row)} className="text-[11.5px] font-semibold text-emerald-600 hover:text-emerald-700">
                              Reactivate
                            </button>
                          )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RowsPerPagePager
        page={page}
        pageCount={pageCount}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        totalCount={totalCount}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
      />

      {showAddModal && (
        <AddSuppressionModal
          onClose={() => setShowAddModal(false)}
          isPending={isPending}
          onSubmit={(formData) =>
            runAction(() => actions.addSuppression(formData), () => setShowAddModal(false))
          }
        />
      )}

      {showImportModal && (
        <ImportCsvModal
          onClose={() => setShowImportModal(false)}
          onImport={async (formData) => {
            setError(null);
            setMessage(null);
            const result = actions.importCsv ? await actions.importCsv(formData) : { error: "Not permitted." };
            if (result.error) setError(result.error);
            else {
              setMessage(
                `Import complete — ${result.added ?? 0} added, ${result.merged ?? 0} merged into existing records, ${result.skipped ?? 0} skipped.`
              );
              setShowImportModal(false);
            }
          }}
        />
      )}

      {historyRow && (
        <Modal title={`History — ${historyRow.business_name || historyRow.contact_name || "Do Not Contact"}`} onClose={() => setHistoryRow(null)}>
          {auditLog === null ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : auditLog.length === 0 ? (
            <p className="text-sm text-slate-500">No history recorded.</p>
          ) : (
            <ul className="max-h-[50vh] space-y-3 overflow-y-auto text-sm">
              {auditLog.map((entry) => (
                <li key={entry.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold capitalize text-slate-800">{entry.action}</span>
                    <span className="text-[11px] text-slate-400">{new Date(entry.created_at).toLocaleString()}</span>
                  </div>
                  <div className="mt-1 text-[12.5px] text-slate-600">
                    {entry.performed_by_name || "System"} · {entry.source_crm === "growth" ? "Growth CRM" : "Lead Generation CRM"}
                  </div>
                  {entry.reason && <div className="mt-1 text-[12.5px] text-slate-700">Reason: {entry.reason}</div>}
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

      {editRow && (
        <EditSuppressionModal
          row={editRow}
          isPending={isPending}
          onClose={() => setEditRow(null)}
          onSubmit={(formData) => runAction(() => actions.editSuppression?.(formData) ?? Promise.resolve({ error: "Not permitted." }), () => setEditRow(null))}
        />
      )}

      {removingRow && (
        <RemoveSuppressionModal
          row={removingRow}
          isPending={isPending}
          onClose={() => setRemovingRow(null)}
          onSubmit={(formData) => runAction(() => actions.removeSuppression?.(formData) ?? Promise.resolve({ error: "Not permitted." }), () => setRemovingRow(null))}
        />
      )}

      {reactivatingRow && (
        <ReactivateSuppressionModal
          row={reactivatingRow}
          isPending={isPending}
          onClose={() => setReactivatingRow(null)}
          onSubmit={(formData) => runAction(() => actions.reactivateSuppression?.(formData) ?? Promise.resolve({ error: "Not permitted." }), () => setReactivatingRow(null))}
        />
      )}
    </div>
  );
}

function AddSuppressionModal({
  onClose,
  onSubmit,
  isPending,
}: {
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
  isPending: boolean;
}) {
  const [channels, setChannels] = useState<DncChannel[]>(["phone", "sms", "email"]);

  function toggleChannel(channel: DncChannel) {
    setChannels((prev) => (prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]));
  }

  return (
    <Modal title="Add to Do Not Contact" onClose={onClose}>
      <form
        action={(formData) => {
          channels.forEach((c) => formData.append("channels", c));
          onSubmit(formData);
        }}
        className="space-y-3"
      >
        <input name="business_name" placeholder="Business name" className={inputClass} />
        <input name="contact_name" placeholder="Contact name" className={inputClass} />
        <input name="phone" placeholder="Phone number" inputMode="tel" className={inputClass} />
        <input name="email" type="email" placeholder="Email address" className={inputClass} />
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Channels to block</span>
          <div className="mt-1.5 flex gap-3">
            {CHANNELS.map((c) => (
              <label key={c} className="flex items-center gap-1.5 text-sm text-slate-700">
                <input type="checkbox" checked={channels.includes(c)} onChange={() => toggleChannel(c)} />
                {CHANNEL_LABELS[c]}
              </label>
            ))}
          </div>
        </div>
        <textarea name="reason" required placeholder="Reason (required)" rows={2} className={inputClass} />
        <textarea name="notes" placeholder="Notes (optional)" rows={2} className={inputClass} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
            Cancel
          </button>
          <button type="submit" disabled={isPending} className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
            Add
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditSuppressionModal({
  row,
  onClose,
  onSubmit,
  isPending,
}: {
  row: DncSuppressionRow;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
  isPending: boolean;
}) {
  return (
    <Modal title="Edit Reason / Notes" onClose={onClose}>
      <form action={onSubmit} className="space-y-3">
        <input type="hidden" name="id" value={row.id} />
        <textarea name="reason" defaultValue={row.reason} required rows={2} className={inputClass} />
        <textarea name="notes" defaultValue={row.notes ?? ""} placeholder="Notes" rows={2} className={inputClass} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
            Cancel
          </button>
          <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RemoveSuppressionModal({
  row,
  onClose,
  onSubmit,
  isPending,
}: {
  row: DncSuppressionRow;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
  isPending: boolean;
}) {
  return (
    <Modal title="Remove Do Not Contact Restriction" onClose={onClose}>
      <p className="text-sm text-slate-600">
        This will re-open <span className="font-semibold">{row.business_name || row.contact_name}</span> to outbound contact. A reason is required and is recorded in the audit history.
      </p>
      <form action={onSubmit} className="mt-3 space-y-3">
        <input type="hidden" name="id" value={row.id} />
        <textarea name="removal_reason" required placeholder="Reason for removal (required)" rows={2} className={inputClass} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
            Cancel
          </button>
          <button type="submit" disabled={isPending} className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
            Remove Restriction
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ReactivateSuppressionModal({
  row,
  onClose,
  onSubmit,
  isPending,
}: {
  row: DncSuppressionRow;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
  isPending: boolean;
}) {
  return (
    <Modal title="Reactivate Do Not Contact Restriction" onClose={onClose}>
      <p className="text-sm text-slate-600">
        This will re-suppress <span className="font-semibold">{row.business_name || row.contact_name}</span>.
      </p>
      <form action={onSubmit} className="mt-3 space-y-3">
        <input type="hidden" name="id" value={row.id} />
        <textarea name="reason" required placeholder="Reason for reactivating (required)" rows={2} className={inputClass} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
            Cancel
          </button>
          <button type="submit" disabled={isPending} className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
            Reactivate
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ImportCsvModal({ onClose, onImport }: { onClose: () => void; onImport: (formData: FormData) => Promise<void> }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Modal title="Import Do Not Contact CSV" onClose={onClose}>
      <p className="text-sm text-slate-600">
        Columns: Contact Name, Business Name, Phone, Email, Reason, Notes. At least Phone or Email is required per row. Duplicates
        (matching an existing active restriction) are merged, never duplicated.
      </p>
      <form
        action={(formData) => startTransition(() => onImport(formData))}
        className="mt-3 space-y-3"
      >
        <input type="file" name="file" accept=".csv,text/csv" required className={inputClass} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
            Cancel
          </button>
          <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60">
            {isPending ? "Importing…" : "Import"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
