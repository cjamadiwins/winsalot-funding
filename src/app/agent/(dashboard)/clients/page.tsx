import { requireCrmUser } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { fetchAgentVisibleClients } from "@/lib/crm-clients-data";

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// Agent-side "My Clients" - the only client data agents can ever see,
// sourced entirely through crm_agent_visible_clients() (a SECURITY
// DEFINER RPC, migration 0091) so this page structurally can never
// render pricing, invoices, payments, revenue, balances, or any other
// financial detail - that RPC's own SELECT list simply never returns
// those columns, no matter what this page does with the result.
export default async function AgentClientsPage() {
  await requireCrmUser();
  const supabase = await createSupabaseServerClient();
  const { data: clients, error } = await fetchAgentVisibleClients(supabase);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">My Clients</h1>
      <p className="mt-1 text-sm text-slate-500">Active clients currently assigned to you.</p>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load your clients: {error}
        </p>
      )}

      {!error && (
        <div className="mt-6 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)]">
          <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Primary Contact</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Start Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {clients.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-[var(--color-text-muted)]">
                    No active clients are currently assigned to you.
                  </td>
                </tr>
              )}
              {clients.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-medium text-[var(--color-ink-strong)]">{c.company_name}</td>
                  <td className="px-4 py-3">{c.primary_contact_name || "-"}</td>
                  <td className="px-4 py-3">{c.service || "-"}</td>
                  <td className="px-4 py-3">{formatDate(c.start_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
