import { redirect } from "next/navigation";
import { requireLeadgenUser } from "@/lib/leadgen-auth";

// Role router: the single post-login landing spot for every Lead
// Generation CRM account. requireLeadgenUser() bounces a signed-out
// visitor to /leadgen/login; from there this just dispatches by role so
// neither the login action nor src/proxy.ts needs to know it.
export default async function LeadgenRootPage() {
  const user = await requireLeadgenUser();

  if (user.role === "admin") redirect("/leadgen/admin");
  if (user.role === "agent") redirect("/leadgen/agent");

  // role === "client" - the canonical, slug-free Client Portal (see
  // requireLeadgenPortalClient in src/lib/leadgen-auth.ts).
  redirect("/client/dashboard");
}
