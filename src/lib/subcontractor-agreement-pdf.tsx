import "server-only";
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { WINSALOT_LOGO_DATA_URI } from "./winsalot-logo-base64";
import type { SubcontractorAgreementRow } from "./crm-subcontractor-types";

// Signed Independent Contractor Agreement PDF - same brand chrome and
// @react-pdf/renderer approach as crm-agreement-pdf.tsx (the Client
// Service Agreement PDF): no Chromium/Puppeteer dependency, works
// unmodified on Vercel serverless, generated on demand from the stored
// (immutable once signed) crm_subcontractor_agreements row - never
// persisted as a file.

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1e293b" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  brandRow: { flexDirection: "row", alignItems: "center" },
  logo: { width: 36, height: 36, marginRight: 10 },
  brand: { fontSize: 20, fontWeight: 700, color: "#1e3a8a" },
  tagline: { fontSize: 9, color: "#475569", marginTop: 2 },
  contact: { fontSize: 8, color: "#64748b", marginTop: 8 },
  docTitle: { fontSize: 16, fontWeight: 700, color: "#1e293b", textAlign: "right" },
  docMeta: { fontSize: 9, color: "#475569", textAlign: "right", marginTop: 2 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  label: { fontSize: 8, color: "#94a3b8", textTransform: "uppercase", marginBottom: 2 },
  value: { fontSize: 10, color: "#1e293b" },
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 10.5, fontWeight: 700, color: "#1e3a8a", marginBottom: 3 },
  sectionBody: { fontSize: 9, color: "#334155", lineHeight: 1.5 },
  signatureBlock: { marginTop: 24, flexDirection: "row", justifyContent: "space-between" },
  signatureCol: { width: "45%" },
  signatureLine: { borderTopWidth: 1, borderTopColor: "#94a3b8", marginTop: 24, paddingTop: 4 },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 8,
    color: "#94a3b8",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 8,
  },
});

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export type SubcontractorAgreementPdfProps = {
  agreement: SubcontractorAgreementRow;
};

export function SubcontractorAgreementPdfDocument({ agreement }: SubcontractorAgreementPdfProps) {
  return (
    <Document title={`Independent Contractor Agreement - ${agreement.contractor_name_typed}`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View>
            <View style={styles.brandRow}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's own Image element, not an HTML <img> - it has no alt prop at all. */}
              <Image src={WINSALOT_LOGO_DATA_URI} style={styles.logo} />
              <Text style={styles.brand}>Winsalot Corp</Text>
            </View>
            <Text style={styles.tagline}>Brampton, Ontario, Canada</Text>
            <Text style={styles.contact}>647-300-1270 · info@winsalotcorp.com · winsalotcorp.com</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>INDEPENDENT CONTRACTOR AGREEMENT</Text>
            <Text style={styles.docMeta}>Version {agreement.version.toFixed(1)}</Text>
            <Text style={styles.docMeta}>Signed {formatDate(agreement.accepted_at)}</Text>
          </View>
        </View>

        <View style={styles.sectionRow}>
          <View>
            <Text style={styles.label}>Contractor</Text>
            <Text style={styles.value}>{agreement.contractor_name_typed}</Text>
            {agreement.business_name_snapshot && <Text style={styles.value}>{agreement.business_name_snapshot}</Text>}
            <Text style={styles.value}>{agreement.email_snapshot ?? "-"}</Text>
          </View>
          <View>
            <Text style={styles.label}>Address / Country</Text>
            <Text style={styles.value}>{agreement.address_snapshot ?? "-"}</Text>
            <Text style={styles.value}>{agreement.country_snapshot ?? "-"}</Text>
          </View>
          <View>
            <Text style={styles.label}>Start Date</Text>
            <Text style={styles.value}>{formatDate(agreement.start_date_snapshot)}</Text>
            {agreement.assigned_client_snapshot && (
              <>
                <Text style={[styles.label, { marginTop: 6 }]}>Assigned Client</Text>
                <Text style={styles.value}>{agreement.assigned_client_snapshot}</Text>
              </>
            )}
          </View>
        </View>

        {agreement.rendered_content.map((section) => (
          <View style={styles.section} key={section.key} wrap={false}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}

        <View style={styles.signatureBlock}>
          <View style={styles.signatureCol}>
            <View style={styles.signatureLine}>
              <Text style={styles.value}>Winsalot Corp.</Text>
              <Text style={styles.label}>Authorized Representative</Text>
            </View>
          </View>
          <View style={styles.signatureCol}>
            <View style={styles.signatureLine}>
              <Text style={styles.value}>{agreement.contractor_name_typed}</Text>
              <Text style={styles.label}>Contractor · Signed {formatDate(agreement.accepted_at)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.footer} fixed>
          Winsalot Corp · Brampton, Ontario, Canada · 647-300-1270 · info@winsalotcorp.com · winsalotcorp.com
        </Text>
      </Page>
    </Document>
  );
}

export async function renderSubcontractorAgreementPdfBuffer(props: SubcontractorAgreementPdfProps): Promise<Buffer> {
  return renderToBuffer(<SubcontractorAgreementPdfDocument {...props} />);
}
