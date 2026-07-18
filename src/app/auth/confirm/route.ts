import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// Handles Supabase's modern email-link confirmation format
// (?token_hash=...&type=...), used by both the agent invite and forgot-
// password emails. Verifying here (server-side, via the cookie-based
// client) establishes a real session cookie before redirecting into the
// app, so /agent/set-password just needs to check "is there a session" -
// it doesn't need to know how that session was established.
//
// Some Supabase project configurations instead deliver a hash fragment
// (#access_token=...) that never reaches the server at all; that case is
// handled client-side directly on /agent/set-password.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/agent/set-password";

  if (tokenHash && type) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(
    new URL(
      `/agent/set-password?error=${encodeURIComponent("This link is invalid or has expired.")}`,
      request.url
    )
  );
}
