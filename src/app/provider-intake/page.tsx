import type { Metadata } from "next";
import ProviderIntakeHeader from "@/components/ProviderIntakeHeader";
import ProviderIntakeForm from "@/components/ProviderIntakeForm";

export const metadata: Metadata = {
  title: "Cleaning Provider Intake Form | Winsalot Corp",
  description:
    "Submit your cleaning company's information to join Winsalot Corp's network of professional cleaning providers.",
};

export default function ProviderIntakePage() {
  return (
    <>
      <ProviderIntakeHeader />
      <main className="px-8 py-16 sm:px-14">
        <ProviderIntakeForm />
      </main>
    </>
  );
}
