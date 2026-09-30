// Minimal in-memory stand-in for the parts of the Supabase query builder
// this codebase actually uses (select/insert/update/delete + eq/is +
// single/maybeSingle). Only for unit tests — not a general Supabase mock.

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

interface Query {
  select(cols?: string): Query;
  insert(payload: Row | Row[]): Query;
  update(payload: Row): Query;
  delete(): Query;
  eq(col: string, val: unknown): Query;
  is(col: string, val: unknown): Query;
  single(): Promise<{ data: Row | null; error: Error | null }>;
  maybeSingle(): Promise<{ data: Row | null; error: Error | null }>;
  then<T>(
    resolve: (value: { data: Row[] | null; error: Error | null }) => T,
  ): Promise<T>;
}

export function createFakeSupabase(initialTables: Tables) {
  const tables: Tables = Object.fromEntries(
    Object.entries(initialTables).map(([name, rows]) => [name, rows.map((r) => ({ ...r }))]),
  );

  function from(table: string) {
    if (!tables[table]) tables[table] = [];
    const filters: Array<(row: Row) => boolean> = [];
    let mode: "select" | "insert" | "update" | "delete" = "select";
    let mutated = false;
    let payload: Row | Row[] | null = null;
    let selectCols: string | undefined;

    function matched(): Row[] {
      return tables[table].filter((row) => filters.every((f) => f(row)));
    }

    function project(rows: Row[]): Row[] {
      if (!selectCols || selectCols.trim() === "*") return rows;
      const cols = selectCols.split(",").map((c) => c.trim());
      return rows.map((row) => Object.fromEntries(cols.map((c) => [c, row[c]])));
    }

    function execute(): { data: Row[] | null; error: Error | null } {
      if (mode === "select") {
        return { data: project(matched()), error: null };
      }
      if (mode === "insert") {
        const rows = (Array.isArray(payload) ? payload : [payload]) as Row[];
        const inserted = rows.map((r) => ({ id: r.id ?? crypto.randomUUID(), ...r }));
        tables[table].push(...inserted);
        return { data: inserted, error: null };
      }
      if (mode === "update") {
        const rows = matched();
        // Mirrors the wire format: JSON.stringify drops undefined keys, so
        // an undefined value means "leave this column alone," same as the
        // real postgrest-js client.
        const defined = JSON.parse(JSON.stringify(payload ?? {}));
        for (const row of rows) Object.assign(row, defined);
        return { data: rows, error: null };
      }
      if (mode === "delete") {
        const rows = matched();
        tables[table] = tables[table].filter((row) => !rows.includes(row));
        return { data: rows, error: null };
      }
      return { data: null, error: new Error(`unsupported mode ${mode}`) };
    }

    const query: Query = {
      select(cols) {
        if (!mutated) mode = "select";
        selectCols = cols;
        return query;
      },
      insert(p) {
        mode = "insert";
        mutated = true;
        payload = p;
        return query;
      },
      update(p) {
        mode = "update";
        mutated = true;
        payload = p;
        return query;
      },
      delete() {
        mode = "delete";
        mutated = true;
        return query;
      },
      eq(col, val) {
        filters.push((row) => row[col] === val);
        return query;
      },
      is(col, val) {
        filters.push((row) => row[col] === val);
        return query;
      },
      async single() {
        const { data, error } = execute();
        if (error) return { data: null, error };
        const rows = data ?? [];
        if (rows.length !== 1) {
          return { data: null, error: new Error(`expected 1 row, got ${rows.length}`) };
        }
        return { data: rows[0], error: null };
      },
      async maybeSingle() {
        const { data, error } = execute();
        if (error) return { data: null, error };
        const rows = data ?? [];
        return { data: rows[0] ?? null, error: null };
      },
      then(resolve) {
        return Promise.resolve(execute()).then(resolve);
      },
    };

    return query;
  }

  return { from, tables };
}
