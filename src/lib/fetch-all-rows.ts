// PostgREST silently truncates any response at the project's max-rows limit
// (1000 by default) without an error, so an unpaged read of a growing table
// quietly drops the oldest/arbitrary rows. Call logs passed 1000 rows, which
// made agent and admin totals and history incomplete. Page through every row
// instead.
//
// `build` must return a query with a deterministic order (e.g. created_at then
// id) so pages never overlap or skip rows.
const PAGE_SIZE = 1000;

type PageResult<Row> = PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;

export async function fetchAllRows<Row>(
  build: (from: number, to: number) => PageResult<Row>,
): Promise<{ data: Row[]; error: { message: string } | null }> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null };
  }
}
