"use client";

import { useState } from "react";
import { ShieldOff } from "lucide-react";
import LargeModal from "./LargeModal";
import DoNotContactAdminClient, { type DoNotContactAdminActions } from "./DoNotContactAdminClient";
import type { DncSuppressionRow } from "@/lib/dnc-types";

// Dashboard entry point for the Do Not Contact system (Item 4's admin
// management view) - same "click a card, open a large centered modal
// without leaving the dashboard" treatment as Opportunity Finder's own
// dashboard trigger (OpportunityFinderModalTrigger), used instead of a
// standalone page precisely because the brief now asks to "not create a
// large separate management page unless technically required" and to
// "prefer the existing CRM pop-up/modal design." Rendered once on each
// CRM's main admin dashboard (Growth: /admin/crm, Lead Gen: /leadgen/admin).
export default function DoNotContactModalTrigger({
  rows,
  exportHref,
  actions,
}: {
  rows: DncSuppressionRow[];
  // Admin-only CSV export - omitted for the agent-facing trigger (see the
  // agent dashboards), which also adjusts the card/modal copy below since
  // an agent can search/view/add but never "manage" the list.
  exportHref?: string;
  actions: DoNotContactAdminActions;
}) {
  const [open, setOpen] = useState(false);
  const activeCount = rows.filter((row) => row.status === "active").length;
  const canManage = Boolean(exportHref || actions.removeSuppression);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 flex w-full items-center justify-between gap-4 rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 p-5 text-left shadow-sm transition hover:border-red-300 hover:shadow-md"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-xl bg-red-600 p-2.5 text-white">
            <ShieldOff className="h-5 w-5" />
          </span>
          <div>
            <div className="text-[16px] font-bold text-slate-900">Do Not Contact List</div>
            <div className="mt-0.5 text-[12.5px] text-slate-600">
              {canManage ? "Shared with both CRMs — search, manage, and export restrictions." : "Shared with both CRMs — search and add restrictions."}
            </div>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 text-[12px] font-bold text-white">
          {activeCount} Active
        </span>
      </button>

      <LargeModal
        open={open}
        onClose={() => setOpen(false)}
        title="Do Not Contact List"
        subtitle={
          canManage
            ? "Shared across the Lead Generation CRM and Growth CRM — a restriction added in either CRM is recognized in both."
            : "Shared across the Lead Generation CRM and Growth CRM — a restriction you add here is recognized in both immediately. Only an admin can remove or reactivate one."
        }
        maxWidthClassName="max-w-7xl"
        footer={
          <>
            <span className="text-[12px] text-slate-500">{rows.length} record{rows.length === 1 ? "" : "s"} total</span>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-slate-900 px-4 py-2 text-[12.5px] font-semibold text-white">
              Close
            </button>
          </>
        }
      >
        <DoNotContactAdminClient rows={rows} exportHref={exportHref} actions={actions} />
      </LargeModal>
    </>
  );
}
