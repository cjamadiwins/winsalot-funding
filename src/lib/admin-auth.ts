import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase-server";

// Defense in depth: proxy.ts already blocks unauthenticated requests to
// /admin/*, but Next.js Server Functions can be called directly and are
// not guaranteed to pass through every proxy matcher after a refactor, so
// every admin Server Action calls this too. See the "Execution order" /
// Server Functions note in the Next.js proxy docs.
export async function requireAdminUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/admin/login");
  }

  return data.user;
}
