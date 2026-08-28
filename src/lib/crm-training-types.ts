// Growth CRM: Generic Winsalot Training Portal (migration 0105). See that
// migration's header comment for the full schema/versioning design.
//
// Kept entirely separate from crm_training_materials (crm-types.ts's
// CrmTrainingMaterialRow, the "Sales Training & Call Scripts" reference
// library) and from any client-campaign training - this file only covers
// the generic Winsalot Corp. module curriculum.

export type TrainingModuleContent = {
  learningObjective: string;
  explanation: string;
  steps: string[];
  examples: string[];
  approvedPhrases: string[];
  phrasesToAvoid: string[];
  commonMistakes: string[];
  keyReminders: string[];
  summary: string;
};

export const EMPTY_TRAINING_MODULE_CONTENT: TrainingModuleContent = {
  learningObjective: "",
  explanation: "",
  steps: [],
  examples: [],
  approvedPhrases: [],
  phrasesToAvoid: [],
  commonMistakes: [],
  keyReminders: [],
  summary: "",
};

export type CrmTrainingModuleRow = {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  slug: string;
  title: string;
  sort_order: number;
  is_required: boolean;
  is_active: boolean;
  current_version: number;
};

export type CrmTrainingModuleVersionRow = {
  id: string;
  module_id: string;
  version: number;
  title: string;
  content: TrainingModuleContent;
  is_major_revision: boolean;
  created_at: string;
  created_by: string | null;
};

// A module joined with the content of its own current_version - the
// shape every reader/editor screen actually works with.
export type CrmTrainingModuleWithContent = CrmTrainingModuleRow & {
  content: TrainingModuleContent;
};

export type CrmTrainingProgressRow = {
  id: string;
  user_id: string;
  module_id: string;
  module_version: number;
  opened_at: string;
  completed_at: string | null;
  created_at: string;
};

export type CrmTrainingAdminActionRow = {
  id: string;
  admin_id: string | null;
  admin_name: string;
  action:
    | "module_created"
    | "module_updated"
    | "module_reordered"
    | "module_activated"
    | "module_deactivated"
    | "module_required_changed"
    | "progress_reset";
  module_id: string | null;
  module_title: string | null;
  target_user_id: string | null;
  target_user_name: string | null;
  details: string | null;
  occurred_at: string;
};

// A module is "completed" for a user only when their latest progress row
// for it matches the module's *current* version - a completion recorded
// against an older version (before a major revision bumped
// current_version) never silently counts as still complete. This is what
// "require users to complete the revised version again" means at the
// data layer.
export function isModuleCompletedForUser(
  module: Pick<CrmTrainingModuleRow, "current_version">,
  progress: Pick<CrmTrainingProgressRow, "module_version" | "completed_at"> | undefined
): boolean {
  if (!progress) return false;
  return progress.module_version === module.current_version && progress.completed_at !== null;
}

export function isModuleOpenedForUser(
  module: Pick<CrmTrainingModuleRow, "current_version">,
  progress: Pick<CrmTrainingProgressRow, "module_version" | "opened_at"> | undefined
): boolean {
  if (!progress) return false;
  return progress.module_version === module.current_version && !!progress.opened_at;
}

export type TrainingProgressSummary = {
  totalModules: number;
  totalRequired: number;
  completedRequired: number;
  completedOptional: number;
  totalOptional: number;
  /** 0-100, rounded to the nearest whole percent. 100 when there are no required modules at all. */
  percentComplete: number;
};

// "Required modules count toward the overall completion percentage.
// Optional modules should not prevent 100% required completion." - the
// denominator here is *only* required modules; optional modules are
// tracked separately and never affect the percentage.
export function computeTrainingProgressSummary(
  modules: Pick<CrmTrainingModuleRow, "id" | "current_version" | "is_required">[],
  progressByModuleId: Map<string, Pick<CrmTrainingProgressRow, "module_version" | "completed_at">>
): TrainingProgressSummary {
  const required = modules.filter((m) => m.is_required);
  const optional = modules.filter((m) => !m.is_required);

  const completedRequired = required.filter((m) => isModuleCompletedForUser(m, progressByModuleId.get(m.id))).length;
  const completedOptional = optional.filter((m) => isModuleCompletedForUser(m, progressByModuleId.get(m.id))).length;

  const percentComplete = required.length === 0 ? 100 : Math.round((completedRequired / required.length) * 100);

  return {
    totalModules: modules.length,
    totalRequired: required.length,
    completedRequired,
    totalOptional: optional.length,
    completedOptional,
    percentComplete,
  };
}

// "Continue from the next incomplete module" - the first module (in
// sort_order) that isn't currently completed, preferring required
// modules over optional ones so an agent is always steered toward
// finishing the required curriculum first.
export function findNextIncompleteModule<T extends Pick<CrmTrainingModuleRow, "id" | "current_version" | "is_required" | "sort_order">>(
  modules: T[],
  progressByModuleId: Map<string, Pick<CrmTrainingProgressRow, "module_version" | "completed_at">>
): T | null {
  const sorted = [...modules].sort((a, b) => a.sort_order - b.sort_order);
  const incomplete = sorted.filter((m) => !isModuleCompletedForUser(m, progressByModuleId.get(m.id)));
  if (incomplete.length === 0) return null;
  const nextRequired = incomplete.find((m) => m.is_required);
  return nextRequired ?? incomplete[0];
}

// Parses the admin editor's one-item-per-line textarea inputs into a
// clean string array (trims each line, drops blank lines).
export function parseTrainingListField(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function trainingListFieldToTextarea(items: string[]): string {
  return items.join("\n");
}
