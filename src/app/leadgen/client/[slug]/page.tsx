import { redirect } from "next/navigation";
import { requireLeadgenClient } from "@/lib/leadgen-auth";

// Legacy slug-based Client Portal URL, kept as a thin redirect so a
// stale bookmark or previously-sent email link keeps working. The real
// implementation now lives at the slug-free /client/dashboard (see
// requireLeadgenPortalClient in src/lib/leadgen-auth.ts) - identity comes
// entirely from the signed-in session, not this URL's slug, so there is
// no security reason to keep rendering a second copy of the dashboard
// here. requireLeadgenClient(slug) still runs first so visiting another
// client's slug 404s exactly as it always has, rather than silently
// forwarding to this visitor's own dashboard.
export default async function LegacyLeadgenClientDashboardRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireLeadgenClient(slug);
  redirect("/client/dashboard");
}
