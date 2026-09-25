import { redirect } from "next/navigation";
import { requireLeadgenUser } from "@/lib/leadgen-auth";
import { leadgenHomeForRole } from "@/lib/leadgen-role";

// Role router: the single post-login landing spot for every Lead
// Generation CRM account. requireLeadgenUser() bounces a signed-out
// visitor to /leadgen/login; from there this just dispatches by role so
// neither the login action nor src/proxy.ts needs to know it.
export default async function LeadgenRootPage() {
  const user = await requireLeadgenUser();

  redirect(leadgenHomeForRole(user.role));
}
