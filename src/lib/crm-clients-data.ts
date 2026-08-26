import "server-only";
import type { createSupabaseServerClient } from "./supabase-server";
import type {
  AgentVisibleClientRow,
  ClientRelatedCounts,
  CrmClientAgentWithUser,
  CrmClientAppointmentWithAgent,
  CrmClientRow,
  CrmPaymentRow,
} from "./crm-clients-types";
import type { CrmInvoiceRow } from "./crm-invoices-types";
import type { CrmActivityRow } from "./crm-types";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type ClientListFilters = {
  search?: string;
  status?: string;
  service?: string;
  assignedAgentId?: string;
};

export type ClientListRow = CrmClientRow & {
  assignedAgentNames: string[];
  invoiceCount: number;
  outstandingBalance: number;
};

// Powers the admin Clients list: search/filter plus a couple of derived
// summary figures (assigned agent names, outstanding balance) so the
// table doesn't need a second round trip per row. Filtering by
// assignedAgentId is done via a separate crm_client_agents lookup first
// (rather than a nested filter) since PostgREST can't filter a parent
// row by a condition on its child join in one query.
export async function fetchClientList(supabase: SupabaseClient, filters: ClientListFilters): Promise<{ data: ClientListRow[]; error: string | null }> {
  let clientIdsForAgent: string[] | null = null;
  if (filters.assignedAgentId) {
    const { data: assignments, error: assignError } = await supabase
      .from("crm_client_agents")
      .select("client_id")
      .eq("agent_id", filters.assignedAgentId);
    if (assignError) return { data: [], error: assignError.message };
    clientIdsForAgent = (assignments ?? []).map((a) => a.client_id as string);
    if (clientIdsForAgent.length === 0) return { data: [], error: null };
  }

  let query = supabase.from("crm_clients").select("*").order("company_name");
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.service) query = query.ilike("service", `%${filters.service}%`);
  if (filters.search) {
    query = query.or(`company_name.ilike.%${filters.search}%,primary_contact_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
  }
  if (clientIdsForAgent) query = query.in("id", clientIdsForAgent);

  const { data: clients, error } = await query;
  if (error) return { data: [], error: error.message };
  const rows = (clients ?? []) as CrmClientRow[];
  if (rows.length === 0) return { data: [], error: null };

  const clientIds = rows.map((c) => c.id);
  const [{ data: agentLinks }, { data: invoices }] = await Promise.all([
    supabase.from("crm_client_agents").select("client_id, crm_users(full_name, email)").in("client_id", clientIds),
    supabase.from("crm_invoices").select("client_id, balance, status").in("client_id", clientIds),
  ]);

  const agentNamesByClient = new Map<string, string[]>();
  for (const link of (agentLinks ?? []) as unknown as { client_id: string; crm_users: { full_name: string; email: string } | null }[]) {
    const list = agentNamesByClient.get(link.client_id) ?? [];
    list.push(link.crm_users?.full_name || link.crm_users?.email || "Unknown agent");
    agentNamesByClient.set(link.client_id, list);
  }

  const invoiceCountByClient = new Map<string, number>();
  const balanceByClient = new Map<string, number>();
  for (const inv of (invoices ?? []) as { client_id: string; balance: number; status: string }[]) {
    invoiceCountByClient.set(inv.client_id, (invoiceCountByClient.get(inv.client_id) ?? 0) + 1);
    if (inv.status !== "Cancelled" && inv.status !== "Archived" && inv.status !== "Draft") {
      balanceByClient.set(inv.client_id, (balanceByClient.get(inv.client_id) ?? 0) + Number(inv.balance));
    }
  }

  return {
    data: rows.map((c) => ({
      ...c,
      assignedAgentNames: agentNamesByClient.get(c.id) ?? [],
      invoiceCount: invoiceCountByClient.get(c.id) ?? 0,
      outstandingBalance: balanceByClient.get(c.id) ?? 0,
    })),
    error: null,
  };
}

export type ClientDetail = {
  client: CrmClientRow;
  assignedAgents: CrmClientAgentWithUser[];
  appointments: CrmClientAppointmentWithAgent[];
  invoices: CrmInvoiceRow[];
  payments: CrmPaymentRow[];
  activities: CrmActivityRow[];
};

// Everything the client-profile page needs, in parallel - "connect
// invoices, appointments, assigned agents, ... payment history to the
// appropriate client" is exactly this join set.
export async function fetchClientDetail(supabase: SupabaseClient, clientId: string): Promise<{ data: ClientDetail | null; error: string | null }> {
  const { data: client, error: clientError } = await supabase.from("crm_clients").select("*").eq("id", clientId).maybeSingle();
  if (clientError) return { data: null, error: clientError.message };
  if (!client) return { data: null, error: "Client not found." };

  const [{ data: assignedAgents }, { data: appointments }, { data: invoices }, { data: payments }, { data: activities }] = await Promise.all([
    supabase.from("crm_client_agents").select("*, crm_users(id, full_name, email)").eq("client_id", clientId),
    supabase
      .from("crm_client_appointments")
      .select("*, crm_users(full_name, email)")
      .eq("client_id", clientId)
      .order("appointment_date", { ascending: false }),
    supabase.from("crm_invoices").select("*").eq("client_id", clientId).order("issue_date", { ascending: false }),
    supabase.from("crm_payments").select("*").eq("client_id", clientId).order("payment_date", { ascending: false }),
    supabase.from("crm_activities").select("*").eq("client_id", clientId).order("occurred_at", { ascending: false }),
  ]);

  return {
    data: {
      client: client as CrmClientRow,
      assignedAgents: (assignedAgents ?? []) as CrmClientAgentWithUser[],
      appointments: (appointments ?? []) as CrmClientAppointmentWithAgent[],
      invoices: (invoices ?? []) as CrmInvoiceRow[],
      payments: (payments ?? []) as CrmPaymentRow[],
      activities: (activities ?? []) as CrmActivityRow[],
    },
    error: null,
  };
}

// See ClientRelatedCounts' own comment (crm-clients-types.ts) for why
// these five counts are exactly what gates a permanent delete.
export async function fetchClientRelatedCounts(supabase: SupabaseClient, clientId: string): Promise<ClientRelatedCounts> {
  const [appointments, invoices, payments, assignedAgents, activities] = await Promise.all([
    supabase.from("crm_client_appointments").select("id", { count: "exact", head: true }).eq("client_id", clientId),
    supabase.from("crm_invoices").select("id", { count: "exact", head: true }).eq("client_id", clientId),
    supabase.from("crm_payments").select("id", { count: "exact", head: true }).eq("client_id", clientId),
    supabase.from("crm_client_agents").select("client_id", { count: "exact", head: true }).eq("client_id", clientId),
    supabase.from("crm_activities").select("id", { count: "exact", head: true }).eq("client_id", clientId),
  ]);

  return {
    appointments: appointments.count ?? 0,
    invoices: invoices.count ?? 0,
    payments: payments.count ?? 0,
    assignedAgents: assignedAgents.count ?? 0,
    activities: activities.count ?? 0,
  };
}

// The sole agent-facing read: crm_agent_visible_clients() (SECURITY
// DEFINER RPC, migration 0091) structurally excludes every financial
// column - see that function's definition. Called through the caller's
// own session client so auth.uid() resolves to the signed-in agent.
export async function fetchAgentVisibleClients(supabase: SupabaseClient): Promise<{ data: AgentVisibleClientRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc("crm_agent_visible_clients");
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as AgentVisibleClientRow[], error: null };
}
