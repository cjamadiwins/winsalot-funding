import { redirect } from "next/navigation";

// /admin is postLoginPath for the admin session gate (see src/proxy.ts), so
// this route must keep resolving to something even though the old
// RequestsTable quote-request dashboard that used to live here is being
// retired along with quote_requests/RequestsTable.tsx/requests/invoices/
// providers in a separate cleanup pass. The Winsalot Growth CRM's one
// admin dashboard now lives at /admin/crm.
export default function AdminRootPage() {
  redirect("/admin/crm");
}
