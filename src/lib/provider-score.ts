import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import {
  providerScoreRatingLabel,
  type CleaningProviderRow,
  type ProviderDocumentRow,
  type ProviderScoreBreakdown,
  type ProviderScoreCategoryBreakdown,
} from "./provider-types";

// Provider Scorecard (brief "PROVIDER SCORECARD" + "SCORE UPDATES"): a
// 0-100 score built from five 20-point categories, using only objective
// CRM data already on this record - never an unexplained number. Every
// category the provider doesn't yet have enough data for is left out of
// the score entirely and the remaining categories are re-normalized to
// 100, rather than treating a missing category as zero (brief's "NEW
// PROVIDER SCORE HANDLING").
//
// Lives only on the operational Provider Profile (cleaning_providers) -
// a not-yet-approved Provider Acquisition lead has no scorecard at all.
//
// Recalculation is deliberately isolated behind
// recalculateProviderScoreSafely() so a scoring bug can never block an
// ordinary CRM action (brief: "Do not allow score recalculation failures
// to block ordinary CRM activity").

const CATEGORY_WEIGHT = 20;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function profileCompleteness(provider: CleaningProviderRow): ProviderScoreCategoryBreakdown {
  const items: { label: string; met: boolean; tip: string }[] = [
    { label: "Business name", met: Boolean(provider.company_name?.trim()), tip: "Add the business name." },
    { label: "Contact person", met: Boolean(provider.contact_person?.trim()), tip: "Add a contact person." },
    { label: "Valid phone number", met: Boolean(provider.phone?.trim()), tip: "Add a valid phone number." },
    {
      label: "Valid email address",
      met: Boolean(provider.email && provider.email.includes("@")),
      tip: "Add a valid email address.",
    },
    { label: "Website", met: Boolean(provider.website?.trim()), tip: "Add the provider's website." },
    {
      label: "Business address",
      met: Boolean(provider.street_address?.trim() && provider.postal_code?.trim()),
      tip: "Complete the street address and postal code.",
    },
    { label: "Services offered", met: provider.services_offered.length > 0, tip: "Select at least one service offered." },
    {
      label: "Cities served",
      met: provider.cities_served.length > 0,
      tip: "Complete the service-area information.",
    },
    { label: "Years in business", met: Boolean(provider.years_in_business?.trim()), tip: "Add years in business." },
    {
      label: "Business description",
      met: Boolean(provider.business_description?.trim()),
      tip: "Add a business description.",
    },
  ];
  const perItem = CATEGORY_WEIGHT / items.length;
  const earned = items.filter((i) => i.met).length * perItem;
  return {
    category: "Profile Completeness",
    applicable: true,
    pointsEarned: round1(earned),
    pointsAvailable: CATEGORY_WEIGHT,
    details: items.map((i) => `${i.met ? "✓" : "✗"} ${i.label}`),
    recommendations: items.filter((i) => !i.met).map((i) => i.tip),
  };
}

function documentation(
  provider: Pick<CleaningProviderRow, "wsib_wcb_applicable">,
  documents: ProviderDocumentRow[]
): ProviderScoreCategoryBreakdown {
  const active = documents.filter((d) => !d.removed_at);
  const has = (type: ProviderDocumentRow["doc_type"]) => active.some((d) => d.doc_type === type);
  const items: { label: string; weight: number; applicable: boolean; met: boolean; tip: string }[] = [
    {
      label: "Business licence",
      weight: 6,
      applicable: true,
      met: has("business_licence"),
      tip: "Add a business licence.",
    },
    {
      label: "Insurance certificate",
      weight: 6,
      applicable: true,
      met: has("insurance_certificate"),
      tip: "Add an insurance certificate.",
    },
    {
      label: "WSIB / WCB documentation",
      weight: 5,
      applicable: provider.wsib_wcb_applicable,
      met: has("wsib_wcb"),
      tip: "Add WSIB/WCB documentation.",
    },
    {
      label: "Certifications",
      weight: 3,
      applicable: true,
      met: has("certification"),
      tip: "Add any relevant certifications.",
    },
  ];
  const applicableItems = items.filter((i) => i.applicable);
  const available = applicableItems.reduce((sum, i) => sum + i.weight, 0);
  const earnedRaw = applicableItems.filter((i) => i.met).reduce((sum, i) => sum + i.weight, 0);
  const scaled = available > 0 ? (earnedRaw / available) * CATEGORY_WEIGHT : 0;
  return {
    category: "Documentation",
    applicable: true,
    pointsEarned: round1(scaled),
    pointsAvailable: CATEGORY_WEIGHT,
    details: items.map((i) =>
      i.applicable ? `${i.met ? "✓" : "✗"} ${i.label}` : `— ${i.label} (not applicable)`
    ),
    recommendations: applicableItems.filter((i) => !i.met).map((i) => i.tip),
  };
}

function responsiveness(input: {
  followUps: { status: string; scheduled_at: string }[];
  emails: { status: string }[];
}): ProviderScoreCategoryBreakdown {
  const { followUps, emails } = input;
  if (followUps.length === 0 && emails.length === 0) {
    return {
      category: "Responsiveness",
      applicable: false,
      pointsEarned: 0,
      pointsAvailable: CATEGORY_WEIGHT,
      details: ["No follow-ups or tracked emails yet."],
      recommendations: [],
    };
  }

  const completed = followUps.filter((f) => f.status === "completed");
  const overdue = followUps.filter((f) => f.status === "pending" && new Date(f.scheduled_at).getTime() < Date.now());
  const followUpScore = followUps.length > 0 ? completed.length / followUps.length : 1;
  const overduePenalty = followUps.length > 0 ? overdue.length / followUps.length : 0;
  const engaged = emails.filter((e) => ["opened", "clicked", "delivered", "sent"].includes(e.status)).length;
  const emailScore = emails.length > 0 ? engaged / emails.length : 1;
  const combined = Math.max(0, Math.min(1, followUpScore * 0.6 + emailScore * 0.4 - overduePenalty * 0.2));

  const recommendations: string[] = [];
  if (overdue.length > 0) recommendations.push("Complete overdue follow-ups.");
  if (emailScore < 1) recommendations.push("Respond to emails sooner.");

  return {
    category: "Responsiveness",
    applicable: true,
    pointsEarned: round1(combined * CATEGORY_WEIGHT),
    pointsAvailable: CATEGORY_WEIGHT,
    details: [
      `${completed.length}/${followUps.length} follow-ups completed`,
      `${overdue.length} follow-up(s) currently overdue`,
      `${engaged}/${emails.length} tracked email(s) delivered/opened/clicked`,
    ],
    recommendations,
  };
}

function quotePerformance(input: {
  opportunities: number;
  submitted: number;
  accepted: number;
}): ProviderScoreCategoryBreakdown {
  if (input.opportunities === 0) {
    return {
      category: "Quote Performance",
      applicable: false,
      pointsEarned: 0,
      pointsAvailable: CATEGORY_WEIGHT,
      details: ["No quote opportunities received yet."],
      recommendations: [],
    };
  }

  const submissionRate = input.submitted / input.opportunities;
  const acceptanceRate = input.submitted > 0 ? input.accepted / input.submitted : 0;
  const earned = (submissionRate * 0.6 + acceptanceRate * 0.4) * CATEGORY_WEIGHT;

  const recommendations: string[] = [];
  if (submissionRate < 1) recommendations.push("Respond to every quote invitation received.");
  if (input.submitted > 0 && acceptanceRate < 0.5) recommendations.push("Submit quotes before their deadlines to improve acceptance.");

  return {
    category: "Quote Performance",
    applicable: true,
    pointsEarned: round1(earned),
    pointsAvailable: CATEGORY_WEIGHT,
    details: [
      `${input.submitted}/${input.opportunities} quote opportunities submitted`,
      `${input.accepted}/${input.submitted} submitted quote(s) accepted`,
    ],
    recommendations,
  };
}

const STATUS_RELIABILITY_SCORE: Record<string, number> = {
  active: 1,
  inactive: 0.3,
  suspended: 0,
};

function reliabilityAndActivity(
  provider: Pick<CleaningProviderRow, "status">,
  recentActivityCount: number
): ProviderScoreCategoryBreakdown {
  const statusScore = STATUS_RELIABILITY_SCORE[provider.status] ?? 0.5;
  const activityScore = Math.min(1, recentActivityCount / 3);
  const combined = statusScore * 0.7 + activityScore * 0.3;

  const recommendations: string[] = [];
  if (provider.status === "suspended") {
    recommendations.push("Resolve the concerns behind the current status.");
  }
  if (recentActivityCount === 0) {
    recommendations.push("Log recent activity to reflect current engagement.");
  }

  return {
    category: "Reliability and Activity",
    applicable: true,
    pointsEarned: round1(combined * CATEGORY_WEIGHT),
    pointsAvailable: CATEGORY_WEIGHT,
    details: [`Current status: ${provider.status}`, `${recentActivityCount} activity record(s) in the last 60 days`],
    recommendations,
  };
}

export type ProviderScoreCalculationInput = {
  provider: CleaningProviderRow;
  documents: ProviderDocumentRow[];
  followUps: { status: string; scheduled_at: string }[];
  emails: { status: string }[];
  recentActivityCount: number;
  quoteStats: { opportunities: number; submitted: number; accepted: number };
};

export type ProviderScoreResult = {
  score: number;
  label: string;
  breakdown: ProviderScoreBreakdown;
  missingCategories: string[];
  isNewProvider: boolean;
};

export function calculateProviderScore(input: ProviderScoreCalculationInput): ProviderScoreResult {
  const categories = [
    profileCompleteness(input.provider),
    documentation(input.provider, input.documents),
    responsiveness({ followUps: input.followUps, emails: input.emails }),
    quotePerformance(input.quoteStats),
    reliabilityAndActivity(input.provider, input.recentActivityCount),
  ];

  const applicableCategories = categories.filter((c) => c.applicable);
  const rawEarned = applicableCategories.reduce((sum, c) => sum + c.pointsEarned, 0);
  const rawAvailable = applicableCategories.reduce((sum, c) => sum + c.pointsAvailable, 0);
  const score = rawAvailable > 0 ? Math.round((rawEarned / rawAvailable) * 100) : 0;
  const missingCategories = categories.filter((c) => !c.applicable).map((c) => c.category);

  return {
    score: Math.max(0, Math.min(100, score)),
    label: providerScoreRatingLabel(Math.max(0, Math.min(100, score))),
    breakdown: { categories, rawEarned, rawAvailable },
    missingCategories,
    isNewProvider: missingCategories.length > 0,
  };
}

// Fetches everything needed to score an operational provider and writes
// the result back onto cleaning_providers, logging a `score_change`
// activity when the score actually moved. Activity/follow-up/email
// history includes both this provider's own directly-logged rows
// (cleaning_provider_id = cleaningProviderId) and its acquisition-phase
// history from before approval (provider_lead_id belonging to any
// provider_leads row permanently linked to it), so scoring - and the
// timeline shown on the profile - reflect the provider's complete
// history, not just what happened after approval. Always uses the
// service-role client since scoring reads across tables (quote_requests,
// provider_quote_submissions) an agent's session may not have RLS access
// to directly.
export async function recalculateProviderScore(cleaningProviderId: string, reason: string): Promise<ProviderScoreResult | null> {
  const admin = getSupabaseAdmin();
  const { data: provider } = await admin
    .from("cleaning_providers")
    .select("*")
    .eq("id", cleaningProviderId)
    .maybeSingle();
  if (!provider) return null;

  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const { data: linkedLeads } = await admin
    .from("provider_leads")
    .select("id")
    .eq("cleaning_provider_id", cleaningProviderId);
  const linkedLeadIds = (linkedLeads ?? []).map((l) => l.id as string);
  const leadOrFilter = linkedLeadIds.length > 0 ? `,provider_lead_id.in.(${linkedLeadIds.join(",")})` : "";

  const [{ data: documents }, { data: followUps }, { data: emails }, { data: recentActivities }] = await Promise.all([
    admin.from("provider_documents").select("*").eq("cleaning_provider_id", cleaningProviderId).is("removed_at", null),
    admin
      .from("crm_followups")
      .select("status, scheduled_at")
      .or(`cleaning_provider_id.eq.${cleaningProviderId}${leadOrFilter}`),
    admin
      .from("crm_lead_emails")
      .select("status")
      .or(`cleaning_provider_id.eq.${cleaningProviderId}${leadOrFilter}`),
    admin
      .from("crm_activities")
      .select("id")
      .or(`cleaning_provider_id.eq.${cleaningProviderId}${leadOrFilter}`)
      .gte("occurred_at", sixtyDaysAgo),
  ]);

  let opportunities = 0;
  let submitted = 0;
  let accepted = 0;

  const { data: requests } = await admin
    .from("quote_requests")
    .select("id, status")
    .eq("assigned_provider_id", cleaningProviderId);
  opportunities = requests?.length ?? 0;
  if (opportunities > 0) {
    const ids = requests!.map((r) => r.id as string);
    const { data: submissions } = await admin
      .from("provider_quote_submissions")
      .select("quote_request_id")
      .in("quote_request_id", ids);
    submitted = new Set((submissions ?? []).map((s) => s.quote_request_id)).size;
    accepted = (requests ?? []).filter((r) => r.status === "Customer Accepted").length;
  }

  const result = calculateProviderScore({
    provider: provider as CleaningProviderRow,
    documents: (documents ?? []) as ProviderDocumentRow[],
    followUps: followUps ?? [],
    emails: emails ?? [],
    recentActivityCount: recentActivities?.length ?? 0,
    quoteStats: { opportunities, submitted, accepted },
  });

  const previousScore = provider.score as number | null;

  const { error: updateError } = await admin
    .from("cleaning_providers")
    .update({
      score: result.score,
      score_label: result.label,
      score_breakdown: result.breakdown,
      score_missing_categories: result.missingCategories,
      score_is_new_provider: result.isNewProvider,
      score_calculated_at: new Date().toISOString(),
    })
    .eq("id", cleaningProviderId);
  if (updateError) throw updateError;

  if (previousScore !== result.score) {
    await admin.from("crm_activities").insert({
      cleaning_provider_id: cleaningProviderId,
      agent_id: null,
      activity_type: "score_change",
      notes: `Score recalculated: ${previousScore ?? "—"} → ${result.score} (${result.label}). Reason: ${reason}.`,
    });
  }

  return result;
}

// Non-blocking entry point every mutation site should use (brief: "Do not
// allow score recalculation failures to block ordinary CRM activity") -
// fire-and-forget, logging any failure instead of throwing.
export function recalculateProviderScoreSafely(cleaningProviderId: string, reason: string): void {
  recalculateProviderScore(cleaningProviderId, reason).catch((err) => {
    console.error("[provider-score] Failed to recalculate score:", err);
  });
}
