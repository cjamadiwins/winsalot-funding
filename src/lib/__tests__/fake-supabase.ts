// Minimal in-memory stand-in for the Supabase query builder, just rich enough
// to run the real server actions / webhook route in tests: select / insert /
// upsert / update with eq, neq, is, ilike, order, limit, select(), single()
// and maybeSingle(). Column lists are ignored (whole rows come back).

export type Row = Record<string, unknown>;
export type Write = { table: string; op: "insert" | "upsert" | "update" | "delete"; values?: Row | Row[]; matched?: Row[] };

export function createFakeDb(initial: Record<string, Row[]> = {}, options: { failTables?: string[]; defaults?: Record<string, Row>; uniques?: Record<string, string[]> } = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(initial)) tables[name] = rows.map((r) => ({ ...r }));
  const writes: Write[] = [];
  let sequence = 0;

  function ilikeToRegExp(pattern: string): RegExp {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
    return new RegExp(`^${escaped}$`, "i");
  }

  function from(table: string) {
    type Op = "select" | "insert" | "upsert" | "update" | "delete";
    let op: Op = "select";
    let payload: Row | Row[] | undefined;
    let upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean } | undefined;
    let returning = false;
    let orderColumn: string | null = null;
    let ascending = true;
    let max: number | null = null;
    const filters: ((row: Row) => boolean)[] = [];

    async function execute(mode: "many" | "single" | "maybe") {
      if (options.failTables?.includes(table)) return { data: null, error: { message: `relation "${table}" does not exist`, code: "42P01" } };
      const rows = (tables[table] ??= []);
      let affected: Row[] = [];

      if (op === "insert" || op === "upsert") {
        const incoming = (Array.isArray(payload) ? payload : [payload ?? {}]) as Row[];
        for (const values of incoming) {
          if (op === "upsert" && upsertOptions?.onConflict) {
            const keys = upsertOptions.onConflict.split(",").map((k) => k.trim());
            const existing = rows.find((r) => keys.every((k) => r[k] === values[k]));
            if (existing) {
              if (!upsertOptions.ignoreDuplicates) Object.assign(existing, values);
              continue;
            }
          }
          // Unique columns (each individually unique when non-null), like a unique index.
          const clash = (options.uniques?.[table] ?? []).find((column) => values[column] != null && rows.some((r) => r[column] === values[column]));
          if (op === "insert" && clash) return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint on ${table}.${clash}` } };
          const row: Row = { id: `${table}-${++sequence}`, created_at: new Date().toISOString(), ...(options.defaults?.[table] ?? {}), ...values };
          rows.push(row);
          affected.push(row);
        }
        writes.push({ table, op, values: payload });
      } else if (op === "update") {
        affected = rows.filter((r) => filters.every((f) => f(r)));
        for (const row of affected) Object.assign(row, payload);
        writes.push({ table, op, values: payload, matched: affected });
      } else if (op === "delete") {
        affected = rows.filter((r) => filters.every((f) => f(r)));
        tables[table] = rows.filter((r) => !affected.includes(r));
        writes.push({ table, op, matched: affected });
      } else {
        affected = rows.filter((r) => filters.every((f) => f(r)));
        if (orderColumn) {
          const column = orderColumn;
          affected = [...affected].sort((a, b) => (String(a[column] ?? "") < String(b[column] ?? "") ? -1 : 1) * (ascending ? 1 : -1));
        }
        if (max !== null) affected = affected.slice(0, max);
      }

      const wantsRows = op === "select" || returning;
      if (!wantsRows) return { data: null, error: null };
      if (mode === "many") return { data: affected.map((r) => ({ ...r })), error: null };
      return { data: affected[0] ? { ...affected[0] } : null, error: mode === "single" && !affected[0] ? { message: "no rows" } : null };
    }

    const builder = {
      select: () => {
        returning = true;
        return builder;
      },
      insert: (values: Row | Row[]) => {
        op = "insert";
        payload = values;
        return builder;
      },
      upsert: (values: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
        op = "upsert";
        payload = values;
        upsertOptions = opts;
        return builder;
      },
      update: (values: Row) => {
        op = "update";
        payload = values;
        return builder;
      },
      delete: () => {
        op = "delete";
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters.push((r) => r[column] === value);
        return builder;
      },
      neq: (column: string, value: unknown) => {
        filters.push((r) => r[column] !== value);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        filters.push((r) => values.includes(r[column]));
        return builder;
      },
      is: (column: string, value: unknown) => {
        filters.push((r) => (r[column] ?? null) === value);
        return builder;
      },
      ilike: (column: string, pattern: string) => {
        const regex = ilikeToRegExp(pattern);
        filters.push((r) => regex.test(String(r[column] ?? "")));
        return builder;
      },
      order: (column: string, opts?: { ascending?: boolean }) => {
        orderColumn = column;
        ascending = opts?.ascending !== false;
        return builder;
      },
      limit: (count: number) => {
        max = count;
        return builder;
      },
      maybeSingle: () => execute("maybe"),
      single: () => execute("single"),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => execute("many").then(resolve, reject),
    };
    return builder;
  }

  return { client: { from }, tables, writes };
}
