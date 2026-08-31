import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { LEADGEN_PRODUCTION_ORIGIN } from "@/lib/client-portal-shared";
import { isDedicatedClientAuthIdentity } from "@/lib/client-auth-identity";

const ALLOWED_NEXT = new Set(["/client/setup", "/client/reset-password"]);

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const requestedNext = url.searchParams.get("next") || "/client/setup";
  const nextPath = ALLOWED_NEXT.has(requestedNext) ? requestedNext : "/client/setup";

  if (!tokenHash || type !== "recovery") {
    return NextResponse.redirect(
      `${LEADGEN_PRODUCTION_ORIGIN}/client?error=${encodeURIComponent("This client portal link is invalid or incomplete. Please request a new one.")}`
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "recovery",
  });

  if (error || !data.user) {
    return NextResponse.redirect(
      `${LEADGEN_PRODUCTION_ORIGIN}/client?error=${encodeURIComponent("This client portal link has expired or has already been used. Please request a new one.")}`
    );
  }

  const { data: portalUser } = await supabase
    .from("leadgen_users")
    .select("id, role, client_id")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!portalUser || portalUser.role !== "client" || !portalUser.client_id) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      `${LEADGEN_PRODUCTION_ORIGIN}/client?error=${encodeURIComponent("This link is not associated with a Winsalot client portal account.")}`
    );
  }


  if (!(await isDedicatedClientAuthIdentity(data.user.id))) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      `${LEADGEN_PRODUCTION_ORIGIN}/client?error=${encodeURIComponent("Staff accounts cannot be changed through the Client Portal. Use a separate client-only email address.")}`
    );
  }

  return NextResponse.redirect(`${LEADGEN_PRODUCTION_ORIGIN}${nextPath}`);
}
