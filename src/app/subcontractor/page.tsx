import { subcontractorLoginAction } from "./actions";

export default async function SubcontractorLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams;
  return (
    <div className="crm-theme flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-8 shadow-sm">
        <p className="text-sm font-semibold text-[var(--color-accent)]">Winsalot Corp</p>
        <h1 className="mt-1 font-heading text-xl font-bold text-[var(--color-ink-strong)]">Subcontractor Portal</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Secure access to your agreement, call logs and payment records.</p>
        <form action={subcontractorLoginAction} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">Email<input name="email" type="email" required autoComplete="username" className="mt-1.5 w-full rounded-lg border px-3.5 py-3 text-base" /></label>
          <label className="block text-sm font-medium">Password<input name="password" type="password" required autoComplete="current-password" className="mt-1.5 w-full rounded-lg border px-3.5 py-3 text-base" /></label>
          {params.error && <p className="text-sm text-red-600">{params.error}</p>}
          {params.message && <p className="text-sm text-emerald-700">{params.message}</p>}
          <button className="w-full rounded-full bg-[var(--color-accent)] px-4 py-3 font-semibold text-white">Sign In</button>
        </form>
        <a href="/subcontractor/reset-password" className="mt-4 block text-center text-sm font-medium text-[var(--color-accent)]">Forgot password?</a>
      </div>
    </div>
  );
}
