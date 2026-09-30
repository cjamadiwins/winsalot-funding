// Client-safe copies of the assignment rules (the server-only module
// leadgen-agent-active-client.ts can't be imported into a client component).
// Agents work ONLY the clients Admin has currently assigned
// (leadgen_campaign_agents). Zero rows means no client access at all, so
// neither assigning nor removing a client can ever widen an agent's access and
// no "unrestricted" confirmation exists any more.
export function assignmentWouldRestrictAgentClient(_totalRows: number): boolean { // eslint-disable-line @typescript-eslint/no-unused-vars
  return false;
}

export function removalWouldUnrestrictAgentClient(_totalRows: number, _rowsForClient: number): boolean { // eslint-disable-line @typescript-eslint/no-unused-vars
  return false;
}
