// Real attendance rows (read-only export) for the October 3-16, 2026 pay
// period, plus the first days of October for look-back. Neither agent has any
// break / lunch timestamps recorded. All timestamps are UTC.
import type { PayrollShiftRow } from "../../payroll-attendance";

export const GOODNESS_ID = "a8f77781-daed-4c5c-b8fa-09c27609ae14";
export const HENRY_ID = "79be9174-e168-4f0f-a7b8-7e97f662fc3d";

export const GOODNESS_ROWS: PayrollShiftRow[] = [
  { id: "g-1001", agent_id: "a8f77781-daed-4c5c-b8fa-09c27609ae14", clock_in: "2026-10-01T13:59:39.397Z", clock_out: "2026-10-01T21:06:08.332Z", total_minutes: 426, break1_start: null, break1_end: null, lunch_start: null, lunch_end: null, break2_start: null, break2_end: null },
  { id: "g-1002", agent_id: "a8f77781-daed-4c5c-b8fa-09c27609ae14", clock_in: "2026-10-02T13:59:17.469Z", clock_out: "2026-10-02T21:07:41.256Z", total_minutes: 428, break1_start: null, break1_end: null, lunch_start: null, lunch_end: null, break2_start: null, break2_end: null },
  { id: "g-1005", agent_id: "a8f77781-daed-4c5c-b8fa-09c27609ae14", clock_in: "2026-10-05T14:00:52.482Z", clock_out: "2026-10-05T21:02:53.677Z", total_minutes: 422, break1_start: null, break1_end: null, lunch_start: null, lunch_end: null, break2_start: null, break2_end: null },
  { id: "g-1006", agent_id: "a8f77781-daed-4c5c-b8fa-09c27609ae14", clock_in: "2026-10-06T14:00:19.37Z", clock_out: "2026-10-06T21:02:19.013Z", total_minutes: 421, break1_start: null, break1_end: null, lunch_start: null, lunch_end: null, break2_start: null, break2_end: null },
  { id: "g-1007", agent_id: "a8f77781-daed-4c5c-b8fa-09c27609ae14", clock_in: "2026-10-07T13:59:59.931Z", clock_out: "2026-10-07T21:02:17.113Z", total_minutes: 422, break1_start: null, break1_end: null, lunch_start: null, lunch_end: null, break2_start: null, break2_end: null },
  { id: "g-1008", agent_id: "a8f77781-daed-4c5c-b8fa-09c27609ae14", clock_in: "2026-10-08T13:59:39.419Z", clock_out: "2026-10-08T21:20:43.153Z", total_minutes: 441, break1_start: null, break1_end: null, lunch_start: null, lunch_end: null, break2_start: null, break2_end: null },
  { id: "g-1009", agent_id: "a8f77781-daed-4c5c-b8fa-09c27609ae14", clock_in: "2026-10-09T13:59:49.032Z", clock_out: "2026-10-09T21:02:25.778Z", total_minutes: 422, break1_start: null, break1_end: null, lunch_start: null, lunch_end: null, break2_start: null, break2_end: null },
  { id: "g-1013", agent_id: "a8f77781-daed-4c5c-b8fa-09c27609ae14", clock_in: "2026-10-13T13:59:48.82Z", clock_out: "2026-10-13T21:08:32.7Z", total_minutes: 428, break1_start: null, break1_end: null, lunch_start: null, lunch_end: null, break2_start: null, break2_end: null },
  { id: "g-1014", agent_id: "a8f77781-daed-4c5c-b8fa-09c27609ae14", clock_in: "2026-10-14T13:59:40.472Z", clock_out: "2026-10-14T21:12:02.85Z", total_minutes: 432, break1_start: null, break1_end: null, lunch_start: null, lunch_end: null, break2_start: null, break2_end: null },
  { id: "g-1015", agent_id: "a8f77781-daed-4c5c-b8fa-09c27609ae14", clock_in: "2026-10-15T13:59:20.024Z", clock_out: "2026-10-15T21:05:36.782Z", total_minutes: 426, break1_start: null, break1_end: null, lunch_start: null, lunch_end: null, break2_start: null, break2_end: null },
  { id: "g-1016", agent_id: "a8f77781-daed-4c5c-b8fa-09c27609ae14", clock_in: "2026-10-16T13:59:58.757Z", clock_out: null, total_minutes: null, break1_start: null, break1_end: null, lunch_start: null, lunch_end: null, break2_start: null, break2_end: null },
];

export const HENRY_ROWS: PayrollShiftRow[] = [
  { id: "h-1001", agent_id: "79be9174-e168-4f0f-a7b8-7e97f662fc3d", clock_in: "2026-10-01T13:59:50.274Z", clock_out: "2026-10-01T20:32:51.499Z", total_minutes: 393, break1_start: null, break1_end: null, lunch_start: null, lunch_end: null, break2_start: null, break2_end: null },
  { id: "h-1002", agent_id: "79be9174-e168-4f0f-a7b8-7e97f662fc3d", clock_in: "2026-10-02T14:07:23.238Z", clock_out: "2026-10-02T20:12:14.033Z", total_minutes: 364, break1_start: null, break1_end: null, lunch_start: null, lunch_end: null, break2_start: null, break2_end: null },
  { id: "h-1006", agent_id: "79be9174-e168-4f0f-a7b8-7e97f662fc3d", clock_in: "2026-10-06T13:59:37.599Z", clock_out: "2026-10-06T20:07:42.035Z", total_minutes: 368, break1_start: null, break1_end: null, lunch_start: null, lunch_end: null, break2_start: null, break2_end: null },
  { id: "h-1007", agent_id: "79be9174-e168-4f0f-a7b8-7e97f662fc3d", clock_in: "2026-10-07T14:11:12.504Z", clock_out: "2026-10-08T13:40:55.804Z", total_minutes: 1409, break1_start: null, break1_end: null, lunch_start: null, lunch_end: null, break2_start: null, break2_end: null },
  { id: "h-1008", agent_id: "79be9174-e168-4f0f-a7b8-7e97f662fc3d", clock_in: "2026-10-08T14:04:12.499Z", clock_out: "2026-10-08T19:02:35.71Z", total_minutes: 298, break1_start: null, break1_end: null, lunch_start: null, lunch_end: null, break2_start: null, break2_end: null },
  { id: "h-1009", agent_id: "79be9174-e168-4f0f-a7b8-7e97f662fc3d", clock_in: "2026-10-09T14:00:09.632Z", clock_out: "2026-10-13T13:51:36.826Z", total_minutes: 5751, break1_start: null, break1_end: null, lunch_start: null, lunch_end: null, break2_start: null, break2_end: null },
  { id: "h-1013", agent_id: "79be9174-e168-4f0f-a7b8-7e97f662fc3d", clock_in: "2026-10-13T13:59:43.608Z", clock_out: "2026-10-13T20:10:58.236Z", total_minutes: 371, break1_start: null, break1_end: null, lunch_start: null, lunch_end: null, break2_start: null, break2_end: null },
  { id: "h-1014", agent_id: "79be9174-e168-4f0f-a7b8-7e97f662fc3d", clock_in: "2026-10-14T14:26:49.382Z", clock_out: "2026-10-14T20:45:57.585Z", total_minutes: 379, break1_start: null, break1_end: null, lunch_start: null, lunch_end: null, break2_start: null, break2_end: null },
  { id: "h-1015", agent_id: "79be9174-e168-4f0f-a7b8-7e97f662fc3d", clock_in: "2026-10-15T13:59:34.834Z", clock_out: "2026-10-16T13:55:43.873Z", total_minutes: 1436, break1_start: null, break1_end: null, lunch_start: null, lunch_end: null, break2_start: null, break2_end: null },
  { id: "h-1016", agent_id: "79be9174-e168-4f0f-a7b8-7e97f662fc3d", clock_in: "2026-10-16T13:59:56.395Z", clock_out: null, total_minutes: null, break1_start: null, break1_end: null, lunch_start: null, lunch_end: null, break2_start: null, break2_end: null },
];
