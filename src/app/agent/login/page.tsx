import { agentLoginAction } from "./actions";

export default async function AgentLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirectTo?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-8 shadow-sm">
        <h1 className="font-heading text-xl font-bold text-[var(--color-ink-strong)]">
          Agent Sign In
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Winsalot CRM</p>

        <form action={agentLoginAction} className="mt-6 space-y-4">
          <input
            type="hidden"
            name="redirectTo"
            value={params.redirectTo ?? "/agent/dashboard"}
          />

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
      </div>
    </div>
  );
}
