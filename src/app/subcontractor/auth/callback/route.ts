import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSiteUrl } from "@/lib/site-url";

const ALLOWED_NEXT = new Set(["/subcontractor/setup", "/subcontractor/reset-password"]);

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const next = request.nextUrl.searchParams.get("next") || "/subcontractor/setup";
  const destination = ALLOWED_NEXT.has(next) ? next : "/subcontractor/setup";
  const origin = getSiteUrl();
  if (!tokenHash || request.nextUrl.searchParams.get("type") !== "recovery") return NextResponse.redirect(`${origin}/subcontractor?error=${encodeURIComponent("This portal link is invalid or incomplete.")}`);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
  if (error || !data.user) return NextResponse.redirect(`${origin}/subcontractor?error=${encodeURIComponent("This portal link has expired or has already been used.")}`);
  const { data: profile } = await supabase.from("crm_subcontractors").select("id").eq("auth_user_id", data.user.id).eq("active", true).eq("portal_active", true).maybeSingle();
  if (!profile) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/subcontractor?error=${encodeURIComponent("This link is not associated with an active Winsalot subcontractor.")}`);
  }
  return NextResponse.redirect(`${origin}${destination}`);
}
