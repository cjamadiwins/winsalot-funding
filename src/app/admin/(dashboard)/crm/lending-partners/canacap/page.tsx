import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import type { CrmCanacapApplicationRow } from "@/lib/crm-canacap-types";
import CanacapClient from "@/components/crm-lending-partners/CanacapClient";
import { createCanacapApplicationAction, updateCanacapApplicationAction } from "./actions";

export default async function CanacapPage() {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("crm_canacap_applications")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <Link href="/admin/crm/lending-partners" className="text-[12.5px] font-medium text-sky-600 hover:text-sky-700">
        &larr; Lending &amp; Referral Partners
      </Link>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">Business Finance &rarr; CanaCap</h1>
      <p className="mt-1 text-sm text-slate-500">
        CanaCap Merchant Cash Advance applications. Admin-only. Completed applications and bank statements are
        never stored here or in GitHub — this page only tracks status and which documents have been collected.
      </p>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load CanaCap applications: {error.message}
        </p>
      )}

      <div className="mt-6">
        <CanacapClient
          applications={(data ?? []) as CrmCanacapApplicationRow[]}
          createAction={createCanacapApplicationAction}
          updateAction={updateCanacapApplicationAction}
        />
      </div>
    </div>
  );
}
