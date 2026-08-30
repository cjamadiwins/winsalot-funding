import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requestClientPasswordResetAction } from "../actions";
import { updateClientPortalPasswordAction } from "./actions";

export default async function ClientResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  return (
    <div className="crm-theme flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-8 shadow-sm">
        <p className="text-sm font-semibold text-[var(--color-accent)]">Winsalot Corp</p>
        <h1 className="mt-1 font-heading text-2xl font-bold text-[var(--color-ink-strong)]">
          {data.user ? "Choose a new password" : "Reset Client Portal password"}
        </h1>

        {data.user ? (
          <>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">Enter a new password for your Winsalot Client Portal.</p>
            <form action={updateClientPortalPasswordAction} className="mt-6 space-y-4">
              <div>
                <label htmlFor="password" className="text-sm font-medium text-[var(--color-ink)]">New password</label>
                <input id="password" name="password" type="password" minLength={12} required autoComplete="new-password" className="mt-1.5 w-full rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-3 text-base" />
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">Use at least 12 characters.</p>
              </div>
              <div>
                <label htmlFor="confirm_password" className="text-sm font-medium text-[var(--color-ink)]">Confirm new password</label>
                <input id="confirm_password" name="confirm_password" type="password" minLength={12} required autoComplete="new-password" className="mt-1.5 w-full rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-3 text-base" />
              </div>
              {params.error && <p className="text-sm text-red-600">{params.error}</p>}
              <button type="submit" className="w-full rounded-full bg-[var(--color-accent)] px-4 py-3 text-base font-semibold text-white">Save New Password</button>
            </form>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">Enter the email used for your Client Portal. If it matches an active client account, we will send a secure Winsalot reset link.</p>
            <form action={requestClientPasswordResetAction} className="mt-6 space-y-4">
              <div>
                <label htmlFor="email" className="text-sm font-medium text-[var(--color-ink)]">Email</label>
                <input id="email" name="email" type="email" required autoComplete="email" className="mt-1.5 w-full rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-3 text-base" />
              </div>
              {params.error && <p className="text-sm text-red-600">{params.error}</p>}
              {params.message && <p className="text-sm text-emerald-700">{params.message}</p>}
              <button type="submit" className="w-full rounded-full bg-[var(--color-accent)] px-4 py-3 text-base font-semibold text-white">Send Reset Link</button>
            </form>
          </>
        )}

        <a href="/client" className="mt-5 block text-center text-sm font-medium text-[var(--color-accent)]">Back to Client Portal sign in</a>
      </div>
    </div>
  );
}
