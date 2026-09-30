import { CALL_LIST_PROGRESS_LABELS, CALL_LIST_PROGRESS_STYLES, formatLastWorked, type CallListProgress } from "@/lib/call-list-progress";

// Narrow vertical side accent. Status is also written out wherever it is
// shown, so colour is never the only signal.
export function ProgressSideBar({ status, className = "" }: { status: CallListProgress["status"]; className?: string }) {
  return <span aria-hidden="true" data-progress-side-bar={status} className={`block w-1 self-stretch rounded-full ${CALL_LIST_PROGRESS_STYLES[status].bar} ${className}`} />;
}

export function ProgressBar({ progress }: { progress: CallListProgress }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress.progressPercent}
      className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
    >
      <div className={`h-full ${CALL_LIST_PROGRESS_STYLES[progress.status].fill}`} style={{ width: `${progress.progressPercent}%` }} />
    </div>
  );
}

export function ProgressStatusText({ status }: { status: CallListProgress["status"] }) {
  return <span className={`text-[12px] font-semibold ${CALL_LIST_PROGRESS_STYLES[status].text}`}>{CALL_LIST_PROGRESS_LABELS[status]}</span>;
}

// Agent card body: "63 / 95 worked · 66%", remaining, follow-ups, last worked, status.
export function CallListProgressSummary({ progress }: { progress: CallListProgress }) {
  return (
    <div className="mt-3 space-y-1.5 text-[12.5px] text-[var(--color-text-muted)]">
      <div className="font-semibold text-[var(--color-ink-strong)]">
        {progress.workedLeads} / {progress.totalLeads} worked · {progress.progressPercent}%
      </div>
      <ProgressBar progress={progress} />
      <div>{progress.unworkedLeads} remaining</div>
      <div>{progress.pendingFollowUps} follow-up{progress.pendingFollowUps === 1 ? "" : "s"}</div>
      <div>
        Last worked: <span suppressHydrationWarning>{formatLastWorked(progress.lastWorkedAt)}</span>
      </div>
      <div>
        Status: <ProgressStatusText status={progress.status} />
      </div>
    </div>
  );
}

// Card wrapper that puts the narrow colour accent on the left edge.
export function CallListCardFrame({ status, children }: { status: CallListProgress["status"]; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <ProgressSideBar status={status} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
