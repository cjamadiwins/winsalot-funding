// In-app CRM notifications (migration 0027) - currently only produced by
// the public Provider Intake Form submission handler
// (src/lib/provider-intake-submission.ts), one row per recipient
// (assigned agent + every active admin). Kept as a generic shape
// (provider_lead_id nullable, link_path free-form) so a future event type
// can reuse the same table without a new migration.

export type CrmNotificationRow = {
  id: string;
  created_at: string;
  user_id: string;
  provider_lead_id: string | null;
  title: string;
  body: string | null;
  link_path: string | null;
  is_read: boolean;
  read_at: string | null;
};

// "3 days ago" / "5 hours ago" / "12 minutes ago" / "Just now" - same
// bucketing as overdueDurationLabel()/overdueProviderDurationLabel(), just
// phrased for a past event instead of an overdue one.
export function notificationTimeAgoLabel(iso: string): string {
  const elapsedMs = Date.now() - new Date(iso).getTime();
  if (elapsedMs <= 0) return "Just now";

  const minutes = Math.floor(elapsedMs / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (minutes > 0) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  return "Just now";
}
