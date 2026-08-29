/**
 * A small in-memory stand-in for the Supabase client, for tests about
 * *sequencing* rather than about SQL.
 *
 * The cleanup tests are the reason it exists. What they need to pin is the
 * order of operations across two systems that cannot be committed together —
 * "the attachment rows are still there after storage refused" — and a mock that
 * returns a canned value for every call cannot express that: it has no state,
 * so it cannot show what survived. This one holds rows and objects, applies the
 * filters it is given, and therefore fails when the code under test deletes
 * something it should not have.
 *
 * It implements only the subset of the query builder this application uses, and
 * it is deliberately strict about filters: an unsupported operator throws
 * rather than being ignored, so a test cannot quietly pass because the fake
 * dropped the predicate that made it meaningful.
 */

export interface FakeRow {
  [column: string]: unknown;
}

type Op = 'select' | 'update' | 'delete' | 'insert' | 'upsert';

interface Filter {
  kind: 'eq' | 'neq' | 'in' | 'lt' | 'is';
  column: string;
  value: unknown;
}

export class FakeSupabase {
  readonly tables: Record<string, FakeRow[]> = {};
  /** Object storage, as `path -> present`. */
  readonly objects = new Set<string>();

  /** Set to make the next N storage `remove` calls fail. */
  storageRemoveFailures = 0;
  /** Every path a `remove` was asked to delete, in order. */
  readonly removeCalls: string[][] = [];
  /** Set to make storage `list` fail, modelling a bad minute rather than absence. */
  storageListFails = false;

  constructor(seed: Record<string, FakeRow[]> = {}) {
    for (const [table, rows] of Object.entries(seed)) {
      this.tables[table] = rows.map((row) => ({ ...row }));
    }
  }

  rows(table: string): FakeRow[] {
    this.tables[table] ??= [];
    return this.tables[table];
  }

  /** The object handed to application code. */
  client() {
    return {
      from: (table: string) => new FakeQuery(this, table),
      storage: {
        from: () => ({
          remove: async (paths: string[]) => {
            this.removeCalls.push([...paths]);
            if (this.storageRemoveFailures > 0) {
              this.storageRemoveFailures -= 1;
              // Shaped like a real Storage error, message included, so a test
              // can assert the message never reaches a log or a database row.
              return {
                data: null,
                error: {
                  message:
                    'Object not accessible: clipsync-attachments/b3f1c2d4-0000-4000-8000-000000000000/secret.png',
                  statusCode: '500',
                },
              };
            }
            // A key that is already gone is not an error — Supabase Storage does
            // not treat it as one, and it must not, because "the previous
            // attempt succeeded and then crashed" is the most likely reason for
            // a retry.
            for (const path of paths) this.objects.delete(path);
            return { data: paths.map((name) => ({ name })), error: null };
          },
          list: async (prefix: string) => {
            if (this.storageListFails) {
              return { data: null, error: { message: 'storage listing unavailable' } };
            }
            const inFolder = [...this.objects]
              .filter((path) => (prefix ? path.startsWith(`${prefix}/`) : true))
              .map((path) => (prefix ? path.slice(prefix.length + 1) : path.split('/')[0]));
            return { data: [...new Set(inFolder)].map((name) => ({ name })), error: null };
          },
        }),
      },
      rpc: async () => ({ data: null, error: null }),
    };
  }
}

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown; count?: number }> {
  private op: Op = 'select';
  private filters: Filter[] = [];
  private payload: FakeRow[] = [];
  private wantsCount = false;
  private headOnly = false;
  private limitValue: number | null = null;
  private orderBy: { column: string; ascending: boolean } | null = null;
  private selected = false;
  private conflictColumns: string[] = [];

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: string
  ) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }): this {
    this.selected = true;
    if (options?.count) this.wantsCount = true;
    if (options?.head) this.headOnly = true;
    return this;
  }

  insert(rows: FakeRow | FakeRow[]): this {
    this.op = 'insert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  /**
   * Upsert, keyed by the caller's `onConflict` column.
   *
   * Modelling the conflict is not optional detail here: `ops_runs` is one row
   * per job that every run overwrites, and a fake that always appended would
   * make "the cron ran twice" look like two jobs rather than one job with a
   * newer timestamp — hiding exactly the staleness an alert is written against.
   */
  upsert(rows: FakeRow | FakeRow[], options?: { onConflict?: string }): this {
    this.op = 'upsert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.conflictColumns =
      options?.onConflict?.split(',').map((column) => column.trim()) ?? [];
    return this;
  }

  update(values: FakeRow): this {
    this.op = 'update';
    this.payload = [values];
    return this;
  }

  delete(): this {
    this.op = 'delete';
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ kind: 'eq', column, value });
    return this;
  }

  in(column: string, value: unknown[]): this {
    this.filters.push({ kind: 'in', column, value });
    return this;
  }

  lt(column: string, value: unknown): this {
    this.filters.push({ kind: 'lt', column, value });
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push({ kind: 'is', column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderBy = { column, ascending: options?.ascending !== false };
    return this;
  }

  limit(value: number): this {
    this.limitValue = value;
    return this;
  }

  async maybeSingle() {
    const result = await this.run();
    const rows = (result.data as FakeRow[]) ?? [];
    return { ...result, data: rows[0] ?? null };
  }

  async single() {
    const result = await this.maybeSingle();
    if (!result.data) return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    return result;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private matches(row: FakeRow): boolean {
    return this.filters.every((filter) => {
      const actual = row[filter.column];
      switch (filter.kind) {
        case 'eq':
          return actual === filter.value;
        case 'neq':
          return actual !== filter.value;
        case 'in':
          return (filter.value as unknown[]).includes(actual);
        case 'lt':
          return String(actual) < String(filter.value);
        case 'is':
          return filter.value === null ? actual === null || actual === undefined : actual === filter.value;
        default:
          throw new Error(`fake-supabase: unsupported filter ${filter.kind}`);
      }
    });
  }

  private async run(): Promise<{ data: unknown; error: unknown; count?: number }> {
    const rows = this.db.rows(this.table);

    if (this.op === 'insert' || this.op === 'upsert') {
      for (const incoming of this.payload) {
        const existing =
          this.conflictColumns.length > 0
            ? rows.find((row) =>
                this.conflictColumns.every((column) => row[column] === incoming[column])
              )
            : undefined;

        if (existing) Object.assign(existing, incoming);
        else rows.push({ ...incoming });
      }
      return { data: this.payload, error: null };
    }

    let affected = rows.filter((row) => this.matches(row));

    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      affected = [...affected].sort((a, b) => {
        const left = String(a[column] ?? '');
        const right = String(b[column] ?? '');
        return ascending ? left.localeCompare(right) : right.localeCompare(left);
      });
    }
    if (this.limitValue !== null) affected = affected.slice(0, this.limitValue);

    if (this.op === 'update') {
      for (const row of affected) Object.assign(row, this.payload[0]);
    }
    if (this.op === 'delete') {
      for (const row of affected) rows.splice(rows.indexOf(row), 1);
    }

    if (this.wantsCount) {
      return { data: this.headOnly ? null : affected, error: null, count: affected.length };
    }
    // A mutation without a trailing `.select()` returns no rows, matching
    // PostgREST — which is what makes "did this update match anything?" a real
    // question the code has to ask for.
    if (this.op !== 'select' && !this.selected) return { data: null, error: null };

    return { data: affected.map((row) => ({ ...row })), error: null };
  }
}
