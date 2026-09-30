import type { LeadgenCallScriptClientFields } from "@/lib/leadgen-call-script";

// One assigned call list's approved script context. Built server-side from
// the existing Client -> Campaign/List -> Agent relationship and passed to
// the client script dock; the agent name is added client-side per viewer.
export type ScriptSessionPayload = {
  segmentId: string;
  segmentName: string;
  clientId: string;
  clientName: string;
  campaignId: string;
  campaignName: string;
  industry: string | null;
  websiteServices: boolean;
  // `call_script_override` already resolves list-level Admin text over the client's.
  client: LeadgenCallScriptClientFields;
};
