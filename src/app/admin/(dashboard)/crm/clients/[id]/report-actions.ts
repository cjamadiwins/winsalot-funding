"use server";

import { requireCrmAdmin } from "@/lib/crm-auth";
import { fetchPortalUsersForLeadgenClient } from "@/lib/client-portal-data";
import { sendLeadgenEmail, textToSimpleHtml } from "@/lib/leadgen-email";
import { loadLeadgenClientReport } from "@/lib/leadgen-client-report-data";
import { leadgenReportFilename, resolveLeadgenReportMonth } from "@/lib/leadgen-client-report";
import { renderLeadgenClientReportPdf } from "@/lib/leadgen-client-report-pdf";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { LeadgenClientRow } from "@/lib/leadgen-types";

export async function sendClientReportAction(crmClientId: string, month: string): Promise<{ error?: string; sent?: number }> {
  const staff = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: crmClient } = await supabase
    .from("crm_clients")
    .select("id, company_name, leadgen_client_id")
    .eq("id", crmClientId)
    .maybeSingle();
  if (!crmClient?.leadgen_client_id) return { error: "This client is not linked to a Lead Generation CRM client." };

  const admin = getSupabaseAdmin();
  const [{ data: leadgenClient }, portalUsers] = await Promise.all([
    admin.from("leadgen_clients").select("*").eq("id", crmClient.leadgen_client_id).maybeSingle(),
    fetchPortalUsersForLeadgenClient(crmClient.leadgen_client_id),
  ]);
  if (!leadgenClient) return { error: "The linked Lead Generation CRM client was not found." };
  const recipients = portalUsers.filter((user) => user.active);
  if (recipients.length === 0) return { error: "Create and activate a client portal login before sending the report." };

  const { month: safeMonth, period } = resolveLeadgenReportMonth(month);
  const report = await loadLeadgenClientReport(admin, leadgenClient as LeadgenClientRow, period);
  const pdf = await renderLeadgenClientReportPdf(report);
  const monthLabel = new Date(`${safeMonth}-01T12:00:00Z`).toLocaleDateString("en-CA", { month: "long", year: "numeric", timeZone: "UTC" });
  const body = `Hello ${crmClient.company_name} team,\n\nYour ${monthLabel} client performance report is attached. You can also sign in to the Winsalot Client Portal to review your results.\n\nBest,\nWinsalot Corp`;
  let sent = 0;
  for (const recipient of recipients) {
    const result = await sendLeadgenEmail(admin, {
      clientId: crmClient.leadgen_client_id,
      toEmail: recipient.email,
      toName: recipient.full_name,
      subject: `${monthLabel} Client Performance Report`,
      body,
      text: body,
      html: textToSimpleHtml(body),
      sentBy: staff.id,
      clientVisible: true,
      senderDisplayNameOverride: "Winsalot Corp",
      attachments: [{ filename: leadgenReportFilename(leadgenClient.name, period, "pdf"), content: pdf }],
    });
    if (result.error) return { error: sent > 0 ? `Sent to ${sent} client email(s), but another send failed.` : result.error };
    sent += 1;
  }
  return { sent };
}
