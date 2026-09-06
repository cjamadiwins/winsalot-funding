// Opportunity Pipeline Board View: shared, pure types used by both CRMs'
// Opportunity Finder Board View (crm_opportunities vs leadgen_leads - see
// src/lib/opportunity-finder.ts's own header comment for why this is one
// shared, DB-agnostic module rather than duplicated per CRM). The Board
// View is a second way to look at the exact same Opportunity Finder rows
// each CRM already fetches - it introduces no new table, no new record,
// and no new permission rule; every card here is built from data a CRM's
// own existing List View row already carries (plus a couple of
// additional read-only fields resolved from that CRM's own existing
// activity/appointment tables the same way List View resolves its
// "Last Call"/"Last Note" columns).

export type OpportunityBoardColumn = {
  key: string;
  label: string;
  styleClass: string;
};

export type OpportunityBoardCard = {
  // The underlying opportunity/lead id (never the score id) - every
  // mutation action (assign, add note, etc.) already keys on this.
  id: string;
  businessName: string;
  // "Client / Current Business" in the detail panel - the CRM's own
  // resolved client name when one exists, else the business itself.
  clientOrBusiness: string;
  assignedAgentName: string | null;
  phone: string | null;
  stageKey: string;
  stageLabel: string;
  stageStyle: string;
  lastCallAt: string | null;
  lastCallOutcome: string | null;
  // Latest 1-2 note-bearing activities, newest first.
  notes: string[];
  nextFollowUpAt: string | null;
  appointmentStatus: string | null;
  appointmentStatusStyle: string | null;
  viewHref: string;
  editHref: string;
};
