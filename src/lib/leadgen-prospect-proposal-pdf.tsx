import "server-only";
import { Document, Page, Text, View, Image, Link, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { WINSALOT_LOGO_DATA_URI } from "./winsalot-logo-base64";
import type { ProspectProposalContent } from "./leadgen-prospect-proposal";

// Prospect-facing proposal PDF, prepared by Winsalot Corp. on behalf of the
// client. Branded with the client's NAME and Winsalot's existing logo: no
// client logo is invented. Everything shown comes from the saved proposal
// content, so the downloaded and the emailed PDF are always identical.

const BRAND = "#0f3d6e";
const ACCENT = "#0e7490";

const styles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 58, fontSize: 9.5, fontFamily: "Helvetica", color: "#1e293b", lineHeight: 1.4 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: BRAND },
  clientName: { fontSize: 19, fontFamily: "Helvetica-Bold", color: BRAND, marginBottom: 4 },
  clientSub: { fontSize: 8.5, color: "#64748b" },
  logo: { width: 40, height: 40 },
  title: { fontSize: 16.5, fontFamily: "Helvetica-Bold", color: "#0f172a", marginTop: 18 },
  subtitle: { fontSize: 9.5, color: "#475569", marginTop: 5 },
  forBox: { marginTop: 12, padding: 10, backgroundColor: "#f1f5f9", borderRadius: 4 },
  forLabel: { fontSize: 7.5, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.6 },
  forName: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#0f172a", marginTop: 3, marginBottom: 2 },
  forLine: { fontSize: 9.5, color: "#334155", marginTop: 1.5 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", color: BRAND, marginTop: 13, marginBottom: 5 },
  p: { marginBottom: 5 },
  bulletRow: { flexDirection: "row", marginBottom: 3, paddingRight: 6 },
  bulletDot: { width: 12, color: ACCENT, fontFamily: "Helvetica-Bold" },
  bulletText: { flex: 1 },
  know: { marginTop: 10, padding: 10, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 4 },
  knowTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#334155", marginBottom: 4 },
  cta: { marginTop: 14, padding: 12, backgroundColor: "#ecfeff", borderWidth: 1, borderColor: "#67e8f9", borderRadius: 4 },
  ctaTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#155e75", marginBottom: 5 },
  ctaLink: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#0369a1", marginTop: 4 },
  disclaimerBox: { marginTop: 16 },
  disclaimer: { fontSize: 8, color: "#64748b", marginBottom: 3 },
  footer: { position: "absolute", bottom: 22, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: "#94a3b8", borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 6 },
});

function Bullets({ items }: { items: string[] }) {
  return (
    <View>
      {items.map((b) => (
        <View key={b} style={styles.bulletRow} wrap={false}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{b}</Text>
        </View>
      ))}
    </View>
  );
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export function ProspectProposalPdf({ content }: { content: ProspectProposalContent }) {
  const c = content;
  const forLines = [c.preparedFor.contact ? `Attention: ${c.preparedFor.contact}` : null, c.preparedFor.location, c.preparedFor.industry, c.preparedFor.website].filter((l): l is string => Boolean(l));
  return (
    <Document title={`${c.title} - ${c.preparedFor.business}`} author="Winsalot Corp." subject={`Proposal from ${c.clientName}`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.clientName}>{c.clientName}</Text>
            <Text style={styles.clientSub}>Proposal prepared by Winsalot Corp. on behalf of {c.clientName}</Text>
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
          <Image src={WINSALOT_LOGO_DATA_URI} style={styles.logo} />
        </View>

        <Text style={styles.title}>{c.title}</Text>
        <Text style={styles.subtitle}>Prepared {formatDate(c.preparedOn)}</Text>

        <View style={styles.forBox}>
          <Text style={styles.forLabel}>Prepared for</Text>
          <Text style={styles.forName}>{c.preparedFor.business}</Text>
          {forLines.map((l) => (
            <Text key={l} style={styles.forLine}>
              {l}
            </Text>
          ))}
        </View>

        <View style={{ marginTop: 12 }}>
          {c.intro.map((t) => (
            <Text key={t} style={styles.p}>
              {t}
            </Text>
          ))}
        </View>

        <View style={styles.know} wrap={false}>
          <Text style={styles.knowTitle}>What we know today</Text>
          <Bullets items={c.whatWeKnow} />
        </View>

        {c.sections.map((s) => (
          <View key={s.heading}>
            <Text style={styles.h2} minPresenceAhead={60}>
              {s.heading}
            </Text>
            {(s.paragraphs ?? []).map((t) => (
              <Text key={t} style={styles.p}>
                {t}
              </Text>
            ))}
            {s.bullets && <Bullets items={s.bullets} />}
          </View>
        ))}

        <View style={styles.cta} wrap={false}>
          <Text style={styles.ctaTitle}>{c.nextStep.heading}</Text>
          {c.nextStep.paragraphs.map((t) => (
            <Text key={t} style={styles.p}>
              {t}
            </Text>
          ))}
          {c.nextStep.bookingUrl && (
            <Link src={c.nextStep.bookingUrl} style={styles.ctaLink}>
              {c.nextStep.bookingLabel}: {c.nextStep.bookingUrl}
            </Link>
          )}
        </View>

        <View style={styles.disclaimerBox} wrap={false}>
          {c.disclaimer.map((t) => (
            <Text key={t} style={styles.disclaimer}>
              {t}
            </Text>
          ))}
        </View>

        <View style={styles.footer} fixed>
          <Text>
            {c.clientName} · prepared by Winsalot Corp. · info@winsalotcorp.com
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderProspectProposalPdf(content: ProspectProposalContent): Promise<Buffer> {
  return renderToBuffer(<ProspectProposalPdf content={content} />);
}
