import { redirect } from "next/navigation";

// This route (backed by the legacy crm_attendance table, migration
// 0007/0043) has been retired in favor of /agent/my-attendance, which
// reads the live, payroll-integrated agent_attendance table and now
// includes break tracking (migration 0075). crm_attendance's own rows
// are left exactly as they are - nothing here drops or alters that
// data - this route just stops sending anyone new to it.
export default function AgentAttendancePage() {
  redirect("/agent/my-attendance");
}
