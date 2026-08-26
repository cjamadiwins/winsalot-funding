// Root route ("/"). Winsalot Growth CRM is an internal tool - agents and
// admins sign in from here, there's no public marketing funnel behind it
// anymore (the old commercial-cleaning-quote homepage that used to live
// at this route has been retired along with the rest of the cleaning
// quote system - see the PR that introduced this file for details).
import Link from "next/link";
import Image from "next/image";

export default function Home() {
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
