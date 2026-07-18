"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

type Status = "checking" | "ready" | "invalid";

// Shared completion page for both the agent invite flow and the forgot-
// password flow - both end the same way: "you have a valid temporary
// session from an email link, now set a password." Supabase links can
// arrive two ways depending on project configuration:
//   1. ?token_hash=...&type=... - already verified server-side by
//      /auth/confirm before redirecting here, so a session cookie exists
//      by the time this page loads.
//   2. #access_token=...&type=... - a hash fragment the server never
//      sees at all; only the browser client (with its default
//      detectSessionInUrl behavior) can pick this up, which is why this
//      whole page has to be a client component.
export default function SetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkError = searchParams.get("error");

  const [status, setStatus] = useState<Status>(() => (linkError ? "invalid" : "checking"));
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (linkError) return;

    let active = true;
    const supabase = createSupabaseBrowserClient();

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) {
        setStatus("ready");
        return;
      }
      // No session yet - give the client a moment to finish processing a
      // #access_token hash fragment, then check once more.
      setTimeout(() => {
        if (!active) return;
        supabase.auth.getSession().then(({ data: retry }) => {
          if (active) setStatus(retry.session ? "ready" : "invalid");
        });
      }, 800);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session) setStatus("ready");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [linkError]);

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
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      setSubmitError(error.message);
      return;
    }

    router.push("/agent/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-8 shadow-sm">
        <h1 className="font-heading text-xl font-bold text-[var(--color-ink-strong)]">
          Set Your Password
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Winsalot CRM</p>

        {status === "checking" && (
          <p className="mt-6 text-sm text-[var(--color-text-muted)]">Checking your link…</p>
        )}

        {status === "invalid" && (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-red-600">
              {linkError ?? "This link is invalid or has expired."}
            </p>
            <a
              href="/agent/login"
              className="text-sm font-semibold text-[var(--color-accent)]"
            >
              Back to sign in
            </a>
          </div>
        )}

        {status === "ready" && (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="password" className="text-sm font-medium text-[var(--color-ink)]">
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
                className="mt-1.5 w-full rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-3 text-base text-[var(--color-ink-strong)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-soft)]"
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="text-sm font-medium text-[var(--color-ink)]"
              >
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
                className="mt-1.5 w-full rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-3 text-base text-[var(--color-ink-strong)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-soft)]"
              />
            </div>

            {submitError && <p className="text-sm text-red-600">{submitError}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-[var(--color-accent)] px-4 py-3 text-base font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Set Password & Sign In"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
