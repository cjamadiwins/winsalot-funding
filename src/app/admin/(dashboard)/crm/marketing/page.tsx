import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import AdminMarketingClient from "@/components/crm-marketing/AdminMarketingClient";
import type {
  CrmMarketingDeliveryRow,
  CrmMarketingEnrollmentRow,
  CrmMarketingTemplateRow,
  MarketingOpportunitySummary,
} from "@/lib/crm-marketing-types";
import {
  enrollMarketingContactAction,
  pauseMarketingEnrollmentAction,
  resumeMarketingEnrollmentAction,
  stopMarketingEnrollmentAction,
  removeMarketingEnrollmentAction,
  deleteMarketingCampaignAction,
  updateMarketingTemplateAction,
  sendMarketingTemplateTestEmailAction,
  runMarketingJobNowAction,
} from "./actions";

export default async function AdminMarketingPage() {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const [{ data: opportunities, error: opportunityError }, { data: enrollments, error: enrollmentError }, { data: templates, error: templateError }, { data: deliveries }] = await Promise.all([
    supabase
      .from("crm_opportunities")
      .select("id, business_name, contact_name, email, stage, opportunity_type")
      .order("business_name"),
    supabase.from("crm_marketing_enrollments").select("*").is("removed_at", null).order("created_at", { ascending: false }),
    supabase.from("crm_marketing_templates").select("*").order("campaign_type").order("sequence_number"),
    supabase.from("crm_marketing_deliveries").select("*").order("created_at", { ascending: false }).limit(500),
  ]);

  const error = opportunityError?.message || enrollmentError?.message || templateError?.message;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Email Marketing</h1>
      <p className="mt-1 text-sm text-slate-500">
        Manage automated weekly follow-up emails for contacted businesses. Consent, suppression, delivery, and engagement are tracked automatically.
      </p>

      {error ? (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          The Email Marketing section could not load: {error}
        </p>
      ) : (
        <div className="mt-6">
          <AdminMarketingClient
            opportunities={(opportunities ?? []) as MarketingOpportunitySummary[]}
            enrollments={(enrollments ?? []) as CrmMarketingEnrollmentRow[]}
            templates={(templates ?? []) as CrmMarketingTemplateRow[]}
            deliveries={(deliveries ?? []) as CrmMarketingDeliveryRow[]}
            actions={{
              enroll: enrollMarketingContactAction,
              pause: pauseMarketingEnrollmentAction,
              resume: resumeMarketingEnrollmentAction,
              stop: stopMarketingEnrollmentAction,
              remove: removeMarketingEnrollmentAction,
              deleteCampaign: deleteMarketingCampaignAction,
              updateTemplate: updateMarketingTemplateAction,
              sendTestEmail: sendMarketingTemplateTestEmailAction,
              runJobNow: runMarketingJobNowAction,
            }}
          />
        </div>
      )}
    </div>
  );
}
