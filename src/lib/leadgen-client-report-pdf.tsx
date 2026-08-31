import "server-only";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { LeadgenClientReport } from "./leadgen-client-report";
import { WINSALOT_LOGO_DATA_URI } from "./winsalot-logo-base64";

const styles = StyleSheet.create({
  page: { padding: 38, fontFamily: "Helvetica", fontSize: 9, color: "#1e293b" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 22 },
  brandRow: { flexDirection: "row", alignItems: "center" },
  logo: { width: 34, height: 34, marginRight: 9 },
  brand: { fontSize: 19, fontWeight: 700, color: "#1e3a8a" },
  tagline: { marginTop: 2, color: "#64748b" },
  title: { fontSize: 17, fontWeight: 700, textAlign: "right" },
  meta: { marginTop: 3, color: "#64748b", textAlign: "right" },
  clientBlock: { padding: 13, borderRadius: 5, backgroundColor: "#eff6ff", marginBottom: 18 },
  clientName: { fontSize: 14, fontWeight: 700, color: "#1e3a8a" },
  campaign: { marginTop: 3, color: "#475569" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 },
  metric: { width: "31.8%", padding: 10, borderWidth: 1, borderColor: "#dbeafe", borderRadius: 4 },
  metricLabel: { fontSize: 7, color: "#64748b", textTransform: "uppercase" },
  metricValue: { marginTop: 4, fontSize: 16, fontWeight: 700, color: "#1e3a8a" },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: "#0f172a", marginBottom: 7 },
  body: { color: "#475569", lineHeight: 1.5 },
  tableHeader: { flexDirection: "row", padding: 6, backgroundColor: "#1e3a8a" },
  tableRow: { flexDirection: "row", padding: 6, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  th: { color: "#ffffff", fontSize: 7, fontWeight: 700 },
  td: { fontSize: 8 },
  date: { width: "16%" },
  business: { width: "30%" },
  contact: { width: "22%" },
  type: { width: "16%" },
  status: { width: "16%" },
  footer: { position: "absolute", bottom: 24, left: 38, right: 38, paddingTop: 7, borderTopWidth: 1, borderTopColor: "#e2e8f0", textAlign: "center", color: "#94a3b8", fontSize: 7 },
});

export function LeadgenClientReportPdf({ report }: { report: LeadgenClientReport }) {
  const metrics = [
    ["Leads Generated", report.leadsAdded],
    ["Interested / Qualified Leads", report.interestedLeads],
    ["Appointments Booked", report.appointmentsBooked],
  ];

  return (
    <Document title={`${report.client.name} Performance Report`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View>
            <View style={styles.brandRow}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image is not an HTML image. */}
              <Image src={WINSALOT_LOGO_DATA_URI} style={styles.logo} />
              <Text style={styles.brand}>Winsalot Corp</Text>
            </View>
            <Text style={styles.tagline}>Empowering Businesses, One Solution at a Time.</Text>
          </View>
          <View>
            <Text style={styles.title}>CLIENT PERFORMANCE REPORT</Text>
            <Text style={styles.meta}>{report.period.from} to {report.period.to}</Text>
          </View>
        </View>

        <View style={styles.clientBlock}>
          <Text style={styles.clientName}>{report.client.name}</Text>
          <Text style={styles.campaign}>{report.campaign?.name ?? "Lead Generation Campaign"}</Text>
        </View>

        <View style={styles.metrics}>
          {metrics.map(([label, value]) => (
            <View style={styles.metric} key={String(label)}>
              <Text style={styles.metricLabel}>{label}</Text>
              <Text style={styles.metricValue}>{value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Performance Summary</Text>
          <Text style={styles.body}>{report.summary}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recommended Next Step</Text>
          <Text style={styles.body}>{report.nextStep}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appointments</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.date]}>Date</Text>
            <Text style={[styles.th, styles.business]}>Business</Text>
            <Text style={[styles.th, styles.contact]}>Contact</Text>
            <Text style={[styles.th, styles.type]}>Type</Text>
            <Text style={[styles.th, styles.status]}>Status</Text>
          </View>
          {report.appointments.length === 0 ? (
            <View style={styles.tableRow}><Text style={styles.td}>No appointments during this period.</Text></View>
          ) : report.appointments.slice(0, 25).map((appointment) => (
            <View style={styles.tableRow} key={appointment.id} wrap={false}>
              <Text style={[styles.td, styles.date]}>{appointment.appointment_date}</Text>
              <Text style={[styles.td, styles.business]}>{appointment.business_name}</Text>
              <Text style={[styles.td, styles.contact]}>{appointment.contact_name ?? "-"}</Text>
              <Text style={[styles.td, styles.type]}>{appointment.meeting_type}</Text>
              <Text style={[styles.td, styles.status]}>{appointment.status}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.footer} fixed>Winsalot Corp · info@winsalotcorp.com · winsalotcorp.com</Text>
      </Page>
    </Document>
  );
}

export async function renderLeadgenClientReportPdf(report: LeadgenClientReport): Promise<Buffer> {
  return renderToBuffer(<LeadgenClientReportPdf report={report} />);
}
