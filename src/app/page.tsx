// Root route ("/"). Winsalot Growth CRM is an internal tool - agents and
// admins sign in from here, there's no public marketing funnel behind it
// anymore (the old commercial-cleaning-quote homepage that used to live
// at this route has been retired along with the rest of the cleaning
// quote system - see the PR that introduced this file for details).
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const code = typeof params.code === "string" ? params.code : null;
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : null;
  const type = typeof params.type === "string" ? params.type : null;
  const authError = typeof params.error_description === "string" ? params.error_description : null;

  // Supabase can fall back to the configured Site URL when a requested
  // redirect path is not allow-listed. Keep the email flow one-click by
  // forwarding every supported auth-link format from the homepage to the
  // CRM's dedicated password page/confirmation endpoint.
  if (code) {
    redirect(`/agent/set-password?code=${encodeURIComponent(code)}`);
  }
  if (tokenHash && type) {
    redirect(`/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}&next=/agent/set-password`);
  }
  if (authError) {
    redirect(`/agent/set-password?error=${encodeURIComponent(authError)}`);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-bg)] px-6 text-center text-[var(--color-ink)]">
      <Image src="/winsalot-logo.png" alt="Winsalot Corp" width={80} height={80} className="h-20 w-20 object-contain" priority />
      <h1 className="mt-6 text-3xl font-bold sm:text-4xl">Winsalot Growth CRM</h1>
      <p className="mt-3 max-w-md text-[15px] text-slate-500">
        Empowering Businesses, One Solution at a Time.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/agent/login"
          className="rounded-full bg-[var(--color-accent,#3e7ef7)] px-6 py-2.5 text-[14px] font-semibold text-white transition hover:opacity-90"
        >
          Agent Login
        </Link>
        <Link
          href="/admin/login"
          className="rounded-full border border-slate-300 px-6 py-2.5 text-[14px] font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Admin Login
        </Link>
      </div>
    </div>
  );
}
