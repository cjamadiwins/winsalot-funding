import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../site-url", () => ({ getSiteUrl: () => "https://growth.winsalotcorp.com" }));

// In-memory stand-in for crm_client_communications that enforces the unique
// resend_email_id the real table has.
type Row = Record<string, unknown>;
const db: { rows: Row[]; failInserts: number } = { rows: [], failInserts: 0 };
let idCounter = 0;

vi.mock("../supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const filters: [string, unknown][] = [];
      let pendingRow: Row | null = null;
      let ignoreDup = false;
      const builder = {
        upsert(row: Row, opts: { ignoreDuplicates?: boolean }) {
          pendingRow = row;
          ignoreDup = !!opts?.ignoreDuplicates;
          return builder;
        },
        select: () => builder,
        eq(col: string, val: unknown) {
          filters.push([col, val]);
          return builder;
        },
        async maybeSingle() {
          if (pendingRow) {
            if (db.failInserts > 0) {
              db.failInserts--;
              return { data: null, error: { message: "db down" } };
            }
            const dup = pendingRow.resend_email_id && db.rows.find((r) => r.resend_email_id === pendingRow!.resend_email_id);
            if (dup) return ignoreDup ? { data: null, error: null } : { data: null, error: { message: "duplicate key" } };
            const stored = { id: `comm-${++idCounter}`, ...pendingRow };
            db.rows.push(stored);
            return { data: { id: stored.id }, error: null };
          }
          return { data: db.rows.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null, error: null };
        },
      };
      return builder;
    },
  }),
}));

const send = vi.fn();
vi.mock("../resend", () => ({ getResendClient: () => ({ emails: { send } }) }));

import { logClientCommunication, sendAndLogClientEmail } from "../crm-client-communications";

const base = {
  clientId: "client-1",
  toEmail: "theo@example.com",
  subject: "Your Winsalot Corp. Campaign Setup Is Complete",
  text: "Hi Theodore",
  html: "<p>Hi Theodore</p>",
  emailType: "campaign_setup" as const,
  sentBy: { id: "admin-1", name: "Winsalot Admin" },
};

beforeEach(() => {
  db.rows = [];
  db.failInserts = 0;
  send.mockReset();
});

describe("sendAndLogClientEmail", () => {
  it("sends once and logs exactly one record with the final sent version", async () => {
    send.mockResolvedValue({ data: { id: "re_123" }, error: null });
    const before = Date.now();
    const result = await sendAndLogClientEmail(base);

    expect(result.ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ to: "theo@example.com", subject: base.subject });
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({
      client_id: "client-1",
      recipient_email: "theo@example.com",
      subject: "Your Winsalot Corp. Campaign Setup Is Complete",
      email_type: "campaign_setup",
      status: "sent",
      resend_email_id: "re_123",
      sent_by_name: "Winsalot Admin",
      body_html: "<p>Hi Theodore</p>",
    });
    const sentAt = new Date(db.rows[0].sent_at as string).getTime();
    expect(sentAt).toBeGreaterThanOrEqual(before - 1000);
    expect(sentAt).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("never creates a second record for the same Resend email id", async () => {
    const first = await logClientCommunication({ ...base, sender: "Winsalot Corp.", resendEmailId: "re_dup" });
    const second = await logClientCommunication({ ...base, sender: "Winsalot Corp.", resendEmailId: "re_dup" });
    expect(db.rows).toHaveLength(1);
    expect(second.id).toBe(first.id);
  });

  it("logs a failed send as a failed record (not lost, not marked sent)", async () => {
    send.mockResolvedValue({ data: null, error: { message: "domain not verified" } });
    const result = await sendAndLogClientEmail(base);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("domain not verified");
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ status: "failed", error_detail: "domain not verified", resend_email_id: null });
  });

  it("reports a log failure after a successful send instead of calling the email failed", async () => {
    send.mockResolvedValue({ data: { id: "re_456" }, error: null });
    db.failInserts = 2; // both attempts fail
    const result = await sendAndLogClientEmail(base);
    expect(result.ok).toBe(true);
    expect(result.logWarning).toContain("could not be saved");
  });

  it("retries the log write once", async () => {
    send.mockResolvedValue({ data: { id: "re_789" }, error: null });
    db.failInserts = 1;
    const result = await sendAndLogClientEmail(base);
    expect(result.ok).toBe(true);
    expect(result.logWarning).toBeUndefined();
    expect(db.rows).toHaveLength(1);
  });
});
