"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SalesTrackerNav() {
  const pathname = usePathname();
  const onAddLead = pathname === "/sales-tracker/add-lead";

  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-6 px-8 py-[18px] sm:px-14 bg-[var(--color-bg)]/90 backdrop-blur-md border-b border-[var(--color-border)]">
      <Link
        href="/sales-tracker"
        className="font-heading text-[17px] font-bold text-[var(--color-ink-strong)]"
      >
        Winsalot Sales Tracker
      </Link>
      {onAddLead && (
        <Link
          href="/sales-tracker"
          className="text-[14.5px] font-medium text-[var(--color-ink-mute)] hover:text-[var(--color-ink)] transition-colors"
        >
          ← Back to Sales Tracker
        </Link>
      )}
    </div>
  );
}
