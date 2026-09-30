import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";

// The friendly, first line of defence for the rule "a test-only client can never
// own production call lists". The database triggers (migration
// 20260930080000_leadgen_test_client_no_production_lists) are the real guarantee -
// they hold for every path including direct SQL - so this only exists to give
// Admin a clear message instead of a raw database error.
// "Test-only" is leadgen_clients.is_internal_test, never the client's name.

export const TEST_CLIENT_LIST_MESSAGE =
  "That client is a test-only client (used only to test the client portal) and can't be assigned production call lists. Choose a real client's campaign.";

export async function isTestOnlyCampaign(campaignId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data: campaign } = await admin.from("leadgen_campaigns").select("client_id").eq("id", campaignId).maybeSingle();
  if (!campaign) return false;
  const { data: client } = await admin.from("leadgen_clients").select("is_internal_test").eq("id", campaign.client_id).maybeSingle();
  return client?.is_internal_test === true;
}

export async function assertProductionCampaign(campaignId: string): Promise<void> {
  if (await isTestOnlyCampaign(campaignId)) throw new Error(TEST_CLIENT_LIST_MESSAGE);
}

// Maps the database trigger's rejection to the same friendly wording.
export function friendlyTestClientError(message: string | undefined | null): string | null {
  return message && /test-only client/i.test(message) ? TEST_CLIENT_LIST_MESSAGE : null;
}
