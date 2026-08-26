import { unsubscribeByToken } from "@/lib/crm-email-suppression";

// Public, unauthenticated confirmation page - the destination of the
// unsubscribe link embedded in every Growth CRM prospect email's footer
// (src/lib/prospect-email-templates.ts). Not covered by src/proxy.ts's
// matcher (["/", "/admin/:path*", "/agent/:path*", "/leadgen/:path*"]), so
// no Supabase session is expected or required here, same as the Resend
// webhook route.
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await unsubscribeByToken(token);

  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ maxWidth: 440, textAlign: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Winsalot Corp</h1>
        {"error" in result ? (
          <p style={{ fontSize: 15, color: "#374151" }}>{result.error}</p>
        ) : (
          <>
            <p style={{ fontSize: 15, color: "#374151" }}>
              <strong>{result.email}</strong> has been unsubscribed and will not receive further promotional
              emails from Winsalot Corp.
            </p>
            <p style={{ fontSize: 13, color: "#6b7280", marginTop: 12 }}>
              If this was a mistake, contact us at info@winsalotcorp.com.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
