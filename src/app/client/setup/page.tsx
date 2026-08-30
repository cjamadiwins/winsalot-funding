import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { completeClientPortalSetupAction } from "./actions";

export default async function ClientPortalSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect(`/client?error=${encodeURIComponent("Your setup link has expired. Please request a new invitation.")}`);
  }

  const { data: portalUser } = await supabase
    .from("leadgen_users")
    .select("role, client_id")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!portalUser || portalUser.role !== "client" || !portalUser.client_id) {
    await supabase.auth.signOut();
    redirect(`/client?error=${encodeURIComponent("This account is not a Winsalot client portal account.")}`);
  }

  return (
    <div className="crm-theme flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-8 shadow-sm">
        <p className="text-sm font-semibold text-[var(--color-accent)]">Winsalot Corp</p>
        <h1 className="mt-1 font-heading text-2xl font-bold text-[var(--color-ink-strong)]">Set up your Client Portal</h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">Choose a secure password to finish creating your Winsalot Client Portal access.</p>

        <form action={completeClientPortalSetupAction} className="mt-6 space-y-4">
          <div>
            <label htmlFor="password" className="text-sm font-medium text-[var(--color-ink)]">Password</label>
            <input id="password" name="password" type="password" minLength={12} required autoComplete="new-password" className="mt-1.5 w-full rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-3 text-base" />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">Use at least 12 characters.</p>
          </div>
          <div>
            <label htmlFor="confirm_password" className="text-sm font-medium text-[var(--color-ink)]">Confirm password</label>
            <input id="confirm_password" name="confirm_password" type="password" minLength={12} required autoComplete="new-password" className="mt-1.5 w-full rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-3 text-base" />
          </div>
          {params.error && <p className="text-sm text-red-600">{params.error}</p>}
          <button type="submit" className="w-full rounded-full bg-[var(--color-accent)] px-4 py-3 text-base font-semibold text-white">Set Password & Continue</button>
        </form>
      </div>
    </div>
  );
}
