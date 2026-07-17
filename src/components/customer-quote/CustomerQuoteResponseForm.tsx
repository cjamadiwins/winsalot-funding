"use client";

import { useState, useTransition } from "react";
import { respondToCustomerQuoteAction } from "@/app/customer-quote/[token]/actions";

const textareaClasses =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";

export default function CustomerQuoteResponseForm({
  token,
  defaultAction,
}: {
  token: string;
  defaultAction: "decline" | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState("");
  const [showComments, setShowComments] = useState(defaultAction === "decline");
  const [result, setResult] = useState<"accepted" | "declined" | null>(null);

  function respond(decision: "accepted" | "declined") {
    setError(null);
    startTransition(async () => {
      const res = await respondToCustomerQuoteAction(token, decision, comments);
      if (res.ok) {
        setResult(decision);
      } else {
        setError(res.error);
      }
    });
  }

  if (result) {
    return (
      <div
        className={`rounded-2xl p-8 text-center ${
          result === "accepted"
            ? "border border-emerald-200 bg-emerald-50"
            : "border border-slate-200 bg-slate-50"
        }`}
      >
        <h2
          className={`text-xl font-semibold ${
            result === "accepted" ? "text-emerald-900" : "text-slate-900"
          }`}
        >
          {result === "accepted" ? "Quote accepted" : "Quote declined"}
        </h2>
        <p className={`mt-3 ${result === "accepted" ? "text-emerald-800" : "text-slate-600"}`}>
          {result === "accepted"
            ? "Thank you — Winsalot Corp has been notified and will follow up with next steps."
            : "Thank you for letting us know. Winsalot Corp has been notified."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="comments" className="text-sm font-medium text-slate-800">
          Comments <span className="text-slate-400">(optional)</span>
        </label>
        {showComments ? (
          <textarea
            id="comments"
            rows={3}
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            className={`${textareaClasses} mt-1.5`}
            placeholder="Let us know if you have any questions or comments…"
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowComments(true)}
            className="mt-1.5 text-sm font-medium text-sky-600 hover:text-sky-700"
          >
            + Add a comment
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={() => respond("accepted")}
          className="w-full rounded-full bg-sky-600 px-8 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending ? "Submitting…" : "Accept Quote"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => respond("declined")}
          className="text-sm font-medium text-slate-500 underline transition hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          Decline Quote
        </button>
      </div>
    </div>
  );
}
