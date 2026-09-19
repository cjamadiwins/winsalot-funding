"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";
import {
  CALL_LIST_REQUIRED_FIELDS,
  CALL_LIST_TARGET_FIELDS,
  CALL_LIST_TARGET_FIELD_LABELS,
  type CallListTargetField,
} from "@/lib/call-list-column-mapping";

type SheetTab = { title: string; gid: number };

type LoadTabsResult = { error: string } | { spreadsheetId: string; spreadsheetTitle: string; tabs: SheetTab[] };
type LoadPreviewResult =
  | { error: string }
  | { headers: string[]; suggestedMapping: Record<CallListTargetField, string | null>; sampleRowCount: number };

type CreateSegmentInput = {
  name: string;
  serviceFieldValue: string;
  agentIds: string[];
  connectionId: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheetTabName: string;
  sheetTabGid: number;
  columnMapping: Partial<Record<CallListTargetField, string>>;
};

// Shared wizard for both CRMs' "New Call List Segment" pages. The only
// per-CRM differences (opportunity type vs. campaign, and which agent/
// connection lists to offer) are pushed up into props by each CRM's own
// Server Component page, so this file has no crm-specific branching.
export default function NewSegmentClient({
  listHref,
  connectOAuthHref,
  initialConnectionId,
  connectError,
  connections,
  agents,
  typeOptions,
  typeFieldLabel,
  loadSheetTabsAction,
  loadSheetPreviewAction,
  createSegmentAction,
}: {
  listHref: string;
  connectOAuthHref: string;
  initialConnectionId?: string;
  connectError?: string;
  connections: { id: string; googleEmail: string }[];
  agents: { id: string; name: string }[];
  typeOptions: { value: string; label: string }[];
  typeFieldLabel: string;
  loadSheetTabsAction: (input: { connectionId: string; sheetUrl: string }) => Promise<LoadTabsResult>;
  loadSheetPreviewAction: (input: { connectionId: string; spreadsheetId: string; sheetTitle: string }) => Promise<LoadPreviewResult>;
  createSegmentAction: (input: CreateSegmentInput) => Promise<{ error: string } | void>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(connectError ?? null);

  const [name, setName] = useState("");
  const [serviceFieldValue, setServiceFieldValue] = useState(typeOptions[0]?.value ?? "");
  const [agentIds, setAgentIds] = useState<string[]>([]);

  const [connectionId, setConnectionId] = useState<string>(initialConnectionId ?? connections[0]?.id ?? "");
  const [sheetUrl, setSheetUrl] = useState("");
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [tabs, setTabs] = useState<SheetTab[] | null>(null);
  const [selectedTab, setSelectedTab] = useState<SheetTab | null>(null);
  const [headers, setHeaders] = useState<string[] | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<CallListTargetField, string>>>({});

  function toggleAgent(id: string) {
    setAgentIds((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  }

  function handleLoadTabs() {
    if (!connectionId) {
      setError("Connect a Google account first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await loadSheetTabsAction({ connectionId, sheetUrl });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSpreadsheetId(result.spreadsheetId);
      setTabs(result.tabs);
      setSelectedTab(null);
      setHeaders(null);
    });
  }

  function handleSelectTab(tab: SheetTab) {
    if (!spreadsheetId) return;
    setError(null);
    setSelectedTab(tab);
    startTransition(async () => {
      const result = await loadSheetPreviewAction({ connectionId, spreadsheetId, sheetTitle: tab.title });
      if ("error" in result) {
        setError(result.error);
        setSelectedTab(null);
        return;
      }
      setHeaders(result.headers);
      const nextMapping: Partial<Record<CallListTargetField, string>> = {};
      for (const field of CALL_LIST_TARGET_FIELDS) {
        const guess = result.suggestedMapping[field];
        if (guess) nextMapping[field] = guess;
      }
      setMapping(nextMapping);
    });
  }

  function handleCreate() {
    if (!spreadsheetId || !selectedTab) return;
    setError(null);
    startTransition(async () => {
      const result = await createSegmentAction({
        name,
        serviceFieldValue,
        agentIds,
        connectionId,
        spreadsheetId,
        spreadsheetUrl: sheetUrl,
        sheetTabName: selectedTab.title,
        sheetTabGid: selectedTab.gid,
        columnMapping: mapping,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.push(listHref);
    });
  }

  const canCreate = name.trim().length > 0 && !!selectedTab && !!mapping.business_name;

  return (
    <div className="space-y-6">
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {/* Step 1: segment basics */}
      <section className="rounded-xl border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-900">1. Segment details</h2>
        <div className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Segment name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Toronto Roofers – Q3"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">{typeFieldLabel}</span>
            <select
              value={serviceFieldValue}
              onChange={(e) => setServiceFieldValue(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {typeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <div className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Assigned agent(s)</span>
            <div className="flex flex-wrap gap-2">
              {agents.length === 0 && <span className="text-slate-500">No active agents to assign.</span>}
              {agents.map((agent) => (
                <label
                  key={agent.id}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-[12.5px] ${
                    agentIds.includes(agent.id) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"
                  }`}
                >
                  <input type="checkbox" className="hidden" checked={agentIds.includes(agent.id)} onChange={() => toggleAgent(agent.id)} />
                  {agent.name}
                </label>
              ))}
            </div>
            <p className="mt-1 text-[11.5px] text-slate-500">New leads synced into this segment are split round-robin across the agents selected here.</p>
          </div>
        </div>
      </section>

      {/* Step 2: connect Google */}
      <section className="rounded-xl border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-900">2. Connect Google Sheet</h2>
        <div className="mt-3 space-y-3">
          {connections.length > 0 && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Use an existing connection</span>
              <select value={connectionId} onChange={(e) => setConnectionId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.googleEmail}
                  </option>
                ))}
              </select>
            </label>
          )}
          <a
            href={connectOAuthHref}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-400"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {connections.length > 0 ? "Connect a different Google account" : "Connect Google account"}
          </a>

          {connectionId && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Google Sheet URL</span>
              <div className="flex gap-2">
                <input
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={isPending || !sheetUrl}
                  onClick={handleLoadTabs}
                  className="whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Load tabs
                </button>
              </div>
            </label>
          )}

          {tabs && tabs.length > 0 && (
            <div className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Sheet tab</span>
              <div className="flex flex-wrap gap-2">
                {tabs.map((tab) => (
                  <button
                    type="button"
                    key={tab.gid}
                    onClick={() => handleSelectTab(tab)}
                    className={`rounded-full border px-3 py-1 text-[12.5px] ${
                      selectedTab?.gid === tab.gid ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"
                    }`}
                  >
                    {tab.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Step 3: column mapping */}
      {headers && (
        <section className="rounded-xl border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-900">3. Confirm column mapping</h2>
          <p className="mt-1 text-[12.5px] text-slate-500">Business Name is required so leads can be matched and deduplicated. Leave a field unmapped to skip it.</p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CALL_LIST_TARGET_FIELDS.map((field) => (
              <label key={field} className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">
                  {CALL_LIST_TARGET_FIELD_LABELS[field]}
                  {CALL_LIST_REQUIRED_FIELDS.includes(field) && <span className="text-rose-600"> *</span>}
                </span>
                <select
                  value={mapping[field] ?? ""}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [field]: e.target.value || undefined }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">— Not mapped —</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={isPending || !canCreate}
          onClick={handleCreate}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Creating…" : "Create Segment"}
        </button>
      </div>
    </div>
  );
}
