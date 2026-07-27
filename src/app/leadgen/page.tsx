import { redirect, notFound } from "next/navigation";
import { requireLeadgenUser } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// Role router: the single post-login landing spot for every Lead
// Generation CRM account. requireLeadgenUser() bounces a signed-out
// visitor to /leadgen/login; from there this just dispatches by role so
// neither the login action nor src/proxy.ts needs to know it.
export default async function LeadgenRootPage() {
  const user = await requireLeadgenUser();

  if (user.role === "admin") redirect("/leadgen/admin");
  if (user.role === "agent") redirect("/leadgen/agent");

  // role === "client"
  const supabase = await createSupabaseServerClient();
  const { data: client } = await supabase
    .from("leadgen_clients")
    .select("slug")
    .eq("id", user.client_id as string)
    .maybeSingle();

  if (!client) notFound();
  redirect(`/leadgen/client/${client.slug}`);
}
