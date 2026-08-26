import { redirect } from "next/navigation";

// /admin/crm is the one admin CRM landing page - there's no separate
// opportunities index (the table there already links straight to
// /admin/crm/opportunities/[id]). Kept as a redirect rather than removed
// so a stale bookmark/link to this URL still lands somewhere useful.
export default function AdminOpportunitiesIndexPage() {
  redirect("/admin/crm");
}
