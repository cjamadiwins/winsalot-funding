// Types for the shared, cross-CRM training-completion table
// (crm_shared_training_completions, migration 0159). See that migration's
// header for why this is a separate, narrow table rather than reusing
// crm_training_progress (Growth-only, no quiz score) or crm_training_materials
// (no completion tracking at all).

export type SharedTrainingCrm = "growth" | "leadgen";

export type SharedTrainingCompletionRow = {
  id: string;
  created_at: string;
  updated_at: string;
  training_key: string;
  training_version: number;
  crm_user_id: string | null;
  leadgen_user_id: string | null;
  user_name: string;
  user_email: string;
  quiz_score: number;
  quiz_total: number;
  passed: boolean;
  completed_at: string;
};

// Bump this if the manual's content changes materially enough that agents
// who already completed it should be asked to review and re-complete it.
export const COLD_CALLING_TRAINING_KEY = "cold_calling_quality_standards";
export const COLD_CALLING_TRAINING_VERSION = 1;
export const COLD_CALLING_PASS_THRESHOLD = 0.8;
