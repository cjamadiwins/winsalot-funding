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
  candidatesFound: number; // after in-run dedup, before the existing-database check
  duplicatesWithinRun: number; // filtered out because they matched another candidate found in this same run
  duplicatesAlreadyStored: number; // filtered out because they matched a row already in the database
  newRecordsInserted: number;
  hotCount: number;
  warmCount: number;
  researchCount: number;
  expiredAtDiscovery: number; // of the newly-inserted rows, how many already had a past deadline
  expiredSwept: number; // pre-existing rows whose deadline has since passed, flipped to Expired
  hotAlertsSent: number;
  hotAlertsSkipped: number;
  hotAlertErrors: number;
};

export type CollectionOptions = {
  // Off by default so the daily cron and every future ordinary manual run
  // keep emailing info@winsalotcorp.com on a new Hot opportunity, per the
  // brief. Set true for a one-off review run where no email side effect is
  // wanted - see the "Skip Hot-alert email" checkbox on the admin
  // dashboard's Run Collection Now control.
  skipHotAlertEmails?: boolean;
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
// isolated so it doesn't take down the rest of the run. Note there is no
// separate "rejected" step beyond duplicate filtering and a connector
// failing outright - every candidate a connector returns (already
// filtered to the target markets/keywords inside the connector itself)
// gets scored and inserted, however low its score, so a low-intent
// candidate shows up as Research rather than being silently dropped.
export async function runOpportunityCollection(options: CollectionOptions = {}): Promise<CollectionSummary> {
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
  const duplicatesWithinRun = allCandidates.length - deduped.length;

  const sourceUrls = Array.from(new Set(deduped.map((c) => c.source_url)));
  const titles = Array.from(new Set(deduped.map((c) => c.opportunity_title)));
  const existingRows = await fetchPotentialDuplicates(admin, sourceUrls, titles);

  const newCandidates = deduped.filter(
    (candidate) => !existingRows.some((existing) => isDuplicateOpportunity(existing, candidate))
  );
  const duplicatesAlreadyStored = deduped.length - newCandidates.length;

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

  const hotRecords = inserted.filter((r) => r.intent_level === "Hot");
  let hotAlertsSent = 0;
  let hotAlertErrors = 0;
  let hotAlertsSkipped = 0;

  if (options.skipHotAlertEmails) {
    hotAlertsSkipped = hotRecords.length;
  } else {
    for (const record of hotRecords) {
      try {
        await sendHotOpportunityAlert(record);
        hotAlertsSent += 1;
      } catch (error) {
        hotAlertErrors += 1;
        console.error("Failed to send Hot opportunity alert:", error);
      }
    }
  }

  return {
    ranAt: now.toISOString(),
    connectors: results.map((r) => ({ source_name: r.source_name, found: r.candidates.length, error: r.error })),
    candidatesFound: deduped.length,
    duplicatesWithinRun,
    duplicatesAlreadyStored,
    newRecordsInserted: inserted.length,
    hotCount: hotRecords.length,
    warmCount: inserted.filter((r) => r.intent_level === "Warm").length,
    researchCount: inserted.filter((r) => r.intent_level === "Research").length,
    expiredAtDiscovery: inserted.filter((r) => r.status === "Expired").length,
    expiredSwept: expiredRows?.length ?? 0,
    hotAlertsSent,
    hotAlertsSkipped,
    hotAlertErrors,
  };
}
