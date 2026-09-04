import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { getResendClient } from "./resend";
import { getEmailReplyTo, getEmailSender } from "./email-senders";
import { getSiteUrl } from "./site-url";

export async function sendSubcontractorPortalEmail(input: { kind: "invite" | "reset"; email: string; fullName: string }) {
  const admin = getSupabaseAdmin();
  const next = input.kind === "invite" ? "/subcontractor/setup" : "/subcontractor/reset-password";
  const origin = getSiteUrl();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: input.email,
    options: { redirectTo: `${origin}/subcontractor/auth/callback` },
  });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) return { error: error?.message ?? "Could not create a secure access link." };

  const callback = new URL("/subcontractor/auth/callback", origin);
  callback.searchParams.set("token_hash", tokenHash);
  callback.searchParams.set("type", "recovery");
  callback.searchParams.set("next", next);
  const invite = input.kind === "invite";
  const subject = invite ? "Your Winsalot Subcontractor Portal is ready" : "Reset your Winsalot Subcontractor Portal password";
  const heading = invite ? "Set up your subcontractor portal" : "Reset your portal password";
  const message = invite
    ? "Your secure portal is ready. Use it to review and sign your agreement, record assigned calls, and view approved payment records."
    : "A password reset was requested for your subcontractor portal.";
  const action = invite ? "SET UP MY PORTAL" : "RESET MY PASSWORD";
  const text = `Hi ${input.fullName},\n\n${message}\n\n${action}: ${callback.toString()}\n\nIf you have questions, reply to this email.\n\nWinsalot Corp`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1e293b"><h2 style="color:#1e3a8a">${heading}</h2><p>Hi ${input.fullName},</p><p>${message}</p><p style="margin:28px 0"><a href="${callback.toString()}" style="background:#0284c7;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">${action}</a></p><p>If you have questions, reply to this email.</p><p>Winsalot Corp</p></div>`;
  const result = await getResendClient().emails.send({ from: getEmailSender("growth"), to: input.email, replyTo: getEmailReplyTo(), subject, text, html });
  if (result.error) return { error: result.error.message };
  return {};
}
