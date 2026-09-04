import "server-only";
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { WINSALOT_LOGO_DATA_URI } from "./winsalot-logo-base64";
import type { SubcontractorAgreementRow, SubcontractorRow } from "./subcontractor-payroll";

const styles = StyleSheet.create({
  page: { padding: 42, fontFamily: "Helvetica", fontSize: 9.5, color: "#1e293b" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 22 },
  brandRow: { flexDirection: "row", alignItems: "center" },
  logo: { width: 34, height: 34, marginRight: 9 },
  brand: { fontSize: 19, fontWeight: 700, color: "#1e3a8a" },
  muted: { color: "#64748b", fontSize: 8, marginTop: 2 },
  title: { fontSize: 17, fontWeight: 700, textAlign: "right" },
  meta: { marginBottom: 15, padding: 10, backgroundColor: "#f1f5f9" },
  body: { whiteSpace: "pre-wrap", lineHeight: 1.5 },
  signature: { marginTop: 22, borderTopWidth: 1, borderTopColor: "#94a3b8", paddingTop: 7 },
  footer: { position: "absolute", bottom: 28, left: 42, right: 42, borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 7, textAlign: "center", color: "#94a3b8", fontSize: 8 },
});

function date(value: string | null) {
  return value ? new Date(value).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" }) : "Pending";
}

export function SubcontractorAgreementPdfDocument({ subcontractor, agreement }: { subcontractor: SubcontractorRow; agreement: SubcontractorAgreementRow }) {
  return (
    <Document title={`Independent Contractor Agreement - ${subcontractor.full_name}`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View>
            <View style={styles.brandRow}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={WINSALOT_LOGO_DATA_URI} style={styles.logo} />
              <Text style={styles.brand}>Winsalot Corp</Text>
            </View>
            <Text style={styles.muted}>Empowering Businesses, One Solution at a Time.</Text>
            <Text style={styles.muted}>info@winsalotcorp.com · winsalotcorp.com</Text>
          </View>
          <View>
            <Text style={styles.title}>INDEPENDENT{`\n`}CONTRACTOR AGREEMENT</Text>
            <Text style={styles.muted}>Version {agreement.version} · {agreement.status.toUpperCase()}</Text>
          </View>
        </View>
        <View style={styles.meta}>
          <Text>Contractor: {subcontractor.full_name}</Text>
          <Text>Email: {subcontractor.email ?? "Not provided"}</Text>
          <Text>Issued: {date(agreement.issued_at)}</Text>
        </View>
        <Text style={styles.body}>{agreement.agreement_text}</Text>
        <View style={styles.signature} wrap={false}>
          <Text>Typed signature: {agreement.signer_signature_text ?? "Pending signature"}</Text>
          <Text>Legal name: {agreement.signer_full_name ?? "Pending"}</Text>
          <Text>Accepted: {date(agreement.accepted_at)}</Text>
        </View>
        <Text style={styles.footer} fixed>Winsalot Corp · 20 Leacrest Street, Brampton, Ontario L6S 3K6 · info@winsalotcorp.com</Text>
      </Page>
    </Document>
  );
}

export async function renderSubcontractorAgreementPdf(input: { subcontractor: SubcontractorRow; agreement: SubcontractorAgreementRow }) {
  return renderToBuffer(<SubcontractorAgreementPdfDocument {...input} />);
}
