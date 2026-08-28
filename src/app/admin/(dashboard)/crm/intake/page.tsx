import Link from "next/link";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { CrmIntakeConfigRow } from "@/lib/crm-agreement-types";

export default async function AdminCrmIntakePage() {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: configs } = await supabase.from("crm_intake_configs").select("*").order("created_at", { ascending: false });
  const configRows = (configs ?? []) as CrmIntakeConfigRow[];

  const clientIds = Array.from(new Set(configRows.map((c) => c.client_id)));
  const { data: clients } = clientIds.length > 0 ? await supabase.from("crm_clients").select("id, company_name").in("id", clientIds) : { data: [] };
  const clientNameById = new Map((clients ?? []).map((c) => [c.id as string, c.company_name as string]));

  const configIds = configRows.map((c) => c.id);
  const { data: submissions } = configIds.length > 0 ? await supabase.from("crm_intake_submissions").select("intake_config_id").in("intake_config_id", configIds) : { data: [] };
  const submittedConfigIds = new Set((submissions ?? []).map((s) => s.intake_config_id as string));

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Client Intake</h1>
      <p className="mt-1 text-sm text-slate-500">
        Customize and send each client&apos;s intake form, generated from their signed agreement. Not visible to agents.
      </p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {configRows.map((config) => (
              <tr key={config.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">{clientNameById.get(config.client_id) ?? "Unknown client"}</td>
                <td className="px-4 py-3 text-slate-600">
                  {submittedConfigIds.has(config.id) ? "Received" : config.status === "sent" ? "Sent" : "Draft"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/crm/intake/${config.id}`} className="text-xs font-semibold text-sky-600 hover:text-sky-700">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {configRows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                  No intake forms yet - these are created automatically once an agreement is signed.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
