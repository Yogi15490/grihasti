/**
 * Integration-test harness: a real Postgres, in-process.
 *
 * PGlite is genuine Postgres compiled to WASM — plpgsql, triggers, row locks
 * and NULLS NOT DISTINCT all behave as they will in production. That means the
 * migrations under test are the same SQL that ships, not a sqlite-shaped
 * approximation of it.
 *
 * KNOWN LIMIT: PGlite is single-connection, so it cannot exercise true
 * concurrency. The FOR UPDATE lock in signup_with_attribution is therefore
 * verified for logic here, but its race behaviour must be confirmed against a
 * real multi-connection Postgres before go-live. See tests marked CONCURRENCY.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Queryable } from "../../src/lib/db.ts";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, "..", "..", "db", "migrations");

export interface TestDb extends Queryable {
  close(): Promise<void>;
  /** Convenience: first row, or undefined. */
  one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  /** Convenience: single scalar from the first row/column. */
  scalar<T = unknown>(sql: string, params?: unknown[]): Promise<T>;
}

/** Fresh in-memory database with every migration applied, in order. */
export async function createTestDb(opts: { seed?: boolean } = {}): Promise<TestDb> {
  const pg = await PGlite.create();

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => (opts.seed ? true : !f.includes("seed")))
    .sort();

  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    try {
      await pg.exec(sql);
    } catch (e) {
      throw new Error(`Migration ${f} failed: ${(e as Error).message}`);
    }
  }

  const db: TestDb = {
    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
      const r = await pg.query(sql, params as never[]);
      return { rows: r.rows as T[] };
    },
    async one<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
      const { rows } = await db.query<T>(sql, params);
      return rows[0];
    },
    async scalar<T = unknown>(sql: string, params?: unknown[]) {
      const { rows } = await db.query<Record<string, T>>(sql, params);
      return Object.values(rows[0] ?? {})[0] as T;
    },
    async close() {
      await pg.close();
    },
  };

  return db;
}

/** Create a user through the real attribution path. Returns id + invite code. */
export async function signup(
  db: TestDb,
  email: string,
  ref?: string | null,
): Promise<{ id: string; code: string }> {
  const id = await db.scalar<string>(
    `select signup_with_attribution($1, null, null, $2)`,
    [email, ref ?? null],
  );
  const code = await db.scalar<string>(
    `select invite_code from users where id = $1`,
    [id],
  );
  return { id, code };
}

/** Ledger balance for a user, as a number. */
export async function balanceOf(db: TestDb, userId: string): Promise<number> {
  const v = await db.scalar<string>(`select points_balance($1)::text`, [userId]);
  return Number(v);
}

// ── Shared instance ──────────────────────────────────────────────────────
// Applying seven migrations takes ~1.5s, so a fresh PGlite per test pushed the
// suite past four minutes — long enough that it stops being run, which defeats
// the point of having it. Instead: build the schema once per file and truncate
// between tests. Isolation is equivalent; only the DDL is amortised.

const TABLES = [
  "points_ledger",
  "referral_events",
  "order_items",
  "orders",
  "sessions",
  "otp_codes",
  "waitlist",
  "products",
  "users",
  "invoice_counters",
];

let shared: TestDb | undefined;

/** Truncate every table, leaving schema and functions in place. */
export async function resetTestDb(db: TestDb): Promise<void> {
  await db.query(
    `truncate table ${TABLES.join(", ")} restart identity cascade`,
  );
}

/**
 * A clean database, reusing the shared schema. Drop-in replacement for
 * createTestDb() in tests that don't need their own migration run.
 *
 * `close()` is a no-op here — the instance outlives individual tests.
 */
export async function freshDb(): Promise<TestDb> {
  if (!shared) {
    const db = await createTestDb();
    shared = { ...db, close: async () => {} };
  }
  await resetTestDb(shared);
  return shared;
}
