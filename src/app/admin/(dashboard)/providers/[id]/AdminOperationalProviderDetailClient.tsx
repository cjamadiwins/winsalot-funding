"use client";

import OperationalProviderDetailClient, {
  type OperationalProviderDetailActions,
} from "@/components/providers/OperationalProviderDetailClient";
import ProviderInvoicesSection, { type ProviderInvoicesActions } from "@/components/providers/ProviderInvoicesSection";
import type {
  CleaningProviderRow,
  LatestProviderLeadEmail,
  ProviderActivityRow,
  ProviderEmailHistoryRow,
  ProviderFollowUpRow,
  ProviderNoteRow,
  ProviderScoreAdjustmentRow,
} from "@/lib/provider-types";
import type { ProviderDocumentWithUrl } from "@/components/provider-acquisition/ProviderFilesCard";
import type { ProviderQuoteHistoryRow } from "@/lib/provider-quote-history";
import type { CrmUserRow } from "@/lib/crm-types";
import type { ProviderFinancialSummary, ProviderInvoiceWithRelations } from "@/lib/provider-invoice-types";
import {
  addOperationalActivityAction,
  addOperationalNoteAction,
  addOperationalScoreAdjustmentAction,
  assignOperationalAgentAction,
  completeOperationalFollowUpAction,
  deleteOperationalProviderAction,
  recalculateOperationalScoreAction,
  removeOperationalDocumentAction,
  removeOperationalFollowUpAction,
  rescheduleOperationalFollowUpAction,
  scheduleOperationalFollowUpAction,
  sendOperationalEmailAction,
  sendOperationalSmsAction,
  updateOperationalNoteAction,
  updateOperationalProfileAction,
  updateOperationalStatusAction,
  uploadOperationalDocumentAction,
} from "../actions";
import {
  cancelProviderInvoiceAction,
  correctProviderPaymentAction,
  createProviderInvoiceAction,
  getPaymentReceiptUrlAction,
  markProviderInvoiceSentAction,
  recordProviderPaymentAction,
  reverseProviderPaymentAction,
  updateProviderInvoiceAction,
} from "../invoice-actions";

const actions: OperationalProviderDetailActions = {
  updateProfile: updateOperationalProfileAction,
  updateStatus: updateOperationalStatusAction,
  addActivity: addOperationalActivityAction,
  sendEmail: sendOperationalEmailAction,
  sendSms: sendOperationalSmsAction,
  assignAgent: assignOperationalAgentAction,
  scheduleFollowUp: scheduleOperationalFollowUpAction,
  rescheduleFollowUp: rescheduleOperationalFollowUpAction,
  completeFollowUp: completeOperationalFollowUpAction,
  removeFollowUp: removeOperationalFollowUpAction,
  addNote: addOperationalNoteAction,
  updateNote: updateOperationalNoteAction,
  uploadDocument: uploadOperationalDocumentAction,
  removeDocument: removeOperationalDocumentAction,
  addScoreAdjustment: addOperationalScoreAdjustmentAction,
  recalculateScore: recalculateOperationalScoreAction,
  deleteProvider: deleteOperationalProviderAction,
};

const invoiceActions: ProviderInvoicesActions = {
  createInvoice: createProviderInvoiceAction,
  updateInvoice: updateProviderInvoiceAction,
  markSent: markProviderInvoiceSentAction,
  cancelInvoice: cancelProviderInvoiceAction,
  recordPayment: recordProviderPaymentAction,
  correctPayment: correctProviderPaymentAction,
  reversePayment: reverseProviderPaymentAction,
  getReceiptUrl: getPaymentReceiptUrlAction,
};

export default function AdminOperationalProviderDetailClient({
  provider,
  activities,
  followUps,
  agents,
  notes,
  documents,
  scoreAdjustments,
  emailHistory,
  latestEmail,
  quoteHistory,
  logoUrl,
  linkedLead,
  currentUserId,
  financialSummary,
  invoices,
}: {
  provider: CleaningProviderRow;
  activities: ProviderActivityRow[];
  followUps: ProviderFollowUpRow[];
  agents: CrmUserRow[];
  notes: ProviderNoteRow[];
  documents: ProviderDocumentWithUrl[];
  scoreAdjustments: ProviderScoreAdjustmentRow[];
  emailHistory: ProviderEmailHistoryRow[];
  latestEmail: LatestProviderLeadEmail | null;
  quoteHistory: ProviderQuoteHistoryRow[];
  logoUrl: string | null;
  linkedLead: { id: string; business_name: string } | null;
  currentUserId: string;
  financialSummary: ProviderFinancialSummary;
  invoices: ProviderInvoiceWithRelations[];
}) {
  return (
    <>
      <OperationalProviderDetailClient
        provider={provider}
        activities={activities}
        followUps={followUps}
        notes={notes}
        documents={documents}
        scoreAdjustments={scoreAdjustments}
        emailHistory={emailHistory}
        latestEmail={latestEmail}
        quoteHistory={quoteHistory}
        logoUrl={logoUrl}
        linkedLead={linkedLead}
        isAdmin
        currentUserId={currentUserId}
        agents={agents}
        actions={actions}
        listPath="/admin/providers"
      />
      <div className="mt-6">
        <ProviderInvoicesSection
          providerId={provider.id}
          summary={financialSummary}
          invoices={invoices}
          actions={invoiceActions}
        />
      </div>
    </>
  );
}
