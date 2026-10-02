import { beforeEach, describe, expect, it, vi } from "vitest";

// sendLeadgenEmail's own record keeping for the Email Client notification:
// the reason is stored, a Resend failure is saved as "failed" (never "sent"),
// and non-notification sends insert exactly what they always did.

const sendMock = vi.fn();
vi.mock("@/lib/resend", () => ({ getResendClient: () => ({ emails: { send: sendMock } }) }));

const adminUpdates: Record<string, unknown>[] = [];
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      update: (values: Record<string, unknown>) => {
        adminUpdates.push(values);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  }),
}));

import { sendLeadgenEmail } from "@/lib/leadgen-email";

let inserted: Record<string, unknown> | null = null;
const session = {
  from: (table: string) => {
    if (table === "leadgen_bounced_emails") {
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) };
    }
    return {
      insert: (row: Record<string, unknown>) => {
        inserted = row;
        return { select: () => ({ single: () => Promise.resolve({ data: { id: "row-1" }, error: null }) }) };
      },
    };
  },
} as never;

const base = { clientId: "c1", leadId: "l1", toEmail: "client@example.com", subject: "S", body: "B", sentBy: "admin-1", clientVisible: true };

beforeEach(() => {
  inserted = null;
  adminUpdates.length = 0;
  sendMock.mockReset();
});

describe("sendLeadgenEmail notification record", () => {
  it("stores the notification type on the email row and marks it sent only after Resend accepts it", async () => {
    sendMock.mockResolvedValue({ data: { id: "resend-1" }, error: null });
    const result = await sendLeadgenEmail(session, { ...base, notificationType: "proposal_requested" });
    expect(result).toEqual({ emailId: "row-1" });
    expect(inserted).toMatchObject({ lead_id: "l1", client_id: "c1", to_email: "client@example.com", sent_by: "admin-1", status: "sending", notification_type: "proposal_requested" });
    expect(adminUpdates.at(-1)).toMatchObject({ status: "sent", resend_message_id: "resend-1" });
  });

  it("records a Resend rejection as failed with its reason and returns the error", async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: "Domain not verified" } });
    const result = await sendLeadgenEmail(session, { ...base, notificationType: "custom" });
    expect(result.error).toBeTruthy();
    expect(adminUpdates.at(-1)).toMatchObject({ status: "failed", failure_reason: "Domain not verified" });
    expect(adminUpdates.some((u) => u.status === "sent")).toBe(false);
  });

  it("records a thrown send error as failed", async () => {
    sendMock.mockRejectedValue(new Error("network down"));
    const result = await sendLeadgenEmail(session, { ...base, notificationType: "custom" });
    expect(result.error).toBeTruthy();
    expect(adminUpdates.at(-1)).toMatchObject({ status: "failed", failure_reason: "network down" });
  });

  it("leaves every other email's insert untouched (no notification_type key)", async () => {
    sendMock.mockResolvedValue({ data: { id: "resend-2" }, error: null });
    await sendLeadgenEmail(session, base);
    expect(inserted).not.toHaveProperty("notification_type");
  });
});
