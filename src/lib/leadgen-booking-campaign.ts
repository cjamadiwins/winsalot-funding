import { isLeadgenBrentsEssentials, LEADGEN_LEAD_CLOSED_STATUSES, type LeadgenClientRow, type LeadgenLeadStatus } from "./leadgen-types";

// Automated bookings (the public /book/[slug] page and the Calendly webhook)
// create appointments, not leads. An appointment's campaign decides which
// agent can see it (agent RLS on leadgen_appointments is campaign-gated), so a
// wrong campaign leaks it to the wrong agent and a missing one hides it from
// the right agent.
//
// The campaign is therefore only ever taken from evidence that is already
// verified in the CRM, never guessed:
//   1. the campaign of the prospect's existing open lead for the same client
//      (matched on exact email) - and only when every matching open lead
//      agrees on that one campaign;
//   2. otherwise the client's only active campaign (the rule the booking page
//      already used), never for Brent's Essentials, which keeps its original
//      behavior of no automatic campaign.
// Anything else stays unassigned (campaign_id null) and surfaces in the Admin
// "Needs campaign review" queue; nothing is assigned to a campaign it might
// not belong to.

export type BookingCampaignSource = "matched_lead" | "sole_active_campaign";
export type BookingCampaignUnresolvedReason = "no_active_campaign" | "ambiguous";

export type BookingCampaignDecision =
  | { campaignId: string; source: BookingCampaignSource }
  | { campaignId: null; reason: BookingCampaignUnresolvedReason };

type CandidateLead = { id: string; status: string; email?: string | null; campaign_id: string | null };
type ClientCampaign = { id: string; status: string };

export function isOpenLeadStatus(status: string): boolean {
  return !LEADGEN_LEAD_CLOSED_STATUSES.includes(status as LeadgenLeadStatus);
}

// Open leads for this prospect, newest first (callers pass them already
// scoped to the client and ordered). An exact, case-insensitive email match is
// required: SQL ILIKE treats `_` and `%` in an address as wildcards, which must
// never be allowed to pick a different prospect's lead.
export function openLeadsForEmail<T extends CandidateLead>(leadsNewestFirst: readonly T[], email: string | null | undefined): T[] {
  const wanted = (email ?? "").trim().toLowerCase();
  if (!wanted) return [];
  return leadsNewestFirst.filter((lead) => (lead.email ?? "").trim().toLowerCase() === wanted && isOpenLeadStatus(lead.status));
}

export function decideBookingCampaign(input: {
  client: Pick<LeadgenClientRow, "name" | "slug">;
  openLeads: readonly Pick<CandidateLead, "campaign_id">[];
  clientCampaigns: readonly ClientCampaign[];
}): BookingCampaignDecision {
  const { client, openLeads, clientCampaigns } = input;
  const clientCampaignIds = new Set(clientCampaigns.map((c) => c.id));

  if (openLeads.length > 0) {
    const distinct = new Set(openLeads.map((lead) => lead.campaign_id ?? null));
    if (distinct.size > 1) return { campaignId: null, reason: "ambiguous" };
    const [only] = [...distinct];
    // The lead's campaign must belong to this client; a mismatch is not evidence.
    if (only && clientCampaignIds.has(only)) return { campaignId: only, source: "matched_lead" };
    if (only) return { campaignId: null, reason: "ambiguous" };
    // The only matching lead has no campaign (legacy row): fall through.
  }

  if (!isLeadgenBrentsEssentials({ name: client.name, slug: client.slug })) {
    const active = clientCampaigns.filter((c) => c.status === "active");
    if (active.length === 1) return { campaignId: active[0].id, source: "sole_active_campaign" };
    if (active.length === 0) return { campaignId: null, reason: "no_active_campaign" };
  }
  return { campaignId: null, reason: "ambiguous" };
}

// "Needs campaign review" queue membership: an upcoming, still-booked
// appointment with no campaign. Past appointments are deliberately excluded so
// historical records (and their clients) are never pulled into the queue.
export function appointmentNeedsCampaignReview(
  appointment: { status: string; campaign_id: string | null; appointment_date: string },
  todayYmd: string
): boolean {
  return appointment.status === "Booked" && !appointment.campaign_id && appointment.appointment_date >= todayYmd;
}

// The slice of the service-role client this needs (keeps the module free of the
// server-only admin import so it is easy to test).
type Query = PromiseLike<{ data: unknown }> & {
  eq: (column: string, value: string) => Query;
  ilike: (column: string, pattern: string) => Query;
  order: (column: string, options: { ascending: boolean }) => Query;
};
type ReadClient = { from: (table: string) => { select: (columns: string) => Query } };

export type ResolvedBooking = {
  // Most recent open lead for this prospect (existing linking behavior), if any.
  matchedLeadId: string | null;
  decision: BookingCampaignDecision;
};

export async function resolveBookingCampaign(
  adminClient: object,
  client: Pick<LeadgenClientRow, "id" | "name" | "slug">,
  prospectEmail: string | null | undefined
): Promise<ResolvedBooking> {
  const admin = adminClient as unknown as ReadClient;
  const email = (prospectEmail ?? "").trim();

  const leadsResult = email
    ? await admin.from("leadgen_leads").select("id, status, email, campaign_id").eq("client_id", client.id).ilike("email", email).order("created_at", { ascending: false })
    : { data: [] };
  const campaignsResult = await admin.from("leadgen_campaigns").select("id, status").eq("client_id", client.id);

  const openLeads = openLeadsForEmail((leadsResult.data ?? []) as CandidateLead[], email);
  const decision = decideBookingCampaign({
    client,
    openLeads,
    clientCampaigns: (campaignsResult.data ?? []) as ClientCampaign[],
  });
  return { matchedLeadId: openLeads[0]?.id ?? null, decision };
}
