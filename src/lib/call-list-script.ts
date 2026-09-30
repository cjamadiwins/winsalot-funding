import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { CALL_SCRIPT_MAX_LENGTH, isValidGrowthScriptKey, normalizeScriptText } from "./call-list-script-shared";
import type { CallListSegmentRow } from "./call-list-types";

// Admin-only: attach/update the call script for one call list. Writes only the
// list's two script columns - never a call log, lead, opportunity or
// appointment - so history is untouched. Both CRMs' server actions gate on
// their own requireAdmin first.
export async function saveSegmentScript(segment: CallListSegmentRow, input: { key: string | null; text: string | null }): Promise<void> {
  const text = normalizeScriptText(input.text);
  if (text && text.length > CALL_SCRIPT_MAX_LENGTH) throw new Error(`The script is too long (max ${CALL_SCRIPT_MAX_LENGTH} characters).`);

  let key: string | null = null;
  if (segment.crm === "growth") {
    key = input.key || null;
    if (!isValidGrowthScriptKey(key)) throw new Error("Choose one of the available script templates.");
  } else if (input.key) {
    throw new Error("Lead Generation lists use the client's script or a custom script.");
  }

  const { error } = await getSupabaseAdmin().from("call_list_segments").update({ call_script_key: key, call_script_text: text }).eq("id", segment.id);
  if (error) throw new Error(`Failed to save the script: ${error.message}`);
}
