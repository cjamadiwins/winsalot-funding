import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendHotOpportunityAlert } from "@/lib/opportunity-alert-email";
import { runCanadaBuysConnector } from "./connectors/canadabuys";
import { runBcBidConnector } from "./connectors/bcbid";
import { runBidsAndTendersConnectors } from "./connectors/bidsandtenders";
import { dedupeCandidates, isDuplicateOpportunity } from "./dedupe";
import { isExpired, scoreOpportunity } from "./scoring";
import type { ActiveCleaningOpportunityRow, ConnectorResult, OpportunityStatus } from "./types";

export type CollectionSummary = {
  ranAt: string;
  connectors: { source_name: string; found: number; error?: string }[];
  candidatesFound: number;
  newRecordsInserted: number;
  hotAlertsSent: number;
  hotAlertErrors: number;
  expiredSwept: number;
};

// Existing DB rows that could conflict with a new candidate, fetched by
// source_url and by title separately (two safe .in() queries, rather than
// hand-building a single PostgREST filter string out of scraped text -
// candidate titles/URLs are untrusted input and .in() is what properly
// escapes them).
async function fetchPotentialDuplicates(
  admin: ReturnType<typeof getSupabaseAdmin>,
  sourceUrls: string[],
  titles: string[]
) {
  const [{ data: byUrl }, { data: byTitle }] = await Promise.all([
    sourceUrls.length
      ? admin
          .from("active_cleaning_opportunities")
          .select("organization_name, opportunity_title, source_url, deadline")
          .in("source_url", sourceUrls)
      : Promise.resolve({ data: [] as { organization_name: string | null; opportunity_title: string; source_url: string; deadline: string | null }[] }),
    titles.length
      ? admin
          .from("active_cleaning_opportunities")
          .select("organization_name, opportunity_title, source_url, deadline")
          .in("opportunity_title", titles)
      : Promise.resolve({ data: [] as { organization_name: string | null; opportunity_title: string; source_url: string; deadline: string | null }[] }),
  ]);
  return [...(byUrl ?? []), ...(byTitle ?? [])];
}

// The daily collection run: fetch every connector's candidates, dedupe
// against both this run's own results and what's already stored, score
// and persist the genuinely new ones, sweep past-deadline records to
// Expired, and alert on any newly-discovered Hot opportunity. Every step
// that can partially fail (a connector, an individual alert email) is
// isolated so it doesn't take down the rest of the run.
export async function runOpportunityCollection(): Promise<CollectionSummary> {
  const now = new Date();
  const admin = getSupabaseAdmin();

  const [canadaBuys, bcBid, municipalPortals] = await Promise.all([
    runCanadaBuysConnector(),
    runBcBidConnector(),
    runBidsAndTendersConnectors(),
  ]);
  const results: ConnectorResult[] = [canadaBuys, bcBid, ...municipalPortals];

  const allCandidates = results.flatMap((r) => r.candidates);
  const deduped = dedupeCandidates(allCandidates);

  const sourceUrls = Array.from(new Set(deduped.map((c) => c.source_url)));
  const titles = Array.from(new Set(deduped.map((c) => c.opportunity_title)));
  const existingRows = await fetchPotentialDuplicates(admin, sourceUrls, titles);

  const newCandidates = deduped.filter(
    (candidate) => !existingRows.some((existing) => isDuplicateOpportunity(existing, candidate))
  );

  const rowsToInsert = newCandidates.map((candidate) => {
    const { score, level } = scoreOpportunity(candidate, now);
    const status: OpportunityStatus = isExpired(candidate.deadline, now) ? "Expired" : "New";
    return {
      organization_name: candidate.organization_name ?? null,
      opportunity_title: candidate.opportunity_title,
      description: candidate.description ?? null,
      opportunity_type: candidate.opportunity_type,
      service_needed: candidate.service_needed ?? null,
      city: candidate.city ?? null,
      province: candidate.province ?? null,
      contact_name: candidate.contact_name ?? null,
      public_email: candidate.public_email ?? null,
      public_phone: candidate.public_phone ?? null,
      website: candidate.website ?? null,
      source_name: candidate.source_name,
      source_url: candidate.source_url,
      date_posted: candidate.date_posted ?? null,
      deadline: candidate.deadline ?? null,
      intent_score: score,
      intent_level: level,
      status,
    };
  });

  let inserted: ActiveCleaningOpportunityRow[] = [];
  if (rowsToInsert.length > 0) {
    const { data, error } = await admin
      .from("active_cleaning_opportunities")
      .upsert(rowsToInsert, { onConflict: "source_url,opportunity_title", ignoreDuplicates: true })
      .select();

    if (error) {
      throw new Error(`Failed to save opportunities: ${error.message}`);
    }
    inserted = (data ?? []) as ActiveCleaningOpportunityRow[];
  }

  const { data: expiredRows, error: expireError } = await admin
    .from("active_cleaning_opportunities")
    .update({ status: "Expired" })
    .lt("deadline", now.toISOString().slice(0, 10))
    .not("status", "in", "(Converted,Not suitable,Expired)")
    .select("id");

  if (expireError) {
    console.error("Failed to sweep expired opportunities:", expireError.message);
  }

  let hotAlertsSent = 0;
  let hotAlertErrors = 0;
  for (const record of inserted.filter((r) => r.intent_level === "Hot")) {
    try {
      await sendHotOpportunityAlert(record);
      hotAlertsSent += 1;
    } catch (error) {
      hotAlertErrors += 1;
      console.error("Failed to send Hot opportunity alert:", error);
    }
  }

  return {
    ranAt: now.toISOString(),
    connectors: results.map((r) => ({ source_name: r.source_name, found: r.candidates.length, error: r.error })),
    candidatesFound: deduped.length,
    newRecordsInserted: inserted.length,
    hotAlertsSent,
    hotAlertErrors,
    expiredSwept: expiredRows?.length ?? 0,
  };
}
