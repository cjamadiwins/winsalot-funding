import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  deriveCrmOnboardingStage,
  nextRequiredAction,
  deriveCrmPilotStage,
  nextRequiredPilotAction,
  AGREEMENT_SERVICE_TYPE_LABELS,
  INVOICE_TRACKER_STATUS_LABELS,
  CAMPAIGN_TYPE_LABELS,
  type CrmClientAgreementRow,
  type CrmIntakeConfigRow,
  type CrmAgreementInvoiceRow,
} from "@/lib/crm-agreement-types";
import OnboardingDashboardClient, { type OnboardingRow } from "./OnboardingDashboardClient";

// Admin-only Client Onboarding Dashboard (brief section 1/7). Every
// status shown here (agreement/intake/invoice/payment/campaign) is read
// straight off the underlying rows - the "Current onboarding stage" and
// "Next required action" columns are computed with
// deriveCrmOnboardingStage()/nextRequiredAction() (src/lib/crm-agreement-types.ts),
// never separately stored, so they can never drift out of sync with the
// data actually shown next to them.
export default async function AdminCrmOnboardingPage() {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: agreements } = await supabase
    .from("crm_client_agreements")
    .select("*")
    .neq("status", "superseded")
    .order("created_at", { ascending: false });

  const activeAgreements = (agreements ?? []) as CrmClientAgreementRow[];
  const clientIds = Array.from(new Set(activeAgreements.map((a) => a.client_id)));
  const agreementIds = activeAgreements.map((a) => a.id);

  const [{ data: clients }, { data: intakeConfigs }, { data: submissions }, { data: invoices }] = await Promise.all([
    clientIds.length > 0 ? supabase.from("crm_clients").select("id, company_name, status").in("id", clientIds) : Promise.resolve({ data: [] }),
    agreementIds.length > 0 ? supabase.from("crm_intake_configs").select("*").in("agreement_id", agreementIds) : Promise.resolve({ data: [] }),
    agreementIds.length > 0 ? supabase.from("crm_intake_submissions").select("id, agreement_id").in("agreement_id", agreementIds) : Promise.resolve({ data: [] }),
    agreementIds.length > 0 ? supabase.from("crm_agreement_invoices").select("*").in("agreement_id", agreementIds) : Promise.resolve({ data: [] }),
  ]);

  const clientById = new Map((clients ?? []).map((c) => [c.id as string, c]));
  const intakeByAgreement = new Map((intakeConfigs ?? []).map((i) => [i.agreement_id as string, i as CrmIntakeConfigRow]));
  const submittedAgreementIds = new Set((submissions ?? []).map((s) => s.agreement_id as string));
  const invoiceByAgreement = new Map((invoices ?? []).map((i) => [i.agreement_id as string, i as CrmAgreementInvoiceRow]));

  const rows: OnboardingRow[] = activeAgreements.map((agreement) => {
    const client = clientById.get(agreement.client_id);
    const intakeConfig = intakeByAgreement.get(agreement.id) ?? null;
    const hasSubmission = submittedAgreementIds.has(agreement.id);
    const invoice = invoiceByAgreement.get(agreement.id) ?? null;
    const clientStatus = client?.status ?? "Prospect";
    const isPilot = agreement.campaign_type === "free_pilot";

    const stage = isPilot
      ? deriveCrmPilotStage({
          agreement: { status: agreement.status, pilot_status: agreement.pilot_status },
          intakeConfig: intakeConfig ? { status: intakeConfig.status } : null,
          submission: hasSubmission ? { id: "x" } : null,
        })
      : deriveCrmOnboardingStage({
          agreement: { status: agreement.status },
          intakeConfig: intakeConfig ? { status: intakeConfig.status } : null,
          submission: hasSubmission ? { id: "x" } : null,
          invoice: invoice ? { status: invoice.status } : null,
          clientStatus,
        });

    return {
      agreementId: agreement.id,
      clientId: agreement.client_id,
      clientName: client?.company_name ?? agreement.legal_business_name,
      contactPerson: agreement.contact_person,
      campaignTypeLabel: CAMPAIGN_TYPE_LABELS[agreement.campaign_type],
      serviceTypeLabel: AGREEMENT_SERVICE_TYPE_LABELS[agreement.service_type],
      monthlyTarget: agreement.monthly_target,
      monthlyFee: agreement.monthly_fee,
      stage,
      nextAction: isPilot ? nextRequiredPilotAction(stage as Parameters<typeof nextRequiredPilotAction>[0]) : nextRequiredAction(stage as Parameters<typeof nextRequiredAction>[0]),
      agreementStatus: agreement.status,
      isPilot,
      pilotStatus: agreement.pilot_status,
      intakeConfigId: intakeConfig?.id ?? null,
      intakeStatus: intakeConfig ? (hasSubmission ? "Received" : intakeConfig.status === "sent" ? "Sent" : "Draft") : "Not started",
      invoiceId: invoice?.id ?? null,
      invoiceStatusLabel: isPilot ? "Not Applicable (Free Pilot)" : invoice ? INVOICE_TRACKER_STATUS_LABELS[invoice.status] : "Not started",
      paymentReceived: invoice?.status === "payment_received",
      campaignStatus: clientStatus,
      canRecordInvoice: !isPilot && agreement.status === "signed" && hasSubmission && !invoice,
    };
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Client Onboarding</h1>
      <p className="mt-1 text-sm text-slate-500">
        Track every client from agreement to active campaign. Agreement terms, prices, and payment information are never shown to
        agents.
      </p>

      <div className="mt-6">
        <OnboardingDashboardClient rows={rows} />
      </div>
    </div>
  );
}
