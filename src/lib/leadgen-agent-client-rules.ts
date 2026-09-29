// Client-safe copies of the two restriction rules (the server-only module
// leadgen-agent-active-client.ts can't be imported into a client component).
// Any leadgen_campaign_agents row puts an agent in RLS-restricted mode
// (migration 0077); zero rows means they can see every client.
export function assignmentWouldRestrictAgentClient(totalRows: number): boolean {
  return totalRows === 0;
}

export function removalWouldUnrestrictAgentClient(totalRows: number, rowsForClient: number): boolean {
  return totalRows - rowsForClient <= 0;
}
