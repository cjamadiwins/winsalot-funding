import type { Metadata } from "next";
import LeadGenerationHeader from "@/components/LeadGenerationHeader";
import LeadGenerationIntakeForm from "@/components/LeadGenerationIntakeForm";

export const metadata: Metadata = {
  title: "Lead Generation Client Intake | Winsalot Corp",
  description:
    "Register your business for Winsalot's lead generation service and tell us about your target industry and campaign goals.",
};

export default function LeadGenerationPage() {
  return (
    <>
      <LeadGenerationHeader />
      <main className="px-8 py-16 sm:px-14">
        <LeadGenerationIntakeForm />
      </main>
    </>
  );
}
