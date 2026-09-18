// Growth CRM: the Quick Call Script card's campaign definitions, shown on
// both the admin (/admin/crm) and agent (/agent/dashboard) dashboards.
// Adding a campaign here is a deliberate, reviewed step - the card only
// ever offers the campaigns listed below, so a new one never appears
// selectable without a script, a label, and a color already wired up.

export const GROWTH_CRM_CAMPAIGN_KEYS = [
  "website-development",
  "marketing-agencies",
  "bookkeeping-accounting",
  "it-services",
  "security-systems",
  "business-finance",
] as const;

export type GrowthCrmCampaignKey = (typeof GROWTH_CRM_CAMPAIGN_KEYS)[number];

export function isGrowthCrmCampaignKey(value: string): value is GrowthCrmCampaignKey {
  return (GROWTH_CRM_CAMPAIGN_KEYS as readonly string[]).includes(value);
}

export const GROWTH_CRM_CAMPAIGN_LABELS: Record<GrowthCrmCampaignKey, string> = {
  "website-development": "Website Development / Web Design",
  "marketing-agencies": "Marketing Agencies",
  "bookkeeping-accounting": "Bookkeeping & Accounting",
  "it-services": "IT Services",
  "security-systems": "Security Systems / Camera Installation",
  "business-finance": "Business Finance",
};

// Subtle, distinct color per campaign so an agent can tell at a glance
// which script they're looking at. Business Finance intentionally gets
// its own color (emerald), set apart from every Lead Generation campaign
// above it, per CJ's request.
export const GROWTH_CRM_CAMPAIGN_TONE: Record<
  GrowthCrmCampaignKey,
  { border: string; bg: string; heading: string; badge: string }
> = {
  "website-development": { border: "border-sky-200", bg: "bg-sky-50", heading: "text-sky-700", badge: "bg-sky-100 text-sky-700" },
  "marketing-agencies": { border: "border-purple-200", bg: "bg-purple-50", heading: "text-purple-700", badge: "bg-purple-100 text-purple-700" },
  "bookkeeping-accounting": { border: "border-amber-200", bg: "bg-amber-50", heading: "text-amber-700", badge: "bg-amber-100 text-amber-700" },
  "it-services": { border: "border-cyan-200", bg: "bg-cyan-50", heading: "text-cyan-700", badge: "bg-cyan-100 text-cyan-700" },
  "security-systems": { border: "border-orange-200", bg: "bg-orange-50", heading: "text-orange-700", badge: "bg-orange-100 text-orange-700" },
  "business-finance": { border: "border-emerald-200", bg: "bg-emerald-50", heading: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700" },
};

export type GrowthCrmCampaignScript = {
  opener: (agentName: string) => string;
  followUp?: (agentName: string) => string;
  followUpLabel?: string;
  guidance?: string[];
};

// Every opener/follow-up takes the agent's name so the dashboard can
// substitute the signed-in agent's real name while the admin preview
// shows the literal "[Agent Name]" placeholder - same convention already
// used by the Lead Generation CRM's leadgen-call-scripts.tsx.
export const GROWTH_CRM_CAMPAIGN_SCRIPTS: Record<GrowthCrmCampaignKey, GrowthCrmCampaignScript> = {
  "website-development": {
    opener: (agentName) =>
      `"Hi, this is ${agentName} calling from Winsalot Corp. We help website development and web design companies generate qualified business opportunities through outbound calling and appointment setting. We connect companies like yours with businesses that may be looking for a new website, website redesign, or rebranding. I wanted to ask — are you currently looking to add more business clients?"`,
  },
  "marketing-agencies": {
    opener: (agentName) =>
      `"Hi, this is ${agentName} calling from Winsalot Corp. We help marketing agencies generate qualified business opportunities through outbound prospecting and appointment setting. Our team reaches out to businesses, identifies companies interested in marketing support, and helps book conversations for your sales team. Are you currently looking to bring in more business clients?"`,
  },
  "bookkeeping-accounting": {
    opener: (agentName) =>
      `"Hi, this is ${agentName} calling from Winsalot Corp. We help bookkeeping and accounting firms generate qualified business opportunities through outbound calling and appointment setting. We connect firms like yours with businesses that may need bookkeeping, accounting, payroll, or financial support. Are you currently looking to add more business clients?"`,
  },
  "it-services": {
    opener: (agentName) =>
      `"Hi, this is ${agentName} calling from Winsalot Corp. We help IT service and technology companies generate qualified B2B opportunities through outbound calling and appointment setting. We reach businesses that may need managed IT, technical support, cybersecurity, or other IT services and help arrange conversations with interested prospects. Are you currently looking to grow your business client base?"`,
  },
  "security-systems": {
    opener: (agentName) =>
      `"Hi, this is ${agentName} calling from Winsalot Corp. We help commercial security and camera installation companies generate qualified business opportunities through outbound calling and appointment setting. We connect companies like yours with businesses that may be considering security cameras, access control, or security system upgrades. Are you currently looking to add more commercial clients?"`,
  },
  "business-finance": {
    opener: (agentName) =>
      `"Hi, this is ${agentName} calling from Winsalot Corp. We help Canadian businesses explore business financing options for working capital, expansion, equipment, inventory, or other business needs. I just wanted to ask — is access to additional business funding something your business may be interested in right now?"`,
    followUp: () =>
      `"Great. To see what options may be available, we normally start by understanding how long the business has been operating and its approximate monthly revenue. Would you mind if I ask you a couple of quick questions?"`,
    followUpLabel: "If Interested",
    guidance: [
      "Do not quote rates, repayment terms, approval amounts, or guarantee approval on the initial call.",
      "Do not present Winsalot Corp. as the lender. Winsalot Corp. provides business lending support and works with lending partners.",
      "The objective of the call is to determine interest, gather basic qualification information, and move the prospect to the appropriate next step.",
      "Keep this script short here — detailed qualification questions live in the full Business Finance training/script section.",
    ],
  },
};
