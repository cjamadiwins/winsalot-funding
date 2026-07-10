import type { ReactNode } from "react";
import SalesTrackerNav from "@/components/sales-tracker/SalesTrackerNav";

export default function SalesTrackerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <SalesTrackerNav />
      <main className="mx-auto max-w-5xl px-6 py-10 sm:px-10">{children}</main>
    </div>
  );
}
