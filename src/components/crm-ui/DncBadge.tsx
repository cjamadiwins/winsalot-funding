import { blockedChannelsOf, type DncChannel, type DncSuppressionRow } from "@/lib/dnc-types";

const CHANNEL_LABELS: Record<DncChannel, string> = { phone: "Phone", sms: "SMS", email: "Email" };

// Item 7: "Anywhere a suppressed prospect/contact appears, display a clear
// red badge: DO NOT CONTACT, or, when only telephone contact is blocked:
// DO NOT CALL." Phone-only (the common case - a call outcome sets phone
// only) reads as the narrower "DO NOT CALL"; any broader combination reads
// as the all-encompassing "DO NOT CONTACT" so the badge never overstates a
// single-channel restriction.
export function dncBadgeLabel(row: Pick<DncSuppressionRow, "block_phone" | "block_sms" | "block_email">): string {
  return row.block_phone && !row.block_sms && !row.block_email ? "DO NOT CALL" : "DO NOT CONTACT";
}

export default function DncBadge({ suppression, className = "" }: { suppression: DncSuppressionRow; className?: string }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white ${className}`}
      title={`Blocked channels: ${blockedChannelsOf(suppression).map((c) => CHANNEL_LABELS[c]).join(", ")}`}
    >
      {dncBadgeLabel(suppression)}
    </span>
  );
}

// Item 7's top-of-record warning, plus Item 8's one-time "existing
// restriction detected" notice (shown via the `justDetected` variant right
// after a new record is created/imported that turned out to already be
// suppressed).
export function DncWarningBanner({ suppression, justDetected = false }: { suppression: DncSuppressionRow; justDetected?: boolean }) {
  const channels = blockedChannelsOf(suppression).map((c) => CHANNEL_LABELS[c]);
  return (
    <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
      <p className="font-bold">
        {justDetected ? "Existing Do Not Contact restriction detected." : "Contact restrictions are active for this prospect."}
      </p>
      <p className="mt-1">
        Blocked: <span className="font-semibold">{channels.join(", ")}</span>
        {suppression.reason ? ` — ${suppression.reason}` : ""}
      </p>
    </div>
  );
}
