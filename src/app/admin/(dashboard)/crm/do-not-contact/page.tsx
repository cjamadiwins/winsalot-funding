import { redirect } from "next/navigation";

// Legacy route kept intentionally so old bookmarks and stale links never 404.
// Do Not Contact management now lives in the dashboard modal on /admin/crm.
export default function GrowthDoNotContactLegacyPage() {
  redirect("/admin/crm");
}
