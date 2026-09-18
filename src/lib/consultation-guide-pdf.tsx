import "server-only";
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { WINSALOT_LOGO_DATA_URI } from "./winsalot-logo-base64";
import {
  CONSULTATION_GUIDE_CAMPAIGN_EXPECTATION_QUESTIONS,
  CONSULTATION_GUIDE_CHECKLIST_ITEMS,
  CONSULTATION_GUIDE_DISCOVERY_QUESTIONS,
  CONSULTATION_GUIDE_LEADGEN_FIT_QUESTIONS,
  CONSULTATION_GUIDE_LENDING_FIT_QUESTIONS,
  CONSULTATION_GUIDE_STATUS_LABELS,
  CONSULTATION_GUIDE_SERVICE_LABELS,
  CONSULTATION_GUIDE_SUMMARY_FIELDS,
  LEADGEN_FIT_STATUS_LABELS,
  LENDING_FIT_STATUS_LABELS,
  type CrmConsultationGuideRow,
} from "./consultation-guide";

// Admin-only downloadable record of a Client Consultation Guide, same
// @react-pdf/renderer approach (and brand header) as the existing
// Invoice/Agreement PDFs (crm-invoice-pdf.tsx, crm-agreement-pdf.tsx) -
// server-rendered, no Chromium dependency, works unmodified on Vercel.
// This is an internal record for Admin (includes the internal fee/
// warning reminders that must never be shown to a client) - never
// generated or sent automatically to the prospect.

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 9.5, fontFamily: "Helvetica", color: "#1e293b" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  brandRow: { flexDirection: "row", alignItems: "center" },
  logo: { width: 32, height: 32, marginRight: 8 },
  brand: { fontSize: 16, fontWeight: 700, color: "#1e3a8a" },
  tagline: { fontSize: 8, color: "#475569", marginTop: 2 },
  title: { fontSize: 16, fontWeight: 700, color: "#1e293b", textAlign: "right" },
  meta: { fontSize: 8.5, color: "#475569", textAlign: "right", marginTop: 2 },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: "#1e3a8a", marginBottom: 6, borderBottomWidth: 1, borderBottomColor: "#dbeafe", paddingBottom: 3 },
  fieldGrid: { flexDirection: "row", flexWrap: "wrap" },
  field: { width: "50%", marginBottom: 6, paddingRight: 8 },
  label: { fontSize: 7.5, color: "#94a3b8", textTransform: "uppercase" },
  value: { fontSize: 9.5, color: "#1e293b", marginTop: 1 },
  qa: { marginBottom: 6 },
  question: { fontSize: 8.5, fontWeight: 700, color: "#334155" },
  answer: { fontSize: 9, color: "#1e293b", marginTop: 1 },
  statusBadge: { fontSize: 8.5, fontWeight: 700, color: "#1e3a8a", marginBottom: 6 },
  checklistItem: { fontSize: 9, marginBottom: 3 },
  reminder: { fontSize: 8, color: "#78350f", backgroundColor: "#fffbeb", padding: 6, marginTop: 4 },
  warning: { fontSize: 8, color: "#7f1d1d", backgroundColor: "#fef2f2", padding: 6, marginTop: 4 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, textAlign: "center", fontSize: 7.5, color: "#94a3b8", borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 6 },
});

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value || "—"}</Text>
    </View>
  );
}

function QuestionAnswers({ questions, answers }: { questions: readonly { key: string; label: string }[]; answers: Record<string, string> }) {
  return (
    <>
      {questions.map((q) => (
        <View key={q.key} style={styles.qa}>
          <Text style={styles.question}>{q.label}</Text>
          <Text style={styles.answer}>{answers[q.key] || "—"}</Text>
        </View>
      ))}
    </>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export function ConsultationGuidePdfDocument({ guide }: { guide: CrmConsultationGuideRow }) {
  const checkedItems = CONSULTATION_GUIDE_CHECKLIST_ITEMS.filter((item) => guide.checklist?.[item.key]);

  return (
    <Document title={`Consultation Guide - ${guide.business_name || "Untitled"}`}>
      <Page size="LETTER" style={styles.page} wrap>
        <View style={styles.header}>
          <View>
            <View style={styles.brandRow}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's own Image element, not an HTML <img> - it has no alt prop at all. */}
              <Image src={WINSALOT_LOGO_DATA_URI} style={styles.logo} />
              <Text style={styles.brand}>Winsalot Corp.</Text>
            </View>
            <Text style={styles.tagline}>Empowering Businesses, One Solution at a Time.</Text>
          </View>
          <View>
            <Text style={styles.title}>Client Consultation Guide</Text>
            <Text style={styles.meta}>Status: {CONSULTATION_GUIDE_STATUS_LABELS[guide.status]}</Text>
            <Text style={styles.meta}>Consultation Date: {formatDate(guide.consultation_date)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Consultation Details</Text>
          <View style={styles.fieldGrid}>
            <Field label="Business Name" value={guide.business_name} />
            <Field label="Contact Name" value={guide.contact_name} />
            <Field label="Phone" value={guide.phone} />
            <Field label="Email" value={guide.email} />
            <Field label="Industry" value={guide.industry} />
            <Field label="Location" value={guide.location} />
            <Field label="Consultant" value={guide.consultant_name} />
            <Field label="Service" value={guide.service ? CONSULTATION_GUIDE_SERVICE_LABELS[guide.service] : null} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Business &amp; Growth Discovery</Text>
          <QuestionAnswers questions={CONSULTATION_GUIDE_DISCOVERY_QUESTIONS} answers={guide.discovery ?? {}} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lead Generation / Appointment-Setting Fit</Text>
          {guide.leadgen_fit_status && (
            <Text style={styles.statusBadge}>Fit: {LEADGEN_FIT_STATUS_LABELS[guide.leadgen_fit_status]}</Text>
          )}
          <QuestionAnswers questions={CONSULTATION_GUIDE_LEADGEN_FIT_QUESTIONS} answers={guide.leadgen_fit ?? {}} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Campaign Expectations &amp; Handoff</Text>
          <QuestionAnswers questions={CONSULTATION_GUIDE_CAMPAIGN_EXPECTATION_QUESTIONS} answers={guide.campaign_expectations ?? {}} />
          <Text style={styles.reminder}>
            INTERNAL: Standard Lead Generation fee: $750/month. Do not offer or mention a pilot program unless approved by Admin.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Business Lending Support Fit</Text>
          {guide.lending_fit_status && (
            <Text style={styles.statusBadge}>Fit: {LENDING_FIT_STATUS_LABELS[guide.lending_fit_status]}</Text>
          )}
          <QuestionAnswers questions={CONSULTATION_GUIDE_LENDING_FIT_QUESTIONS} answers={guide.lending_fit ?? {}} />
          <Text style={styles.warning}>
            INTERNAL: Do not promise an approval, rate, term, or funding amount. Eligibility and offers are determined by the lender after review.
          </Text>
        </View>

        <View style={styles.section} break>
          <Text style={styles.sectionTitle}>Consultation Summary</Text>
          <View style={styles.fieldGrid}>
            {CONSULTATION_GUIDE_SUMMARY_FIELDS.map((field) => (
              <Field
                key={field.key}
                label={field.label}
                value={field.key === "follow_up_date" ? formatDate((guide.summary ?? {})[field.key] ?? null) : (guide.summary ?? {})[field.key] ?? null}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Final Checklist</Text>
          {checkedItems.length === 0 ? (
            <Text style={styles.value}>No items confirmed yet.</Text>
          ) : (
            checkedItems.map((item) => (
              <Text key={item.key} style={styles.checklistItem}>
                ✓ {item.label}
              </Text>
            ))
          )}
        </View>

        {guide.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.value}>{guide.notes}</Text>
          </View>
        )}

        <Text style={styles.footer} fixed>
          Winsalot Corp. · Internal record - not for distribution to clients · 647-300-1270 · info@winsalotcorp.com
        </Text>
      </Page>
    </Document>
  );
}

export async function renderConsultationGuidePdfBuffer(guide: CrmConsultationGuideRow): Promise<Buffer> {
  return renderToBuffer(<ConsultationGuidePdfDocument guide={guide} />);
}
