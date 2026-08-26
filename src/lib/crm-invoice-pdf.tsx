import "server-only";
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { CrmInvoiceRow, CrmInvoiceLineItemRow } from "./crm-invoices-types";
import { formatCurrency } from "./crm-clients-types";
import { WINSALOT_LOGO_DATA_URI } from "./winsalot-logo-base64";

// Professional Winsalot Corp branded invoice PDF - same brand language
// (dark-blue header, "Empowering Businesses, One Solution at a Time.",
// contact info) as the existing consultation-booking emails
// (src/lib/winsalot-consultation-emails.ts). Rendered server-side with
// @react-pdf/renderer, which draws its own PDF primitives rather than
// screenshotting a browser - no Chromium/Puppeteer dependency, so it
// works unmodified on Vercel serverless.

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1e293b" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  brandRow: { flexDirection: "row", alignItems: "center" },
  logo: { width: 36, height: 36, marginRight: 10 },
  brand: { fontSize: 20, fontWeight: 700, color: "#1e3a8a" },
  tagline: { fontSize: 9, color: "#475569", marginTop: 2 },
  contact: { fontSize: 8, color: "#64748b", marginTop: 8 },
  invoiceTitle: { fontSize: 18, fontWeight: 700, color: "#1e293b", textAlign: "right" },
  invoiceMeta: { fontSize: 9, color: "#475569", textAlign: "right", marginTop: 2 },
  section: { marginBottom: 16 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  label: { fontSize: 8, color: "#94a3b8", textTransform: "uppercase", marginBottom: 2 },
  value: { fontSize: 10, color: "#1e293b" },
  table: { marginTop: 8 },
  tableHeaderRow: { flexDirection: "row", backgroundColor: "#1e3a8a", padding: 6 },
  tableRow: { flexDirection: "row", padding: 6, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  th: { color: "#ffffff", fontSize: 8, fontWeight: 700, textTransform: "uppercase" },
  td: { fontSize: 9 },
  colDesc: { flex: 4 },
  colQty: { flex: 1, textAlign: "right" },
  colRate: { flex: 1.5, textAlign: "right" },
  colTotal: { flex: 1.5, textAlign: "right" },
  totalsBlock: { marginTop: 12, alignItems: "flex-end" },
  totalsRow: { flexDirection: "row", width: 220, justifyContent: "space-between", marginBottom: 4 },
  totalsLabel: { fontSize: 9, color: "#475569" },
  totalsValue: { fontSize: 9, color: "#1e293b" },
  grandTotalRow: { flexDirection: "row", width: 220, justifyContent: "space-between", marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#1e293b" },
  grandTotalLabel: { fontSize: 11, fontWeight: 700 },
  grandTotalValue: { fontSize: 11, fontWeight: 700 },
  notesBlock: { marginTop: 20 },
  notesLabel: { fontSize: 8, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 },
  notesText: { fontSize: 9, color: "#475569", lineHeight: 1.5 },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, textAlign: "center", fontSize: 8, color: "#94a3b8", borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 8 },
});

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export type InvoicePdfProps = {
  invoice: CrmInvoiceRow;
  clientCompanyName: string;
  lineItems: CrmInvoiceLineItemRow[];
};

export function InvoicePdfDocument({ invoice, clientCompanyName, lineItems }: InvoicePdfProps) {
  const currency = invoice.currency;
  return (
    <Document title={`Invoice ${invoice.invoice_number}`}>
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
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoiceMeta}>{invoice.invoice_number}</Text>
            <Text style={styles.invoiceMeta}>Status: {invoice.status}</Text>
          </View>
        </View>

        <View style={styles.sectionRow}>
          <View>
            <Text style={styles.label}>Billed To</Text>
            <Text style={styles.value}>{invoice.billing_contact_name || clientCompanyName}</Text>
            <Text style={styles.value}>{clientCompanyName}</Text>
            {invoice.billing_address ? <Text style={styles.value}>{invoice.billing_address}</Text> : null}
          </View>
          <View>
            <Text style={styles.label}>Issue Date</Text>
            <Text style={styles.value}>{formatDate(invoice.issue_date)}</Text>
            <View style={{ marginTop: 8 }}>
              <Text style={styles.label}>Due Date</Text>
              <Text style={styles.value}>{formatDate(invoice.due_date)}</Text>
            </View>
          </View>
        </View>

        {(invoice.service_period_start || invoice.service_period_end) && (
          <View style={styles.section}>
            <Text style={styles.label}>Service Period</Text>
            <Text style={styles.value}>
              {formatDate(invoice.service_period_start)} - {formatDate(invoice.service_period_end)}
            </Text>
          </View>
        )}

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, styles.colDesc]}>Description</Text>
            <Text style={[styles.th, styles.colQty]}>Qty</Text>
            <Text style={[styles.th, styles.colRate]}>Rate</Text>
            <Text style={[styles.th, styles.colTotal]}>Amount</Text>
          </View>
          {lineItems.map((item) => (
            <View style={styles.tableRow} key={item.id}>
              <Text style={[styles.td, styles.colDesc]}>{item.description}</Text>
              <Text style={[styles.td, styles.colQty]}>{item.quantity}</Text>
              <Text style={[styles.td, styles.colRate]}>{formatCurrency(item.unit_price, currency)}</Text>
              <Text style={[styles.td, styles.colTotal]}>{formatCurrency(item.line_total, currency)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>{formatCurrency(invoice.subtotal, currency)}</Text>
          </View>
          {Number(invoice.discount_amount) > 0 && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Discount</Text>
              <Text style={styles.totalsValue}>-{formatCurrency(invoice.discount_amount, currency)}</Text>
            </View>
          )}
          {Number(invoice.tax_rate) > 0 && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Tax ({invoice.tax_rate}%)</Text>
              <Text style={styles.totalsValue}>{formatCurrency(invoice.tax_amount, currency)}</Text>
            </View>
          )}
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>{formatCurrency(invoice.total, currency)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Amount Paid</Text>
            <Text style={styles.totalsValue}>{formatCurrency(invoice.amount_paid, currency)}</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Balance Due</Text>
            <Text style={styles.grandTotalValue}>{formatCurrency(invoice.balance, currency)}</Text>
          </View>
        </View>

        {invoice.payment_instructions ? (
          <View style={styles.notesBlock}>
            <Text style={styles.notesLabel}>Payment Instructions</Text>
            <Text style={styles.notesText}>{invoice.payment_instructions}</Text>
          </View>
        ) : null}

        {invoice.client_facing_notes ? (
          <View style={styles.notesBlock}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{invoice.client_facing_notes}</Text>
          </View>
        ) : null}

        <Text style={styles.footer} fixed>
          Winsalot Corp · 647-300-1270 · info@winsalotcorp.com · winsalotcorp.com
        </Text>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdfBuffer(props: InvoicePdfProps): Promise<Buffer> {
  return renderToBuffer(<InvoicePdfDocument {...props} />);
}
