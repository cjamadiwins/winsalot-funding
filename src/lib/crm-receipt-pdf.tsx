import "server-only";
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { WINSALOT_LOGO_DATA_URI } from "./winsalot-logo-base64";
import { formatReceiptDate, type ReceiptData } from "./crm-receipt";

// Same brand language as crm-invoice-pdf.tsx (existing Winsalot logo via
// WINSALOT_LOGO_DATA_URI, dark-blue header, contact footer).
const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1e293b" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 28 },
  brandRow: { flexDirection: "row", alignItems: "center" },
  logo: { width: 36, height: 36, marginRight: 10 },
  brand: { fontSize: 20, fontWeight: 700, color: "#1e3a8a" },
  tagline: { fontSize: 9, color: "#475569", marginTop: 2 },
  contact: { fontSize: 8, color: "#64748b", marginTop: 8 },
  title: { fontSize: 18, fontWeight: 700, textAlign: "right" },
  meta: { fontSize: 9, color: "#475569", textAlign: "right", marginTop: 2 },
  paid: { alignSelf: "flex-end", marginTop: 8, backgroundColor: "#059669", color: "#ffffff", fontSize: 11, fontWeight: 700, paddingVertical: 4, paddingHorizontal: 12, borderRadius: 4 },
  reversed: { alignSelf: "flex-end", marginTop: 8, backgroundColor: "#e11d48", color: "#ffffff", fontSize: 11, fontWeight: 700, paddingVertical: 4, paddingHorizontal: 12, borderRadius: 4 },
  label: { fontSize: 8, color: "#94a3b8", textTransform: "uppercase", marginBottom: 2 },
  value: { fontSize: 10, color: "#1e293b" },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  table: { marginTop: 6 },
  thRow: { flexDirection: "row", backgroundColor: "#1e3a8a", padding: 6 },
  th: { color: "#ffffff", fontSize: 8, fontWeight: 700, textTransform: "uppercase" },
  tdRow: { flexDirection: "row", padding: 6, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  colDesc: { flex: 4 },
  colAmt: { flex: 1.6, textAlign: "right" },
  totalBox: { marginTop: 16, alignSelf: "flex-end", width: 240, borderTopWidth: 1, borderTopColor: "#1e293b", paddingTop: 8, flexDirection: "row", justifyContent: "space-between" },
  totalLabel: { fontSize: 12, fontWeight: 700 },
  thanks: { marginTop: 28, fontSize: 9, color: "#475569", lineHeight: 1.5 },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, textAlign: "center", fontSize: 8, color: "#94a3b8", borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 8 },
});

export function ReceiptPdfDocument({ receipt }: { receipt: ReceiptData }) {
  return (
    <Document title={`Receipt ${receipt.receiptNumber}`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View>
            <View style={styles.brandRow}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's own Image element, no alt prop. */}
              <Image src={WINSALOT_LOGO_DATA_URI} style={styles.logo} />
              <Text style={styles.brand}>Winsalot Corp.</Text>
            </View>
            <Text style={styles.tagline}>Empowering Businesses, One Solution at a Time.</Text>
            <Text style={styles.contact}>647-300-1270 · info@winsalotcorp.com · winsalotcorp.com</Text>
          </View>
          <View>
            <Text style={styles.title}>PAYMENT RECEIPT</Text>
            <Text style={styles.meta}>Receipt No. {receipt.receiptNumber}</Text>
            <Text style={receipt.status === "PAID" ? styles.paid : styles.reversed}>{receipt.status}</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View>
            <Text style={styles.label}>Receipt For</Text>
            <Text style={styles.value}>{receipt.businessName}</Text>
            {receipt.contactName ? <Text style={styles.value}>Attn: {receipt.contactName}</Text> : null}
          </View>
          <View>
            <Text style={styles.label}>Payment Date</Text>
            <Text style={styles.value}>{formatReceiptDate(receipt.paymentDate)}</Text>
            {receipt.paymentMethodLabel ? (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.label}>Payment Method</Text>
                <Text style={styles.value}>{receipt.paymentMethodLabel}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.thRow}>
            <Text style={[styles.th, styles.colDesc]}>Description</Text>
            <Text style={[styles.th, styles.colAmt]}>Amount Paid</Text>
          </View>
          <View style={styles.tdRow}>
            <View style={styles.colDesc}>
              <Text>{receipt.description}</Text>
              <Text style={{ fontSize: 8, color: "#64748b", marginTop: 2 }}>
                {receipt.paymentTypeLabel}
                {receipt.agreementNumber ? ` · Agreement ${receipt.agreementNumber}` : ""}
              </Text>
            </View>
            <Text style={styles.colAmt}>{receipt.amountLabel}</Text>
          </View>
        </View>

        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>Amount Paid</Text>
          <Text style={styles.totalLabel}>{receipt.amountLabel}</Text>
        </View>

        <Text style={styles.thanks}>Thank you for your business. This receipt confirms payment was received by Winsalot Corp.</Text>
        <Text style={styles.footer}>Winsalot Corp. · 647-300-1270 · info@winsalotcorp.com · winsalotcorp.com</Text>
      </Page>
    </Document>
  );
}

export async function renderReceiptPdfBuffer(receipt: ReceiptData): Promise<Buffer> {
  return renderToBuffer(<ReceiptPdfDocument receipt={receipt} />);
}
