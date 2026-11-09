import { redirect } from "next/navigation";

// Legacy route kept intentionally so old bookmarks and stale links never 404.
// Do Not Contact management now lives in the dashboard modal on /leadgen/admin.
export default function LeadgenDoNotContactLegacyPage() {
  redirect("/leadgen/admin");
}
