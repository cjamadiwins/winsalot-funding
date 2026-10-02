"use client";

import { useState } from "react";
import { BadgeDollarSign } from "lucide-react";
import { activeServices, type ClientServiceRow } from "@/lib/leadgen-client-services";
import ClientServicesModal from "./ClientServicesModal";

// Compact "View Client Services & Pricing" action. Renders nothing when the
// client has no active entries, so screens for clients without pricing are
// unchanged. Opens the read-only modal; no state is saved anywhere.
export default function ClientServicesButton({ clientName, services, variant = "pill" }: { clientName: string; services: ClientServiceRow[]; variant?: "pill" | "small" }) {
  const [open, setOpen] = useState(false);
  if (activeServices(services).length === 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "small"
            ? "inline-flex items-center gap-1 rounded-full border border-sky-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-50"
            : "inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
        }
      >
        <BadgeDollarSign className={variant === "small" ? "h-3 w-3" : "h-4 w-4"} />
        View Client Services &amp; Pricing
      </button>
      {open && <ClientServicesModal clientName={clientName} services={services} onClose={() => setOpen(false)} />}
    </>
  );
}
