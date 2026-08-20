import { Pool, types, type QueryResultRow } from "pg";

// pg's default parser turns a `date` column into a JS Date at UTC midnight,
// but every DateRange in this app (dates.ts) is a plain YYYY-MM-DD string —
// left alone, that mismatch is silent almost everywhere (Date <-> Date
// comparisons and re-serializing a Date back into a query both happen to
// work) until code treats the value as text, e.g. checkin.ts's
// `${dateISO}T${time}` — then it's Date.prototype.toString() spliced into a
// timestamp literal and Postgres rejects it. Fix once, here, instead of
// wherever a booking's checkin/checkout is next interpolated as a string.
types.setTypeParser(types.builtins.DATE, (value) => value);

// One pool for the whole process — Next.js keeps this module cached across
// requests in the same server instance. No ORM: the schema is small and
// stable enough that hand-written parameterized SQL is less code than
// wiring up and generating types for one.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

// Runs `fn` inside a single client so callers can issue multiple statements
// (e.g. a conflict check followed by an insert) without a race between them.
export async function withTransaction<T>(fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
