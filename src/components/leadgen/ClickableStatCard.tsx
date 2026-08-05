"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

// Whole-card clickable stat tile. A plain <Link> already gets Enter-key
// activation and pointer/focus semantics for free from the browser -
// this only adds explicit Space-key support (anchors don't activate on
// Space natively) so both keys work, per the agent-dashboard brief.
export default function ClickableStatCard({
  href,
  label,
  value,
  colorClass,
}: {
  href: string;
  label: string;
  value: string;
  colorClass: string;
}) {
  const router = useRouter();

  return (
    <Link
      href={href}
      onKeyDown={(e) => {
        if (e.key === " ") {
          e.preventDefault();
          router.push(href);
        }
      }}
      className={`block cursor-pointer rounded-xl border p-3.5 transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${colorClass}`}
    >
      <div className="text-[10.5px] font-semibold uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-1 text-[18px] font-bold">{value}</div>
    </Link>
  );
}
