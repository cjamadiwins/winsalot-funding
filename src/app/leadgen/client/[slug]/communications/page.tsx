import { redirect } from "next/navigation";
import { requireLeadgenClient } from "@/lib/leadgen-auth";

// Legacy slug-based URL - see src/app/leadgen/client/[slug]/page.tsx for
// why this is now a thin redirect into the canonical /client/communications.
export default async function LegacyLeadgenClientCommunicationsRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireLeadgenClient(slug);
  redirect("/client/communications");
}
