import type { SubcontractorRow } from "./subcontractor-payroll";
import { formatSubcontractorCurrency, SUBCONTRACTOR_PAY_TYPE_LABELS } from "./subcontractor-payroll";

export const SUBCONTRACTOR_AGREEMENT_VERSION = 1;

export function buildSubcontractorAgreementText(subcontractor: Pick<SubcontractorRow, "full_name" | "pay_type" | "pay_rate" | "currency">): string {
  const compensation = `${formatSubcontractorCurrency(subcontractor.pay_rate, subcontractor.currency)} (${subcontractor.currency}), ${SUBCONTRACTOR_PAY_TYPE_LABELS[subcontractor.pay_type].toLowerCase()}`;
  return [
    "INDEPENDENT CONTRACTOR AGREEMENT",
    "",
    `This agreement is between Winsalot Corp. (\"Winsalot\") and ${subcontractor.full_name} (the \"Contractor\"). It takes effect when electronically accepted by the Contractor.`,
    "",
    "1. SERVICES",
    "The Contractor will provide outbound calling, appointment-setting, lead-generation, administrative, or other services assigned by Winsalot. The Contractor will perform the services professionally, accurately record work in the designated CRM, follow approved scripts and client instructions, and comply with applicable laws and privacy requirements.",
    "",
    "2. INDEPENDENT CONTRACTOR RELATIONSHIP",
    "The Contractor is an independent contractor and not an employee, partner, representative, or agent of Winsalot. The Contractor is not entitled to employee benefits, vacation pay, overtime pay, statutory holiday pay, or payroll deductions unless required by applicable law. Nothing in this agreement guarantees a minimum amount of work.",
    "",
    "3. COMPENSATION",
    `The agreed rate is ${compensation}. Winsalot will record approved work and payments in the Subcontractor Portal. Only work approved by Winsalot is payable. The Contractor is responsible for their own taxes, government remittances, insurance, banking fees, and expenses unless Winsalot agrees otherwise in writing.`,
    "",
    "4. EQUIPMENT AND WORK METHODS",
    "Unless agreed otherwise, the Contractor supplies their own reliable computer, telephone/headset, internet connection, electricity, and suitable workspace. The Contractor controls how and when services are performed, subject to agreed deadlines, client calling windows, security rules, quality standards, and deliverables.",
    "",
    "5. CONFIDENTIALITY, PRIVACY, AND SECURITY",
    "The Contractor must keep confidential all client, prospect, pricing, script, CRM, login, business, and personal information obtained through the work. Information may be used only to perform assigned services, may not be copied or disclosed for another purpose, and must be returned or securely deleted when requested. Login credentials are personal and may not be shared.",
    "",
    "6. OWNERSHIP",
    "All call notes, lead lists, scripts, reports, recordings, documents, CRM entries, and other work product created for Winsalot or its clients belong to Winsalot upon creation, to the extent permitted by law. The Contractor assigns any related rights needed for Winsalot and its clients to use that work product.",
    "",
    "7. CONDUCT AND AUTHORITY",
    "The Contractor must act honestly and respectfully, must not make misleading claims, and may not sign contracts, promise pricing, incur expenses, or otherwise bind Winsalot or a client without written authorization. The Contractor must promptly report complaints, privacy incidents, security concerns, and material errors.",
    "",
    "8. TERM AND TERMINATION",
    "Either party may end this agreement at any time by written notice. Winsalot may immediately suspend portal access or assignments for misconduct, confidentiality or security concerns, unlawful activity, material breach, or client protection. Approved amounts earned before termination remain payable, subject to valid adjustments or deductions agreed in writing or permitted by law.",
    "",
    "9. NON-SOLICITATION",
    "During the engagement and for twelve months afterward, the Contractor will not knowingly bypass Winsalot to solicit or accept substantially similar work directly from a client first introduced through Winsalot, except with Winsalot's written permission. This clause applies only to the extent permitted by applicable law.",
    "",
    "10. GENERAL",
    "This agreement is governed by the laws of Ontario and the federal laws of Canada applicable there. Changes must be recorded in writing. If one provision is unenforceable, the remaining provisions continue. Electronic acceptance and a typed signature have the same effect as a handwritten signature.",
  ].join("\n");
}
