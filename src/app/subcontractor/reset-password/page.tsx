import { requestSubcontractorResetAction } from "../actions";
import { completeSubcontractorSetupAction } from "../setup/actions";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const action = data.user ? completeSubcontractorSetupAction : requestSubcontractorResetAction;
  return <div className="crm-theme flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4"><div className="w-full max-w-sm rounded-2xl border bg-white p-8 shadow-sm"><p className="text-sm font-semibold text-sky-600">Winsalot Corp</p><h1 className="mt-1 text-xl font-bold">Reset Portal Password</h1><form action={action} className="mt-6 space-y-4">{data.user ? <><label className="block text-sm font-medium">New Password<input name="password" type="password" minLength={12} required className="mt-1.5 w-full rounded-lg border px-3.5 py-3" /></label><label className="block text-sm font-medium">Confirm Password<input name="confirm_password" type="password" minLength={12} required className="mt-1.5 w-full rounded-lg border px-3.5 py-3" /></label></> : <label className="block text-sm font-medium">Email<input name="email" type="email" required className="mt-1.5 w-full rounded-lg border px-3.5 py-3" /></label>}{params.error && <p className="text-sm text-red-600">{params.error}</p>}{params.message && <p className="text-sm text-emerald-700">{params.message}</p>}<button className="w-full rounded-full bg-sky-600 px-4 py-3 font-semibold text-white">{data.user ? "Save New Password" : "Send Reset Link"}</button></form></div></div>;
}
