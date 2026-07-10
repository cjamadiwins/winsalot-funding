import type { Metadata } from "next";
import AddLeadForm from "@/components/sales-tracker/AddLeadForm";

export const metadata: Metadata = {
  title: "Add Lead | Winsalot Sales Tracker",
};

export default function AddLeadPage() {
  return <AddLeadForm />;
}
