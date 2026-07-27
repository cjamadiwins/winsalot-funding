"use client";

import { useState } from "react";
import Modal from "./Modal";
import {
  PROVIDER_INTAKE_EMAIL_SUBJECT,
  PROVIDER_INTAKE_URL,
  buildProviderIntakeEmailText,
} from "@/lib/provider-intake-content";
import type { ProviderLeadRow } from "@/lib/provider-types";

// Shared by both /agent/provider-acquisition/[id] and
// /admin/crm/provider-acquisition/[id] - the "Send Intake Form"
// confirmation window from brief section 5: shows the provider business
// name, contact person, recipient email, subject, message, and the intake
// form link before anything is actually sent, so the agent/admin can
// review it first.
export default function SendProviderIntakeModal({
  provider,
  isPending,
  sendAction,
  onClose,
  onSent,
}: {
  provider: Pick<ProviderLeadRow, "id" | "business_name" | "contact_person" | "email">;
  isPending: boolean;
  sendAction: (providerId: string) => Promise<{ error?: string; email?: string }>;
  onClose: () => void;
  onSent: (email: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contactName = provider.contact_person || provider.business_name;
  const message = buildProviderIntakeEmailText(contactName);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    const result = await sendAction(provider.id);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSent(result.email ?? provider.email ?? "");
    onClose();
  }

  return (
    <Modal title="Send Intake Form" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <Row label="Provider Business Name" value={provider.business_name} />
        <Row label="Contact Person" value={provider.contact_person || "—"} />
        <Row label="Recipient Email Address" value={provider.email || "—"} />
        <Row label="Email Subject" value={PROVIDER_INTAKE_EMAIL_SUBJECT} />
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Email Message
          </div>
          <pre className="mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            {message}
          </pre>
        </div>
        <Row label="Intake Form Link" value={PROVIDER_INTAKE_URL} />

        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            disabled={submitting || isPending || !provider.email}
            onClick={handleConfirm}
            className="rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Sending…" : "Send Intake Form"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-sm font-semibold text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
        {!provider.email && (
          <p className="text-xs text-rose-600">Add an email address for this provider before sending.</p>
        )}
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-slate-900">{value}</div>
    </div>
  );
}
