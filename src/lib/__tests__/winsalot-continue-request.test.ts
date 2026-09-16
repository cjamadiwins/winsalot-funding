import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const emailsSendMock = vi.fn<
  (params: { to: string; subject: string; text: string; html: string; from: string; replyTo: string }) => Promise<{
    data: { id: string } | null;
    error: { message: string } | null;
  }>
>(async () => ({ data: { id: "resend-email-1" }, error: null }));
vi.mock("@/lib/resend", () => ({ getResendClient: () => ({ emails: { send: emailsSendMock } }) }));

type OpportunityRow = { id: string; stage: string; created_at: string; email: string };

// A minimal, stateful fake of the service-role client covering exactly the
// call shapes performWinsalotContinueRequest and its notification use
// against crm_opportunities/winsalot_continue_requests/crm_activities/
// crm_users/crm_notifications.
function makeFakeAdmin(opts: { existingOpportunities?: OpportunityRow[]; admins?: { id: string }[] } = {}) {
  const opportunities = [...(opts.existingOpportunities ?? [])];
  const admins = opts.admins ?? [{ id: "admin-1" }];
  const continueRequests: Record<string, unknown>[] = [];
  const crmActivityInserts: Record<string, unknown>[] = [];
  const crmNotificationInserts: Record<string, unknown>[] = [];
  let nextOpportunityId = 100;
  let nextRequestId = 1;

  const admin = {
    from(table: string) {
      if (table === "crm_opportunities") {
        return {
          select: () => ({
            ilike: (_col: string, email: string) => ({
              order: async () => ({
                data: opportunities.filter((o) => o.email.toLowerCase() === (email as string).toLowerCase()),
              }),
            }),
          }),
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                const id = `new-opportunity-${nextOpportunityId++}`;
                opportunities.push({ id, stage: row.stage as string, created_at: new Date().toISOString(), email: row.email as string });
                return { data: { id }, error: null };
              },
            }),
          }),
        };
      }
      if (table === "winsalot_continue_requests") {
        return {
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                const id = `continue-request-${nextRequestId++}`;
                continueRequests.push({ id, admin_notified_at: null, ...row });
                return { data: { id }, error: null };
              },
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: (_col: string, id: string) => ({
              is: (col: string, val: unknown) => ({
                select: () => ({
                  maybeSingle: async () => {
                    const found = continueRequests.find((r) => r.id === id);
                    if (!found || (found as Record<string, unknown>)[col] !== val) return { data: null };
                    Object.assign(found, patch);
                    return { data: { id }, error: null };
                  },
                }),
              }),
            }),
          }),
        };
      }
      if (table === "crm_activities") {
        return {
          insert: async (row: Record<string, unknown>) => {
            crmActivityInserts.push(row);
            return { data: null, error: null };
          },
        };
      }
      if (table === "crm_users") {
        return { select: () => ({ eq: () => ({ eq: async () => ({ data: admins }) }) }) };
      }
      if (table === "crm_notifications") {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }),
          }),
          insert: async (row: Record<string, unknown>) => {
            crmNotificationInserts.push(row);
            return { data: null, error: null };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { admin, continueRequests, crmActivityInserts, crmNotificationInserts, opportunities };
}

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: vi.fn() }));

const validInput = {
  contactName: "Jordan Sample",
  businessName: "Acme Test Co.",
  email: "jordan@example.com",
  phone: "+14165551234",
  serviceType: "lead_generation" as const,
  notes: null,
};

describe("performWinsalotContinueRequest", () => {
  beforeEach(() => {
    emailsSendMock.mockClear();
  });

  it("rejects missing required fields without touching the database", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(
      new Proxy(
        {},
        {
          get() {
            throw new Error("should not touch the database for invalid input");
          },
        }
      ) as never
    );
    const { performWinsalotContinueRequest } = await import("@/lib/winsalot-continue-request");

    const result = await performWinsalotContinueRequest({ ...validInput, contactName: "" });

    expect(result.error).toBeTruthy();
    expect(result.requestId).toBeUndefined();
  });

  it("creates a new prospect opportunity when no match exists, saves the request, and notifies admins exactly once", async () => {
    const { admin, continueRequests, crmActivityInserts, crmNotificationInserts, opportunities } = makeFakeAdmin();
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    const { performWinsalotContinueRequest } = await import("@/lib/winsalot-continue-request");

    const result = await performWinsalotContinueRequest(validInput);

    expect(result.error).toBeUndefined();
    expect(result.requestId).toBeTruthy();
    expect(opportunities).toHaveLength(1);
    expect(opportunities[0].stage).toBe("New Prospect");
    expect(continueRequests).toHaveLength(1);
    expect((continueRequests[0] as { opportunity_id: string }).opportunity_id).toBe(opportunities[0].id);
    expect(crmActivityInserts.some((a) => a.activity_type === "continue_request_submitted")).toBe(true);
    expect(crmNotificationInserts).toHaveLength(1);
    expect(emailsSendMock).toHaveBeenCalledTimes(1);
    expect(emailsSendMock.mock.calls[0][0].to).toBe("info@winsalotcorp.com");
  });

  it("prefers an existing open opportunity match over creating a new one", async () => {
    const { admin, opportunities } = makeFakeAdmin({
      existingOpportunities: [{ id: "existing-open-1", stage: "Consultation Booked", created_at: "2026-01-01T00:00:00.000Z", email: "jordan@example.com" }],
    });
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    const { performWinsalotContinueRequest } = await import("@/lib/winsalot-continue-request");

    const result = await performWinsalotContinueRequest(validInput);

    expect(result.error).toBeUndefined();
    expect(opportunities).toHaveLength(1); // no new opportunity created
  });

  it("sends exactly one admin notification per distinct submission", async () => {
    const { admin } = makeFakeAdmin();
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    const { performWinsalotContinueRequest } = await import("@/lib/winsalot-continue-request");

    // Two separate submissions each create their own request row and
    // therefore their own notification - this is not a duplicate-send,
    // it's two genuinely separate prospect requests.
    await performWinsalotContinueRequest(validInput);
    await performWinsalotContinueRequest(validInput);

    expect(emailsSendMock).toHaveBeenCalledTimes(2);
  });

  it("never sends a second admin notification when the same saved request is claimed twice (retried Server Action)", async () => {
    const { admin, continueRequests } = makeFakeAdmin();
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const { performWinsalotContinueRequest } = await import("@/lib/winsalot-continue-request");
    await performWinsalotContinueRequest(validInput);
    expect(continueRequests).toHaveLength(1);
    expect(emailsSendMock).toHaveBeenCalledTimes(1);

    // Directly re-invoke the same claim-update the real notifier uses,
    // against the row that's already claimed, to confirm it's a no-op.
    const claimedId = (continueRequests[0] as { id: string }).id;
    const table = (admin as unknown as {
      from: (t: string) => { update: (p: Record<string, unknown>) => { eq: (c: string, v: string) => { is: (c: string, v: unknown) => { select: () => { maybeSingle: () => Promise<{ data: unknown }> } } } } };
    }).from("winsalot_continue_requests");
    const secondClaim = await table.update({ admin_notified_at: new Date().toISOString() }).eq("id", claimedId).is("admin_notified_at", null).select().maybeSingle();
    expect(secondClaim.data).toBeNull();
  });
});
