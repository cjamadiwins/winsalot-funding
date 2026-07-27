import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { LeadgenClientRow } from "@/lib/leadgen-types";
import ClientsListClient from "./ClientsListClient";

export default async function LeadgenClientsPage() {
  const admin = getSupabaseAdmin();
  const { data: clients } = await admin.from("leadgen_clients").select("*").order("name");

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
      <p className="mt-1 text-sm text-slate-500">
        Every paying client this CRM manages leads and campaigns for. Each client gets a unique URL slug for their
        future dedicated workspace.
      </p>

      <ClientsListClient clients={(clients ?? []) as LeadgenClientRow[]} />
    </div>
  );
}
