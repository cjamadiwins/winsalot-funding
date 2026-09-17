import { EMAIL_MARKETING_STATUS_LABELS, EMAIL_MARKETING_STATUS_STYLES, type EmailMarketingStatus } from "@/lib/crm-email-marketing-status";

// Compact Email Marketing status badge for a Growth CRM business/prospect
// record - Enrolled (green) / Not Enrolled (gray) / Consent Required
// (amber) / Unsubscribed (red). Deliberately as small and plain as
// DncBadge/the stage badge next to it so a record's header stays compact.
export default function EmailMarketingBadge({ status, className = "" }: { status: EmailMarketingStatus; className?: string }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${EMAIL_MARKETING_STATUS_STYLES[status]} ${className}`}
      title={`Email Marketing: ${EMAIL_MARKETING_STATUS_LABELS[status]}`}
    >
      {EMAIL_MARKETING_STATUS_LABELS[status]}
    </span>
  );
}
