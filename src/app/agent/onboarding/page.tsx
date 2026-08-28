import { redirect } from "next/navigation";
import { requireCrmOnboardingUser } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { fetchActiveAssignedModules, fetchOwnProgressByModuleId } from "@/lib/crm-training-data";
import { computeTrainingProgressSummary } from "@/lib/crm-training-types";
import type { CrmAgentOnboardingRow } from "@/lib/crm-onboarding-types";
import OnboardingClient from "./OnboardingClient";

export default async function AgentOnboardingPage() {
  const user = await requireCrmOnboardingUser();
  const supabase = await createSupabaseServerClient();
  const [{ data: onboarding }, modulesResult, progressResult] = await Promise.all([
    supabase.from("crm_agent_onboarding").select("*").eq("agent_id", user.id).maybeSingle(),
    fetchActiveAssignedModules(supabase),
    fetchOwnProgressByModuleId(supabase, user.id),
  ]);

  if (!onboarding || onboarding.status === "approved") redirect("/agent/dashboard");
  const progress = computeTrainingProgressSummary(modulesResult.data, progressResult.data);

  return (
    <OnboardingClient
      user={{ fullName: user.full_name, email: user.email }}
      onboarding={onboarding as CrmAgentOnboardingRow}
      modules={modulesResult.data}
      progressByModuleId={Object.fromEntries(progressResult.data)}
      trainingProgress={progress}
    />
  );
}

