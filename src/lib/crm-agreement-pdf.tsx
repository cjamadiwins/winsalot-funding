import "server-only";
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { WINSALOT_LOGO_DATA_URI } from "./winsalot-logo-base64";
import {
  renderAgreementTemplate,
  AGREEMENT_SERVICE_TYPE_LABELS,
  COMPLIMENTARY_PILOT_PROGRAM_LABEL,
  type CrmAgreementTemplateRow,
  type CrmClientAgreementRow,
} from "./crm-agreement-types";

// Signed Client Service Agreement PDF - same brand language (dark-blue
// header, "Empowering Businesses, One Solution at a Time.", contact
// info) as the existing crm-invoice-pdf.tsx, and the same
// @react-pdf/renderer approach (draws its own PDF primitives, no
// Chromium/Puppeteer dependency, works unmodified on Vercel serverless).
// Generated on demand from the stored (immutable once signed) agreement
// row - never persisted as a file, since this codebase doesn't use
// Supabase Storage anywhere and the agreement can't change once signed.

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1e293b" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  brandRow: { flexDirection: "row", alignItems: "center" },
  logo: { width: 36, height: 36, marginRight: 10 },
  brand: { fontSize: 20, fontWeight: 700, color: "#1e3a8a" },
  tagline: { fontSize: 9, color: "#475569", marginTop: 2 },
  contact: { fontSize: 8, color: "#64748b", marginTop: 8 },
  docTitle: { fontSize: 18, fontWeight: 700, color: "#1e293b", textAlign: "right" },
  docMeta: { fontSize: 9, color: "#475569", textAlign: "right", marginTop: 2 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  label: { fontSize: 8, color: "#94a3b8", textTransform: "uppercase", marginBottom: 2 },
  value: { fontSize: 10, color: "#1e293b" },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: "#1e3a8a", marginBottom: 4 },
  sectionBody: { fontSize: 9.5, color: "#334155", lineHeight: 1.5 },
  signatureBlock: { marginTop: 24, flexDirection: "row", justifyContent: "space-between" },
  signatureCol: { width: "45%" },
  signatureLine: { borderTopWidth: 1, borderTopColor: "#94a3b8", marginTop: 24, paddingTop: 4 },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, textAlign: "center", fontSize: 8, color: "#94a3b8", borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 8 },
});

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function formatCurrency(value: number | null, currencyCode?: string): string {
  if (value === null || value === undefined) return "-";
  const amount = `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return currencyCode ? `${amount} ${currencyCode}` : amount;
}

export type AgreementPdfProps = {
  agreement: CrmClientAgreementRow;
  template: Pick<CrmAgreementTemplateRow, "content">;
};

export function AgreementPdfDocument({ agreement, template }: AgreementPdfProps) {
  const sections = renderAgreementTemplate(template, agreement);
  const isPilot = agreement.campaign_type === "free_pilot";

  return (
    <Document title={`${isPilot ? COMPLIMENTARY_PILOT_PROGRAM_LABEL : "Client Service Agreement"} - ${agreement.legal_business_name}`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View>
            <View style={styles.brandRow}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's own Image element, not an HTML <img> - it has no alt prop at all. */}
              <Image src={WINSALOT_LOGO_DATA_URI} style={styles.logo} />
              <Text style={styles.brand}>Winsalot Corp</Text>
            </View>
            <Text style={styles.tagline}>Empowering Businesses, One Solution at a Time.</Text>
            <Text style={styles.contact}>647-300-1270 · info@winsalotcorp.com · winsalotcorp.com</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>{isPilot ? COMPLIMENTARY_PILOT_PROGRAM_LABEL.toUpperCase() : "CLIENT SERVICE AGREEMENT"}</Text>
            <Text style={styles.docMeta}>Version {agreement.version}</Text>
            <Text style={styles.docMeta}>Status: {agreement.status}</Text>
          </View>
        </View>

        <View style={styles.sectionRow}>
          <View>
            <Text style={styles.label}>Client</Text>
            <Text style={styles.value}>{agreement.legal_business_name}</Text>
            <Text style={styles.value}>{agreement.contact_person}</Text>
            <Text style={styles.value}>{agreement.business_email}</Text>
          </View>
          <View>
            <Text style={styles.label}>Service Type</Text>
            <Text style={styles.value}>{AGREEMENT_SERVICE_TYPE_LABELS[agreement.service_type]}</Text>
            <View style={{ marginTop: 8 }}>
              <Text style={styles.label}>{isPilot ? "Start Date" : "Campaign Start Date"}</Text>
              <Text style={styles.value}>{formatDate(agreement.campaign_start_date)}</Text>
            </View>
          </View>
        </View>

        {isPilot ? (
          <View style={styles.sectionRow}>
            <View>
              <Text style={styles.label}>Pilot Fee</Text>
              <Text style={styles.value}>$0.00</Text>
            </View>
            <View>
              <Text style={styles.label}>Setup Fee</Text>
              <Text style={styles.value}>$0.00</Text>
            </View>
            <View>
              <Text style={styles.label}>End Date</Text>
              <Text style={styles.value}>{formatDate(agreement.pilot_end_date)}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.sectionRow}>
            <View>
              <Text style={styles.label}>Monthly Fee</Text>
              <Text style={styles.value}>{formatCurrency(agreement.monthly_fee, agreement.currency)}</Text>
            </View>
            <View>
              <Text style={styles.label}>Setup Fee</Text>
              <Text style={styles.value}>{agreement.setup_fee ? formatCurrency(agreement.setup_fee, agreement.currency) : "None"}</Text>
            </View>
            <View>
              <Text style={styles.label}>Billing Frequency</Text>
              <Text style={styles.value}>{agreement.billing_frequency}</Text>
            </View>
          </View>
        )}

        {sections.map((section) => (
          <View style={styles.section} key={section.key} wrap={false}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}

        {(agreement.payment_due_terms || agreement.initial_term || agreement.renewal_terms || agreement.cancellation_terms) && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>Term</Text>
            {agreement.payment_due_terms && <Text style={styles.sectionBody}>Payment due terms: {agreement.payment_due_terms}</Text>}
            {agreement.initial_term && <Text style={styles.sectionBody}>Initial term: {agreement.initial_term}</Text>}
            {agreement.renewal_terms && <Text style={styles.sectionBody}>Renewal: {agreement.renewal_terms}</Text>}
            {agreement.cancellation_terms && <Text style={styles.sectionBody}>Cancellation: {agreement.cancellation_terms}</Text>}
          </View>
        )}

        {agreement.additional_notes && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>Additional Notes</Text>
            <Text style={styles.sectionBody}>{agreement.additional_notes}</Text>
          </View>
        )}

        <View style={styles.signatureBlock}>
          <View style={styles.signatureCol}>
            <View style={styles.signatureLine}>
              <Text style={styles.value}>Winsalot Corp</Text>
              <Text style={styles.label}>Authorized Representative</Text>
            </View>
          </View>
          <View style={styles.signatureCol}>
            <View style={styles.signatureLine}>
              <Text style={styles.value}>{agreement.signer_signature_text || "Pending signature"}</Text>
              <Text style={styles.label}>
                {agreement.signer_full_name ? `${agreement.signer_full_name}${agreement.signer_job_title ? `, ${agreement.signer_job_title}` : ""}` : "Client"}
              </Text>
              {agreement.accepted_at && <Text style={styles.label}>Signed {formatDate(agreement.accepted_at)}</Text>}
            </View>
          </View>
        </View>

        <Text style={styles.footer} fixed>
          Winsalot Corp · 647-300-1270 · info@winsalotcorp.com · winsalotcorp.com
        </Text>
      </Page>
    </Document>
  );
}

export async function renderAgreementPdfBuffer(props: AgreementPdfProps): Promise<Buffer> {
  return renderToBuffer(<AgreementPdfDocument {...props} />);
}
