"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

type Status = "checking" | "ready" | "invalid";

// Admin counterpart to /agent/set-password/SetPasswordClient.tsx - same
// session-provenance requirement applies here for the same reason (see
// that file's comment for the production incident that made it
// necessary): this page must never treat "a session merely exists" as
// proof of a valid recovery link, since an admin could already have an
// unrelated session active in the same browser.
//
// Also clears the must_change_password flag (set on accounts whose
// password was reset by an operator) as part of the same updateUser()
// call that sets the new password, so a forced reset only ever prompts
// once.
export default function AdminSetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkError = searchParams.get("error");
  const serverVerified = searchParams.get("verified") === "1";

  const [hadAuthHashOnLoad] = useState(
    () =>
      typeof window !== "undefined" &&
      /access_token=/.test(window.location.hash) &&
      /type=(invite|recovery)/.test(window.location.hash)
  );
  // createBrowserClient (@supabase/ssr) defaults to flowType "pkce", which
  // is what this project's recovery links actually use: a ?code=...
  // query param, not a #access_token hash fragment. See the matching
  // comment in src/app/agent/set-password/SetPasswordClient.tsx for the
  // full explanation - this was the bug behind a recovery link reporting
  // "invalid or expired" even though Supabase had verified it correctly.
  const [hadAuthCodeOnLoad] = useState(() => Boolean(searchParams.get("code")));

  const hasProofOfFreshLink = serverVerified || hadAuthHashOnLoad || hadAuthCodeOnLoad;

  const [status, setStatus] = useState<Status>(() => {
    if (linkError) return "invalid";
    return hasProofOfFreshLink ? "checking" : "invalid";
  });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [expectedUserId, setExpectedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (linkError || !hasProofOfFreshLink) return;

    let active = true;
    const supabase = createSupabaseBrowserClient();

    function markReady(userId: string) {
      if (!active) return;
      setExpectedUserId(userId);
      setStatus("ready");
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) {
        markReady(data.session.user.id);
        return;
      }
      setTimeout(() => {
        if (!active) return;
        supabase.auth.getSession().then(({ data: retry }) => {
          if (!active) return;
          if (retry.session) markReady(retry.session.user.id);
          else setStatus("invalid");
        });
      }, 800);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) markReady(session.user.id);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [linkError, hasProofOfFreshLink]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (password.length < 8) {
      setSubmitError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setSubmitError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const supabase = createSupabaseBrowserClient();

    const { data: currentUser } = await supabase.auth.getUser();
    if (!currentUser.user || currentUser.user.id !== expectedUserId) {
      setSubmitting(false);
      setSubmitError(
        "Your session has changed since this page loaded. Please open the link from your email again."
      );
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false },
    });
    setSubmitting(false);

    if (error) {
      setSubmitError(error.message);
      return;
    }

    router.push("/admin");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Set Your Password</h1>
        <p className="mt-1 text-sm text-slate-500">Quote management dashboard</p>

        {status === "checking" && (
          <p className="mt-6 text-sm text-slate-500">Checking your link…</p>
        )}

        {status === "invalid" && (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-rose-600">
              {linkError ?? "This link is invalid or has expired."}
            </p>
            <a href="/admin/login" className="text-sm font-semibold text-sky-600">
              Back to sign in
            </a>
          </div>
        )}

        {status === "ready" && (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="password" className="text-sm font-medium text-slate-800">
                New password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="text-sm font-medium text-slate-800">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
              />
            </div>

            {submitError && <p className="text-sm text-rose-600">{submitError}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Set Password & Sign In"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
