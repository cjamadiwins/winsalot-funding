"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizeServiceInput, sortServices, type ClientServiceRow, type ServiceFormInput } from "@/lib/leadgen-client-services";

// Products, Services & Pricing - Admin-only writes. `authenticated` has no write
// grant on these tables (migration 20261002030000), so every change goes through
// these actions with the service-role client AFTER requireLeadgenAdmin() - an
// agent session can neither call them successfully nor write the table directly.
// Every action is scoped to the client id it is given and checks the service
// belongs to that client, so one client's entries can never be edited through
// another client's page. There is deliberately no delete: services are
// deactivated (archived), and the history trigger records every change.

type ActionResult = { error?: string; message?: string };

function revalidate(clientId: string) {
  revalidatePath(`/leadgen/admin/clients/${clientId}`);
}

async function loadClientServices(clientId: string): Promise<ClientServiceRow[]> {
  const { data } = await getSupabaseAdmin().from("leadgen_client_services").select("*").eq("client_id", clientId);
  return sortServices((data ?? []) as ClientServiceRow[]);
}

export async function saveClientServiceAction(clientId: string, serviceId: string | null, input: ServiceFormInput): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  const admin = getSupabaseAdmin();

  const parsed = normalizeServiceInput(input);
  if ("error" in parsed) return { error: parsed.error };

  const { data: client } = await admin.from("leadgen_clients").select("id").eq("id", clientId).maybeSingle();
  if (!client) return { error: "Client not found." };

  const now = new Date().toISOString();
  if (serviceId) {
    const { data: existing } = await admin.from("leadgen_client_services").select("id").eq("id", serviceId).eq("client_id", clientId).maybeSingle();
    if (!existing) return { error: "That entry doesn't belong to this client." };
    const { error } = await admin
      .from("leadgen_client_services")
      .update({ ...parsed.value, updated_at: now, updated_by: adminUser.id })
      .eq("id", serviceId)
      .eq("client_id", clientId);
    if (error) return { error: error.code === "23505" ? "This client already has an entry with that name." : "Failed to save the entry." };
    revalidate(clientId);
    return { message: "Saved." };
  }

  const existing = await loadClientServices(clientId);
  const nextOrder = existing.reduce((max, row) => Math.max(max, row.sort_order), 0) + 10;
  const { error } = await admin
    .from("leadgen_client_services")
    .insert({ client_id: clientId, ...parsed.value, sort_order: nextOrder, created_by: adminUser.id, updated_by: adminUser.id, updated_at: now });
  if (error) return { error: error.code === "23505" ? "This client already has an entry with that name." : "Failed to add the entry." };
  revalidate(clientId);
  return { message: "Added." };
}

export async function setClientServiceActiveAction(clientId: string, serviceId: string, active: boolean): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  const admin = getSupabaseAdmin();
  const { data: existing } = await admin.from("leadgen_client_services").select("id").eq("id", serviceId).eq("client_id", clientId).maybeSingle();
  if (!existing) return { error: "That entry doesn't belong to this client." };
  const { error } = await admin
    .from("leadgen_client_services")
    .update({ is_active: active, updated_at: new Date().toISOString(), updated_by: adminUser.id })
    .eq("id", serviceId)
    .eq("client_id", clientId);
  if (error) return { error: "Failed to update the entry." };
  revalidate(clientId);
  return { message: active ? "Reactivated." : "Deactivated." };
}

// Moves one entry up or down within THIS client's list. Orders are normalised to
// 10, 20, 30… first so ties never make a move a no-op.
export async function moveClientServiceAction(clientId: string, serviceId: string, direction: "up" | "down"): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  const admin = getSupabaseAdmin();
  const rows = await loadClientServices(clientId);
  const index = rows.findIndex((row) => row.id === serviceId);
  if (index === -1) return { error: "That entry doesn't belong to this client." };
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= rows.length) return {};

  const reordered = [...rows];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  const now = new Date().toISOString();
  for (let i = 0; i < reordered.length; i += 1) {
    const order = (i + 1) * 10;
    if (reordered[i].sort_order === order) continue;
    const { error } = await admin
      .from("leadgen_client_services")
      .update({ sort_order: order, updated_at: now, updated_by: adminUser.id })
      .eq("id", reordered[i].id)
      .eq("client_id", clientId);
    if (error) return { error: "Failed to reorder." };
  }
  revalidate(clientId);
  return {};
}
