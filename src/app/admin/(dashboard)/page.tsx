import { ClipboardList, Send, Inbox, CheckCircle2, AlertTriangle } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { QuoteRequestRow } from "@/lib/admin-types";
import { isFollowUpOverdue, type CrmFollowUpRow } from "@/lib/crm-types";
import KpiCard from "@/components/crm-ui/KpiCard";
import RequestsTable from "./RequestsTable";

export default async function AdminDashboardPage() {
  const supabase = getSupabaseAdmin();

  const [{ data, error }, { data: statusRows, error: statusError }, { data: followUps, error: followUpsError }] = await Promise.all([
    supabase
      .from("quote_requests")
      .select("id, created_at, full_name, city, cleaning_type, property_type, status")
      .order("created_at", { ascending: false })
      .limit(100),
    // Every request's status, unbounded by the table's 100-row cap above -
    // the KPI cards below need an accurate total across every request, not
    // just the most recently submitted 100.
    supabase.from("quote_requests").select("status"),
    // Same crm_followups source AdminOverdueLeadsPanel already reads from
    // (see /admin/crm/leads) - pending, lead-targeted follow-ups, filtered
    // to overdue with the same isFollowUpOverdue rule, so this count can
    // never disagree with what that panel shows.
    supabase.from("crm_followups").select("scheduled_at, status").eq("status", "pending").not("lead_id", "is", null),
  ]);

  const requests = (data ?? []) as Pick<
    QuoteRequestRow,
    "id" | "created_at" | "full_name" | "city" | "cleaning_type" | "property_type" | "status"
  >[];

  const allStatuses = (statusRows ?? []).map((r) => r.status as string);
  const totalRequests = allStatuses.length;
  const sentToProvider = allStatuses.filter((s) => s === "Sent to Provider").length;
  const awaitingApproval = allStatuses.filter((s) => s === "Awaiting Winsalot Approval").length;
  const approvedQuotes = allStatuses.filter((s) => s === "Approved").length;
  const overdueFollowUps = ((followUps ?? []) as Pick<CrmFollowUpRow, "scheduled_at" | "status">[]).filter(isFollowUpOverdue).length;

  const stats = [
    { label: "Total Requests", value: String(totalRequests), tone: "blue" as const, icon: ClipboardList },
    { label: "Sent to Provider", value: String(sentToProvider), tone: "amber" as const, icon: Send },
    { label: "Awaiting Winsalot Approval", value: String(awaitingApproval), tone: "cyan" as const, icon: Inbox },
    { label: "Approved Quotes", value: String(approvedQuotes), tone: "green" as const, icon: CheckCircle2 },
    { label: "Overdue Follow-ups", value: String(overdueFollowUps), tone: "red" as const, icon: AlertTriangle },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Quote Requests</h1>
      <p className="mt-1 text-sm text-slate-500">
        Requests submitted through the public quote form.
      </p>

      {!statusError && !followUpsError && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((stat) => (
            <KpiCard key={stat.label} label={stat.label} value={stat.value} tone={stat.tone} icon={<stat.icon />} />
          ))}
        </div>
      )}
      {(statusError || followUpsError) && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load dashboard summary: {(statusError ?? followUpsError)?.message}
        </p>
      )}

      {error && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load requests: {error.message}
        </p>
      )}

      {!error && (
        <div className="mt-6">
          <RequestsTable requests={requests} />
        </div>
      )}
    </div>
  );
}
