import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { loadDialpadReconciliation, type ReconciliationParams } from "@/lib/dialpad-reconciliation-data";
import DialpadReconciliationReport from "@/components/dialpad/DialpadReconciliationReport";

// Read-only: no actions, no Dialpad auto-import. Admin-gated here as well as
// by the (dashboard) layout, because the loader uses the service-role client.
export default async function LeadDialpadReconciliationPage({ searchParams }: { searchParams: Promise<ReconciliationParams> }) {
  await requireLeadgenAdmin();
  const data = await loadDialpadReconciliation(await searchParams);
  return <DialpadReconciliationReport data={data} basePath="/leadgen/admin/dialpad" crmLabel="Lead Generation CRM" />;
}
