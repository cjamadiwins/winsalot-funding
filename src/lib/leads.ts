"use client";

export type LeadStatus =
  | "New Lead"
  | "Contacted"
  | "Interested"
  | "Proposal Sent"
  | "Follow-Up"
  | "Won"
  | "Lost";

export type Lead = {
  id: string;
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
  industry: string;
  status: LeadStatus;
  followUpDate: string;
  dealValue: number;
  notes: string;
  createdDate: string;
};

export type NewLeadInput = Omit<Lead, "id" | "createdDate">;

export const LEAD_STATUSES: LeadStatus[] = [
  "New Lead",
  "Contacted",
  "Interested",
  "Proposal Sent",
  "Follow-Up",
  "Won",
  "Lost",
];

const STORAGE_KEY = "winsalot_sales_tracker_leads";
const CHANGE_EVENT = "winsalot-leads-changed";

const EMPTY_LEADS: Lead[] = [];
let cachedRaw: string | null = null;
let cachedLeads: Lead[] = EMPTY_LEADS;

export function getLeads(): Lead[] {
  if (typeof window === "undefined") return EMPTY_LEADS;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedLeads = raw ? (JSON.parse(raw) as Lead[]) : EMPTY_LEADS;
  }
  return cachedLeads;
}

export function getServerLeadsSnapshot(): Lead[] {
  return EMPTY_LEADS;
}

// Reading from localStorage is an external store, so components should
// subscribe via useSyncExternalStore(subscribeToLeads, getLeads,
// getServerLeadsSnapshot) rather than loading it in a useEffect - this
// keeps server-rendered and first-client-render HTML in sync automatically.
export function subscribeToLeads(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function saveLeads(leads: Lead[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function addLead(input: NewLeadInput): Lead {
  const leads = getLeads();
  const lead: Lead = {
    ...input,
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    createdDate: new Date().toISOString().slice(0, 10),
  };
  leads.push(lead);
  saveLeads(leads);
  return lead;
}

export function updateLeadStatus(id: string, status: LeadStatus) {
  const leads = getLeads();
  const lead = leads.find((l) => l.id === id);
  if (lead) {
    lead.status = status;
    saveLeads(leads);
  }
}

export function deleteLead(id: string) {
  saveLeads(getLeads().filter((l) => l.id !== id));
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isFollowUpDue(lead: Lead): boolean {
  return (
    !!lead.followUpDate &&
    lead.followUpDate <= todayISO() &&
    lead.status !== "Won" &&
    lead.status !== "Lost"
  );
}

export function formatCurrency(value: number): string {
  return (Number(value) || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}
