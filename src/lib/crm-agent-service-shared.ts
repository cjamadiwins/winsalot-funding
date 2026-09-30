import type { OpportunityType } from "./crm-types";

// Growth CRM Agent Service Assignment (Admin-controlled). Client-safe so the
// Admin control and the agent forms share one definition; the server-only
// lookup lives in crm-agent-service.ts. The database enforces the same rule
// with RESTRICTIVE RLS policies (crm_agent_service_ok, migration
// 20260930030000) - this file only mirrors it for UI choices and clear errors.

export const AGENT_SERVICES = ["lead_generation", "business_financing", "both"] as const;
export type AgentService = (typeof AGENT_SERVICES)[number];

export const AGENT_SERVICE_LABELS: Record<AgentService, string> = {
  lead_generation: "Lead Generation",
  business_financing: "Business Finance",
  both: "Both",
};

export function isAgentService(value: unknown): value is AgentService {
  return typeof value === "string" && (AGENT_SERVICES as readonly string[]).includes(value);
}

// A 'both_services' record needs a 'both' assignment; no assignment means no
// Growth service at all.
export function serviceAllowsOpportunityType(service: AgentService | null, type: string): boolean {
  if (!service) return false;
  if (service === "both") return true;
  return service === type;
}

export function allowedOpportunityTypes(service: AgentService | null): OpportunityType[] {
  if (!service) return [];
  if (service === "both") return ["lead_generation", "business_financing", "both_services"];
  return [service];
}
