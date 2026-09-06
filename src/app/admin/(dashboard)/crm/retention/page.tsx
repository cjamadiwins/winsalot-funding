import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import AdminRetentionClient from "@/components/crm-retention/AdminRetentionClient";
import type {
  CrmRetentionEmailRow,
  CrmRetentionEnrollmentRow,
  CrmRetentionFollowupRow,
  CrmRetentionTemplateRow,
  RetentionClientSummary,
} from "@/lib/crm-retention-types";
import {
  enrollClientAction,
  pauseRetentionAction,
  resumeRetentionAction,
  stopRetentionAction,
  removeFromCampaignAction,
  changeCampaignTypeAction,
  sendRetentionEmailNowAction,
  scheduleFollowupAction,
  resolveFollowupAction,
  cancelFollowupAction,
  sendFollowupNowAction,
  updateRetentionTemplateAction,
  restoreDefaultTemplateAction,
  sendRetentionTemplateTestEmailAction,
  runRetentionJobNowAction,
} from "./actions";

// Admin-only page. requireCrmAdmin() (in addition to the whole /admin/*
// area's own requireAdminUser() gate in the dashboard layout, which
// already redirects any role='agent' session before it can even reach
// this route) means an agent account can never load this page - not from
// the nav (it's never rendered for them, see the layout's own admin-only
// NAV_ITEMS), and not by typing the URL directly, since both gates run
// server-side on every request regardless of how it was reached.
export default async function AdminRetentionPage() {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const [
    { data: clients, error: clientsError },
    { data: enrollments, error: enrollmentsError },
    { data: followups, error: followupsError },
    { data: templates, error: templatesError },
    { data: emails },
    { data: admins },
  ] = await Promise.all([
    supabase.from("crm_clients").select("id, company_name, primary_contact_name, email, status").neq("status", "Archived").order("company_name"),
    supabase.from("crm_retention_enrollments").select("*").is("removed_at", null).order("created_at", { ascending: false }),
    supabase.from("crm_retention_followups").select("*").order("follow_up_date", { ascending: false }),
    supabase.from("crm_retention_templates").select("*").order("campaign_type").order("sequence_number"),
    supabase.from("crm_retention_emails").select("*").order("created_at", { ascending: false }).limit(500),
    supabase.from("crm_users").select("id, full_name, email").eq("role", "admin").eq("active", true).order("full_name"),
  ]);

  const error = clientsError?.message || enrollmentsError?.message || followupsError?.message || templatesError?.message;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Client Loyalty &amp; Retention</h1>
      <p className="mt-1 text-sm text-slate-500">
        Keep existing Winsalot Corp. clients engaged with Client Success updates, scheduled follow-ups, and a light-touch re-engagement sequence. Enrollment is always a deliberate admin choice.
      </p>

      {error ? (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          The Client Loyalty &amp; Retention module could not load: {error}
        </p>
      ) : (
        <div className="mt-6">
          <AdminRetentionClient
            clients={(clients ?? []) as RetentionClientSummary[]}
            enrollments={(enrollments ?? []) as CrmRetentionEnrollmentRow[]}
            followups={(followups ?? []) as CrmRetentionFollowupRow[]}
            templates={(templates ?? []) as CrmRetentionTemplateRow[]}
            emails={(emails ?? []) as CrmRetentionEmailRow[]}
            admins={(admins ?? []) as { id: string; full_name: string; email: string }[]}
            actions={{
              enroll: enrollClientAction,
              pause: pauseRetentionAction,
              resume: resumeRetentionAction,
              stop: stopRetentionAction,
              remove: removeFromCampaignAction,
              changeCampaignType: changeCampaignTypeAction,
              sendNow: sendRetentionEmailNowAction,
              scheduleFollowup: scheduleFollowupAction,
              resolveFollowup: resolveFollowupAction,
              cancelFollowup: cancelFollowupAction,
              sendFollowupNow: sendFollowupNowAction,
              updateTemplate: updateRetentionTemplateAction,
              restoreDefaultTemplate: restoreDefaultTemplateAction,
              sendTestEmail: sendRetentionTemplateTestEmailAction,
              runJobNow: runRetentionJobNowAction,
            }}
          />
        </div>
      )}
    </div>
  );
}
