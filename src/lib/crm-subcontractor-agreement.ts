// Independent Contractor Agreement: template rendering. Same {{token}}
// substitution convention as renderAgreementTemplate() in
// crm-agreement-types.ts (the Client Service Agreement system), kept as a
// pure function so the sign page, the admin view, and the PDF
// (subcontractor-agreement-pdf.tsx) can never disagree about wording.

import { formatSubcontractorCurrency, SUBCONTRACTOR_PAY_TYPE_LABELS, type SubcontractorCurrency, type SubcontractorPayType } from "./subcontractor-payroll";
import type { SubcontractorAgreementTemplateRow } from "./crm-subcontractor-types";

export type RenderedSubcontractorAgreementSection = { key: string; title: string; body: string };

export type SubcontractorAgreementRenderInput = {
  currency: SubcontractorCurrency;
  payType: SubcontractorPayType;
  payRate: number;
  startDate: string | null;
};

// "Hourly rate", "Fixed amount", etc. plus the actual figure - the exact
// text that fills the Agreement's "Currency: ___ / Rate or Amount: ___"
// blanks (brief's given text, section 4).
export function formatCompensationArrangement(input: Pick<SubcontractorAgreementRenderInput, "payType" | "payRate" | "currency">): string {
  const amount = formatSubcontractorCurrency(input.payRate, input.currency);
  return `${amount} (${SUBCONTRACTOR_PAY_TYPE_LABELS[input.payType]})`;
}

export function renderSubcontractorAgreementTemplate(
  template: Pick<SubcontractorAgreementTemplateRow, "content">,
  input: SubcontractorAgreementRenderInput
): RenderedSubcontractorAgreementSection[] {
  const replacements: Record<string, string> = {
    currency: input.currency,
    rate_amount: formatCompensationArrangement(input),
    start_date: input.startDate ?? "Not yet set",
  };

  return template.content.map((section) => {
    const body = section.body.replace(/\{\{(\w+)\}\}/g, (_match, token: string) => replacements[token] ?? `{{${token}}}`);
    return { ...section, body };
  });
}
