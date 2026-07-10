import type { Metadata } from "next";
import CrmPage from "@/components/sales-tracker/CrmPage";

export const metadata: Metadata = {
  title: "Sales Tracker | Winsalot",
};

export default function SalesTrackerPage() {
  return <CrmPage />;
}
