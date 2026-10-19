import { requireCrmAdmin } from "@/lib/crm-auth";
import { loadDialpadReconciliation, type ReconciliationParams } from "@/lib/dialpad-reconciliation-data";
import DialpadReconciliationReport from "@/components/dialpad/DialpadReconciliationReport";

// Read-only: no actions, no Dialpad auto-import. Admin-gated here as well as
// by the (dashboard) layout, because the loader uses the service-role client.
export default async function GrowthDialpadReconciliationPage({ searchParams }: { searchParams: Promise<ReconciliationParams> }) {
  await requireCrmAdmin();
  const data = await loadDialpadReconciliation(await searchParams);
  return <DialpadReconciliationReport data={data} basePath="/admin/crm/dialpad" crmLabel="Growth CRM" />;
}
