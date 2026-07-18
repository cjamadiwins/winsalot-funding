import { requestAgentPasswordResetAction } from "./actions";

export default async function AgentForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const params = await searchParams;
  const sent = params.sent === "1";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-8 shadow-sm">
        <h1 className="font-heading text-xl font-bold text-[var(--color-ink-strong)]">
          Forgot Password
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Winsalot CRM</p>

        {sent ? (
          <p className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            If an account exists for that email, a password reset link has been sent.
          </p>
        ) : (
          <form action={requestAgentPasswordResetAction} className="mt-6 space-y-4">
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

            <button
              type="submit"
              className="w-full rounded-full bg-[var(--color-accent)] px-4 py-3 text-base font-semibold text-white transition hover:opacity-90"
            >
              Send Reset Link
            </button>
          </form>
        )}

        <a
          href="/agent/login"
          className="mt-6 block text-center text-sm font-medium text-[var(--color-accent)]"
        >
          Back to sign in
        </a>
      </div>
    </div>
  );
}
