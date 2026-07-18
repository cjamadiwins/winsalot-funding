"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

type Status = "checking" | "ready" | "invalid";

// Shared completion page for both the agent invite flow and the forgot-
// password flow - both end the same way: "you have a valid temporary
// session from an email link, now set a password." Supabase links can
// arrive several ways depending on project/client configuration:
//   1. ?token_hash=...&type=... - already verified server-side by
//      /auth/confirm before redirecting here, which marks the redirect
//      with ?verified=1 as proof this session was just established.
//   2. #access_token=...&type=... - a hash fragment the server never
//      sees at all (implicit flow); only the browser client (with its
//      default detectSessionInUrl behavior) can pick this up.
//   3. ?code=... (PKCE flow) - createBrowserClient from @supabase/ssr
//      defaults to flowType "pkce", which is what this project's invite/
//      recovery links actually use, not the hash fragment. The browser
//      client still exchanges this for a session automatically via
//      detectSessionInUrl; this page just needs to recognize the
//      parameter as proof, the same way it recognizes the hash.
//
// Critically, this page must never treat "a session merely exists" as
// proof of a valid invite/recovery link - someone who's already logged
// in (e.g. an admin testing an agent invite in the same browser) would
// otherwise have that pre-existing session silently accepted here, and
// clicking "Set Password" would overwrite *their own* account's password
// instead of failing closed. This happened in production: an admin's
// password was overwritten this way. So readiness requires actual
// evidence of a fresh link (hash fragment, ?code=, or ?verified=1), not
// just getSession() returning something, and the submit handler
// re-checks the session's user id hasn't silently changed since (e.g.
// via a same-origin tab syncing a different session through
// localStorage) before ever calling updateUser().
export default function SetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkError = searchParams.get("error");
  const serverVerified = searchParams.get("verified") === "1";

  // Captured synchronously on first render, before the Supabase client is
  // even created - detectSessionInUrl consumes the hash/code
  // asynchronously (and may strip it from the URL afterward), so this has
  // to run before that has a chance to happen.
  const [hadAuthHashOnLoad] = useState(
    () =>
      typeof window !== "undefined" &&
      /access_token=/.test(window.location.hash) &&
      /type=(invite|recovery)/.test(window.location.hash)
  );
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
      // No session yet - give the client a moment to finish processing a
      // #access_token hash fragment, then check once more.
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

    // Re-verify the session is still the one this page validated as
    // "fresh" - guards against a cross-tab session swap (e.g. another tab
    // signing in as someone else) happening between page load and submit.
    const { data: currentUser } = await supabase.auth.getUser();
    if (!currentUser.user || currentUser.user.id !== expectedUserId) {
      setSubmitting(false);
      setSubmitError(
        "Your session has changed since this page loaded. Please open the link from your email again."
      );
      return;
    }

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
