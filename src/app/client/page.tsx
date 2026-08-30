import { clientLoginAction } from "./actions";

// The Client Portal's own login page (brief: "MAIN CLIENT PORTAL
// LOCATION" - https://leads.winsalotcorp.com/client). Same visual style
// as /leadgen/login (this deployment's other Lead Gen CRM login screen),
// but its own page/action - see clientLoginAction's own comment for why.
export default async function ClientPortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="crm-theme flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-8 shadow-sm">
        <h1 className="font-heading text-xl font-bold text-[var(--color-ink-strong)]">Client Portal Sign In</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Winsalot Corp</p>

        <form action={clientLoginAction} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="text-sm font-medium text-[var(--color-ink)]">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              className="mt-1.5 w-full rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-3 text-base text-[var(--color-ink-strong)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-soft)]"
            />
          </div>

          <div>
            <label htmlFor="password" className="text-sm font-medium text-[var(--color-ink)]">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1.5 w-full rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-3 text-base text-[var(--color-ink-strong)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-soft)]"
            />
          </div>

          {params.error && <p className="text-sm text-red-600">{params.error}</p>}

          <button
            type="submit"
            className="w-full rounded-full bg-[var(--color-accent)] px-4 py-3 text-base font-semibold text-white transition hover:opacity-90"
          >
            Sign In
          </button>
        </form>

        <a href="/leadgen/forgot-password" className="mt-4 block text-center text-sm font-medium text-[var(--color-accent)]">
          Forgot password?
        </a>
      </div>
    </div>
  );
}
