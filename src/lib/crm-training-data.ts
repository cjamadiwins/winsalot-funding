import "server-only";
import type { createSupabaseServerClient } from "./supabase-server";
import type {
  CrmTrainingModuleRow,
  CrmTrainingModuleVersionRow,
  CrmTrainingModuleWithContent,
  CrmTrainingProgressRow,
  TrainingModuleContent,
} from "./crm-training-types";
import { EMPTY_TRAINING_MODULE_CONTENT } from "./crm-training-types";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function attachContent(modules: CrmTrainingModuleRow[], versions: CrmTrainingModuleVersionRow[]): CrmTrainingModuleWithContent[] {
  const contentByModuleAndVersion = new Map<string, TrainingModuleContent>();
  for (const v of versions) contentByModuleAndVersion.set(`${v.module_id}:${v.version}`, v.content);
  return modules.map((m) => ({
    ...m,
    content: contentByModuleAndVersion.get(`${m.id}:${m.current_version}`) ?? EMPTY_TRAINING_MODULE_CONTENT,
  }));
}

// Every module regardless of active/required status, for the admin
// management list - RLS (crm_training_modules_admin_all) permits this
// only because the caller is already gated by requireCrmAdmin().
export async function fetchAllModulesForAdmin(supabase: SupabaseClient): Promise<{ data: CrmTrainingModuleWithContent[]; error: string | null }> {
  const { data: modules, error } = await supabase.from("crm_training_modules").select("*").order("sort_order", { ascending: true });
  if (error) return { data: [], error: error.message };

  const moduleIds = (modules ?? []).map((m) => m.id);
  if (moduleIds.length === 0) return { data: [], error: null };

  const { data: versions, error: versionsError } = await supabase.from("crm_training_module_versions").select("*").in("module_id", moduleIds);
  if (versionsError) return { data: [], error: versionsError.message };

  return { data: attachContent(modules as CrmTrainingModuleRow[], (versions ?? []) as CrmTrainingModuleVersionRow[]), error: null };
}

export async function fetchModuleForAdmin(supabase: SupabaseClient, moduleId: string): Promise<{ data: CrmTrainingModuleWithContent | null; error: string | null }> {
  const { data: module, error } = await supabase.from("crm_training_modules").select("*").eq("id", moduleId).maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!module) return { data: null, error: "Module not found." };

  const { data: version, error: versionError } = await supabase
    .from("crm_training_module_versions")
    .select("*")
    .eq("module_id", moduleId)
    .eq("version", module.current_version)
    .maybeSingle();
  if (versionError) return { data: null, error: versionError.message };

  return {
    data: { ...(module as CrmTrainingModuleRow), content: (version?.content as TrainingModuleContent) ?? EMPTY_TRAINING_MODULE_CONTENT },
    error: null,
  };
}

// Active modules assigned to the 'agent' role - what both an agent's own
// dashboard and an admin's "view as a learner" experience show. RLS
// scopes an actual agent session to exactly this same set on its own
// (crm_training_modules_agent_select_assigned), so this query works
// correctly for either role without needing to branch on it.
export async function fetchActiveAssignedModules(supabase: SupabaseClient): Promise<{ data: CrmTrainingModuleWithContent[]; error: string | null }> {
  const { data: modules, error } = await supabase
    .from("crm_training_modules")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) return { data: [], error: error.message };

  const moduleIds = (modules ?? []).map((m) => m.id);
  if (moduleIds.length === 0) return { data: [], error: null };

  const { data: versions, error: versionsError } = await supabase.from("crm_training_module_versions").select("*").in("module_id", moduleIds);
  if (versionsError) return { data: [], error: versionsError.message };

  return { data: attachContent(modules as CrmTrainingModuleRow[], (versions ?? []) as CrmTrainingModuleVersionRow[]), error: null };
}

// This user's own progress rows, keyed by module_id -> their most recent
// row for that module (there can be more than one row per module across
// versions - see migration 0105's versioning comment - so this always
// prefers the highest module_version on record).
export async function fetchOwnProgressByModuleId(supabase: SupabaseClient, userId: string): Promise<{ data: Map<string, CrmTrainingProgressRow>; error: string | null }> {
  const { data, error } = await supabase.from("crm_training_progress").select("*").eq("user_id", userId);
  if (error) return { data: new Map(), error: error.message };

  const byModule = new Map<string, CrmTrainingProgressRow>();
  for (const row of (data ?? []) as CrmTrainingProgressRow[]) {
    const existing = byModule.get(row.module_id);
    if (!existing || row.module_version > existing.module_version) byModule.set(row.module_id, row);
  }
  return { data: byModule, error: null };
}

export type AgentProgressListRow = {
  userId: string;
  fullName: string;
  email: string;
  totalRequired: number;
  completedRequired: number;
  percentComplete: number;
  lastActivityAt: string | null;
};

// The admin's all-agents progress overview - one row per active agent.
export async function fetchAgentProgressList(supabase: SupabaseClient): Promise<{ data: AgentProgressListRow[]; error: string | null }> {
  const [{ data: agents, error: agentsError }, { data: modules, error: modulesError }, { data: progress, error: progressError }] = await Promise.all([
    supabase.from("crm_users").select("id, full_name, email").eq("role", "agent").eq("active", true).order("full_name"),
    supabase.from("crm_training_modules").select("id, is_active, is_required, current_version").eq("is_active", true),
    supabase.from("crm_training_progress").select("*"),
  ]);
  if (agentsError) return { data: [], error: agentsError.message };
  if (modulesError) return { data: [], error: modulesError.message };
  if (progressError) return { data: [], error: progressError.message };

  const requiredModules = ((modules ?? []) as Pick<CrmTrainingModuleRow, "id" | "is_active" | "is_required" | "current_version">[]).filter((m) => m.is_required);
  const allProgress = (progress ?? []) as CrmTrainingProgressRow[];

  const rows: AgentProgressListRow[] = ((agents ?? []) as { id: string; full_name: string; email: string }[]).map((agent) => {
    const ownRows = allProgress.filter((p) => p.user_id === agent.id);
    const byModule = new Map<string, CrmTrainingProgressRow>();
    for (const row of ownRows) {
      const existing = byModule.get(row.module_id);
      if (!existing || row.module_version > existing.module_version) byModule.set(row.module_id, row);
    }
    const completedRequired = requiredModules.filter((m) => {
      const p = byModule.get(m.id);
      return !!p && p.module_version === m.current_version && p.completed_at !== null;
    }).length;
    const lastActivityAt = ownRows.reduce<string | null>((latest, p) => {
      const candidate = p.completed_at ?? p.opened_at;
      if (!latest || candidate > latest) return candidate;
      return latest;
    }, null);

    return {
      userId: agent.id,
      fullName: agent.full_name || agent.email,
      email: agent.email,
      totalRequired: requiredModules.length,
      completedRequired,
      percentComplete: requiredModules.length === 0 ? 100 : Math.round((completedRequired / requiredModules.length) * 100),
      lastActivityAt,
    };
  });

  return { data: rows, error: null };
}

export type AgentModuleProgressDetail = CrmTrainingModuleWithContent & {
  progress: CrmTrainingProgressRow | null;
};

// One agent's full record - every active module plus that agent's own
// progress row (or null if never opened) - for the admin's per-agent
// detail page (view completions, timestamps, and reset controls).
export async function fetchAgentProgressDetail(
  supabase: SupabaseClient,
  userId: string
): Promise<{ data: { agent: { id: string; full_name: string; email: string } | null; modules: AgentModuleProgressDetail[] }; error: string | null }> {
  const [{ data: agent, error: agentError }, { data: modules, error: modulesError }, { data: progress, error: progressError }] = await Promise.all([
    supabase.from("crm_users").select("id, full_name, email").eq("id", userId).maybeSingle(),
    supabase.from("crm_training_modules").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("crm_training_progress").select("*").eq("user_id", userId),
  ]);
  if (agentError) return { data: { agent: null, modules: [] }, error: agentError.message };
  if (modulesError) return { data: { agent: null, modules: [] }, error: modulesError.message };
  if (progressError) return { data: { agent: null, modules: [] }, error: progressError.message };

  const moduleRows = (modules ?? []) as CrmTrainingModuleRow[];
  const moduleIds = moduleRows.map((m) => m.id);
  const { data: versions, error: versionsError } =
    moduleIds.length > 0
      ? await supabase.from("crm_training_module_versions").select("*").in("module_id", moduleIds)
      : { data: [] as CrmTrainingModuleVersionRow[], error: null };
  if (versionsError) return { data: { agent: null, modules: [] }, error: versionsError.message };

  const withContent = attachContent(moduleRows, (versions ?? []) as CrmTrainingModuleVersionRow[]);

  const byModule = new Map<string, CrmTrainingProgressRow>();
  for (const row of (progress ?? []) as CrmTrainingProgressRow[]) {
    const existing = byModule.get(row.module_id);
    if (!existing || row.module_version > existing.module_version) byModule.set(row.module_id, row);
  }

  return {
    data: {
      agent: (agent as { id: string; full_name: string; email: string } | null) ?? null,
      modules: withContent.map((m) => ({ ...m, progress: byModule.get(m.id) ?? null })),
    },
    error: null,
  };
}
