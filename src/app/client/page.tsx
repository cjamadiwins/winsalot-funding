import { clientLoginAction } from "./actions";

export default async function ClientPortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="crm-theme flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-8 shadow-sm">
        <p className="text-sm font-semibold text-[var(--color-accent)]">Winsalot Corp</p>
        <h1 className="mt-1 font-heading text-xl font-bold text-[var(--color-ink-strong)]">Client Portal Sign In</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Secure access to your campaign progress, leads, appointments and reports.</p>

        <form action={clientLoginAction} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="text-sm font-medium text-[var(--color-ink)]">Email</label>
            <input id="email" name="email" type="email" required autoComplete="username" className="mt-1.5 w-full rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-3 text-base text-[var(--color-ink-strong)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-soft)]" />
          </div>
          <div>
            <label htmlFor="password" className="text-sm font-medium text-[var(--color-ink)]">Password</label>
            <input id="password" name="password" type="password" required autoComplete="current-password" className="mt-1.5 w-full rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-3 text-base text-[var(--color-ink-strong)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-soft)]" />
          </div>

          {params.error && <p className="text-sm text-red-600">{params.error}</p>}
          {params.message && <p className="text-sm text-emerald-700">{params.message}</p>}

          <button type="submit" className="w-full rounded-full bg-[var(--color-accent)] px-4 py-3 text-base font-semibold text-white transition hover:opacity-90">Sign In</button>
        </form>

        <a href="/client/reset-password" className="mt-4 block text-center text-sm font-medium text-[var(--color-accent)]">Forgot password?</a>
      </div>
    </div>
  );
}
