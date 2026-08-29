import AdminLoginForm from "./AdminLoginForm";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirectTo?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="crm-theme flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-8 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Admin Sign In</h1>
        <p className="mt-1 text-sm text-slate-500">Growth CRM management dashboard</p>

        <AdminLoginForm redirectTo={params.redirectTo ?? "/admin"} />

        {params.error && (
          <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {params.error}
          </p>
        )}

        <a
          href="/admin/forgot-password"
          className="mt-4 block text-center text-sm font-medium text-sky-600"
        >
          Forgot password?
        </a>
      </div>
    </div>
  );
}
