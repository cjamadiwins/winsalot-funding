import "server-only";
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { WINSALOT_LOGO_DATA_URI } from "./winsalot-logo-base64";
import { formatAppointmentWhen, type AppointmentBriefRow } from "./leadgen-appointment-prep";
import {
  BRIEF_PREPARED_BY,
  BRIEF_TEMPLATE_WEBSITE_HSO,
  COMBINED_SOLUTION_SUMMARY,
  EXPECTED_OUTCOMES,
  HSO_OBJECTIVES,
  RECOMMENDED_NEXT_STEPS,
  WEBSITE_REDESIGN_OBJECTIVES,
} from "./leadgen-appointment-brief-template";

// Client-facing Appointment Brief PDF. Only brief fields the client portal
// already shows plus the appointment's own contact details - the internal
// Admin note and raw SDR call notes are never inputs.
export type BriefPdfInput = {
  clientName: string;
  businessName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  industry: string | null;
  appointmentDate: string;
  appointmentTime: string;
  timezone: string;
  meetingType: string | null;
  agentName: string | null;
  brief: AppointmentBriefRow;
  // Appointment Quality Control summary lines (first line is the heading/verification label).
  qualificationLines?: string[] | null;
};

const styles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 56, fontSize: 9.5, fontFamily: "Helvetica", color: "#1e293b" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  brandRow: { flexDirection: "row", alignItems: "center" },
  logo: { width: 32, height: 32, marginRight: 8 },
  brand: { fontSize: 16, fontWeight: 700, color: "#1e3a8a" },
  title: { fontSize: 16, fontWeight: 700, textAlign: "right" },
  meta: { fontSize: 8.5, color: "#475569", textAlign: "right", marginTop: 2 },
  section: { marginTop: 12 },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: "#1e3a8a", marginBottom: 5, borderBottomWidth: 1, borderBottomColor: "#dbeafe", paddingBottom: 3 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  field: { width: "50%", marginBottom: 5, paddingRight: 8 },
  label: { fontSize: 7.5, color: "#94a3b8", textTransform: "uppercase" },
  value: { fontSize: 9.5, marginTop: 1 },
  body: { fontSize: 9.5, lineHeight: 1.45, marginBottom: 4 },
  bullet: { fontSize: 9.5, lineHeight: 1.4, marginBottom: 2.5, paddingLeft: 8 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, textAlign: "center", fontSize: 7.5, color: "#94a3b8", borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 6 },
});

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value?.trim() || "-"}</Text>
    </View>
  );
}

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <>
      {items.map((item, i) => (
        <Text key={i} style={styles.bullet}>• {item}</Text>
      ))}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function AppointmentBriefPdf({ input }: { input: BriefPdfInput }) {
  const { brief } = input;
  const isWebsiteHso = brief.brief_template === BRIEF_TEMPLATE_WEBSITE_HSO;
  const norm = (text: string) => text.replace(/\s+/g, " ").replace(/[.!?]+$/, "").trim().toLowerCase();
  const why = norm(brief.why_interested ?? "");
  // The generated summary opens with the "why interested" sentence, which is
  // already printed above it - don't show it twice.
  const summary = (brief.appointment_summary ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && norm(p) !== why);
  const requirements = [brief.main_interest, brief.primary_need].filter((v): v is string => Boolean(v?.trim()));

  return (
    <Document title={`Appointment Brief - ${input.businessName}`} author="Winsalot Corp.">
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Image src={WINSALOT_LOGO_DATA_URI} style={styles.logo} />
            <Text style={styles.brand}>Winsalot Corp.</Text>
          </View>
          <View>
            <Text style={styles.title}>Appointment Brief</Text>
            <Text style={styles.meta}>{input.businessName}</Text>
            <Text style={styles.meta}>{BRIEF_PREPARED_BY}</Text>
          </View>
        </View>

        <Section title="Prospect & Appointment">
          <View style={styles.grid}>
            <Field label="Prospect" value={input.businessName} />
            <Field label="Contact" value={input.contactName} />
            <Field label="Phone" value={input.phone} />
            <Field label="Email" value={input.email} />
            <Field label="Website" value={input.website} />
            <Field label="Industry" value={input.industry} />
            <Field label="Date & time" value={formatAppointmentWhen(input.appointmentDate, input.appointmentTime, input.timezone)} />
            <Field label="Meeting type" value={input.meetingType} />
            <Field label="Winsalot specialist" value={input.agentName} />
            <Field label="Service provider" value={input.clientName} />
          </View>
        </Section>

        {input.qualificationLines && input.qualificationLines.length > 1 && (
          <Section title="Qualification Summary">
            <Text style={styles.body}>{input.qualificationLines[0]}</Text>
            {input.qualificationLines.slice(1).map((line, index) => (
              <Text key={index} style={styles.body}>{line}</Text>
            ))}
          </Section>
        )}

        {(brief.why_interested || summary.length > 0) && (
          <Section title="Customer Requirements & Expressed Interests">
            {brief.why_interested && <Text style={styles.body}>{brief.why_interested}</Text>}
            {requirements.length > 0 && <Bullets items={requirements} />}
            {summary.map((p, i) => (
              <Text key={i} style={styles.body}>{p}</Text>
            ))}
          </Section>
        )}

        {isWebsiteHso && (
          <>
            <Section title="Website Redesign Objectives">
              <Bullets items={WEBSITE_REDESIGN_OBJECTIVES} />
            </Section>
            <Section title="Human Search Optimization (HSO) Objectives">
              <Bullets items={HSO_OBJECTIVES} />
            </Section>
            <Section title="Recommended Combined Solution">
              <Text style={styles.body}>{COMBINED_SOLUTION_SUMMARY}</Text>
            </Section>
          </>
        )}

        {brief.talking_points.length > 0 && (
          <Section title="Key Talking Points">
            <Bullets items={brief.talking_points} />
          </Section>
        )}

        {brief.suggested_questions.length > 0 && (
          <Section title={`Discovery Questions${input.contactName ? ` for ${input.contactName}` : ""}`}>
            <Bullets items={brief.suggested_questions} />
          </Section>
        )}

        <Section title="Expected Consultation Outcome">
          {brief.recommended_objective && <Text style={styles.body}>Objective: {brief.recommended_objective}</Text>}
          {isWebsiteHso && <Bullets items={EXPECTED_OUTCOMES} />}
          {brief.recommended_next_step && (
            <Text style={styles.body}>
              Recommended next step: {brief.recommended_next_step}
              {brief.next_step_note ? ` - ${brief.next_step_note}` : ""}
            </Text>
          )}
        </Section>

        {isWebsiteHso && (
          <Section title="Recommended Next Steps After the Consultation">
            <Bullets items={RECOMMENDED_NEXT_STEPS} />
          </Section>
        )}

        <Text style={styles.footer} fixed>{BRIEF_PREPARED_BY} · info@winsalotcorp.com · winsalotcorp.com</Text>
      </Page>
    </Document>
  );
}

export async function renderAppointmentBriefPdf(input: BriefPdfInput): Promise<Buffer> {
  return renderToBuffer(<AppointmentBriefPdf input={input} />);
}
