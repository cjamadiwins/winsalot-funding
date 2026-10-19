import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { fetchAllRows } from "./fetch-all-rows";
import { parseDialpadDailyCsv } from "./dialpad-report";
import { listDialpadUserStatisticsCsvs, readDialpadCsvFile } from "./dialpad-csv-source";
import { leadgenDateKey, addDays } from "./leadgen-performance";
import {
  agentKeyFor,
  aggregateCrmCalls,
  buildReconciliationReport,
  mergeDialpadFiles,
  type DialpadFileInput,
  type ReconciliationReport,
} from "./dialpad-reconciliation";

// READ-ONLY. This module only ever calls .select() against the CRMs' call-log
// and user tables and reads the committed Dialpad CSV files. It never writes,
// imports, or "fixes" anything - in particular it does not call
// ensureLatestDialpadReportImported (which the Dialpad Performance page does).
// A test asserts no write call appears in this file or the report components.
//
// It uses the service-role client because the Lead and Growth CRMs have
// separate user pools and RLS boundaries, so neither admin's session can read
// the other CRM's call logs. Callers MUST gate on requireLeadgenAdmin() /
// requireCrmAdmin() before calling.

type UserRow = { id: string; full_name: string | null; email: string; role: string };

export type ReconciliationParams = { agent?: string; campaign?: string; from?: string; to?: string };

export type ReconciliationData = {
  report: ReconciliationReport;
  filters: { agent: string; campaign: string; from: string; to: string };
  options: { agents: { key: string; name: string }[]; campaigns: { id: string; name: string; calls: number }[] };
  skippedFiles: string[];
  generatedAt: string;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function userKey(user: UserRow) {
  const name = user.full_name?.trim();
  return agentKeyFor(name && name.toLowerCase() !== user.email.trim().toLowerCase() ? name : user.email);
}

export async function loadDialpadReconciliation(params: ReconciliationParams): Promise<ReconciliationData> {
  const admin = getSupabaseAdmin();

  const [leadCalls, growthCalls, leadUsers, growthUsers, campaigns, clients] = await Promise.all([
    fetchAllRows<{ agent_id: string; created_at: string; campaign_id: string | null }>((from, to) =>
      admin.from("leadgen_call_logs").select("agent_id, created_at, campaign_id").order("created_at").order("id").range(from, to)
    ),
    fetchAllRows<{ agent_id: string; created_at: string }>((from, to) =>
      admin.from("crm_call_logs").select("agent_id, created_at").order("created_at").order("id").range(from, to)
    ),
    admin.from("leadgen_users").select("id, full_name, email, role"),
    admin.from("crm_users").select("id, full_name, email, role"),
    admin.from("leadgen_campaigns").select("id, name, client_id"),
    admin.from("leadgen_clients").select("id, name"),
  ]);
  for (const result of [leadCalls, growthCalls]) {
    // A truncated read would silently under-report - fail loudly instead.
    if (result.error) throw new Error(`Failed to load call logs: ${result.error.message}`);
  }

  const agentNames = new Map<string, string>();
  const keyByLeadUser = new Map<string, string>();
  const keyByGrowthUser = new Map<string, string>();
  for (const user of (leadUsers.data ?? []) as UserRow[]) {
    const key = userKey(user);
    keyByLeadUser.set(user.id, key);
    if (!agentNames.has(key)) agentNames.set(key, user.full_name?.trim() || user.email);
  }
  for (const user of (growthUsers.data ?? []) as UserRow[]) {
    const key = userKey(user);
    keyByGrowthUser.set(user.id, key);
    if (!agentNames.has(key)) agentNames.set(key, user.full_name?.trim() || user.email);
  }

  const crmCalls = [
    ...aggregateCrmCalls(
      leadCalls.data.map((row) => ({ agentKey: keyByLeadUser.get(row.agent_id) ?? row.agent_id, createdAt: row.created_at, campaignId: row.campaign_id })),
      "lead"
    ),
    ...aggregateCrmCalls(
      growthCalls.data.map((row) => ({ agentKey: keyByGrowthUser.get(row.agent_id) ?? row.agent_id, createdAt: row.created_at, campaignId: null })),
      "growth"
    ),
  ];

  const files: DialpadFileInput[] = [];
  const skippedFiles: string[] = [];
  for (const candidate of listDialpadUserStatisticsCsvs()) {
    try {
      const parsed = parseDialpadDailyCsv(readDialpadCsvFile(candidate.filePath));
      if (parsed.dates.length === 0) throw new Error("no dated rows");
      files.push({ fileName: candidate.fileName, ...parsed });
    } catch {
      skippedFiles.push(candidate.fileName);
    }
  }
  const dialpad = mergeDialpadFiles(files);

  const today = leadgenDateKey(new Date());
  const earliest = [...dialpad.coveredDates, ...crmCalls.map((call) => call.date)].sort()[0] ?? addDays(today, -90);
  let from = params.from && DATE.test(params.from) ? params.from : earliest;
  let to = params.to && DATE.test(params.to) ? params.to : today;
  if (from > to) [from, to] = [to, from];
  const agent = params.agent && params.agent !== "all" ? params.agent : "all";
  const campaign = params.campaign || "all";

  const report = buildReconciliationReport({ dialpad, crmCalls, agentNames, filters: { agentKey: agent, campaign, from, to } });

  const campaignCalls = new Map<string, number>();
  for (const call of crmCalls) if (call.source === "lead" && call.campaignId) campaignCalls.set(call.campaignId, (campaignCalls.get(call.campaignId) ?? 0) + call.count);
  const clientName = new Map(((clients.data ?? []) as { id: string; name: string }[]).map((client) => [client.id, client.name]));
  const campaignOptions = ((campaigns.data ?? []) as { id: string; name: string; client_id: string | null }[])
    .filter((c) => campaignCalls.has(c.id))
    .map((c) => ({ id: c.id, name: `${c.name}${c.client_id && clientName.get(c.client_id) ? ` (${clientName.get(c.client_id)})` : ""}`, calls: campaignCalls.get(c.id) ?? 0 }))
    .sort((a, b) => b.calls - a.calls);

  // Only people who actually have Dialpad or CRM call activity (admin seats excluded).
  const activeKeys = new Set([...crmCalls.map((call) => call.agentKey), ...[...dialpad.days.values()].filter((d) => d.agentRole === "agent").map((d) => d.agentKey)]);
  const agentOptions = [...activeKeys].map((key) => ({ key, name: agentNames.get(key) ?? key })).sort((a, b) => a.name.localeCompare(b.name));

  return {
    report,
    filters: { agent, campaign, from, to },
    options: { agents: agentOptions, campaigns: campaignOptions },
    skippedFiles,
    generatedAt: new Date().toISOString(),
  };
}
