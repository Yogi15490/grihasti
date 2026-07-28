/**
 * Grihasti — database access.
 *
 * PORTABILITY CONTRACT: this file is the ONLY place that knows how we connect.
 * Everything above it speaks plain SQL against a `Queryable`. There is no
 * Supabase SDK, no PostgREST, no vendor auth. Moving from Supabase to a
 * self-hosted Postgres (Hetzner/Docker) is a DATABASE_URL change and a
 * pg_dump/pg_restore — no application code moves.
 *
 * Two backends, chosen automatically:
 *   · DATABASE_URL set  -> real Postgres over `pg` (Supabase, Hetzner, anything)
 *   · not set, non-prod -> embedded PGlite, migrations applied on boot
 *
 * The second exists so `npm run dev` works with zero setup. Production always
 * requires DATABASE_URL; see the throw in getDb().
 *
 * Consequence, stated plainly: because the client never talks to Postgres
 * directly, row-level security is NOT our authorization boundary. Every query
 * runs server-side under one role, so authorization is enforced in app code.
 * Do not add a client-side DB path later without revisiting that.
 */

import { Pool } from "pg";
import { isLocalMode, getLocalDb } from "./localdb.ts";

/** Minimal shape shared by `pg.Pool`, `pg.PoolClient` and PGlite. */
export interface Queryable {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}

let pool: Pool | undefined;

/** Real Postgres pool. Throws if DATABASE_URL is missing. */
export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set. In development the app falls back to an " +
          "embedded database — use getDb(), not getPool().",
      );
    }
    pool = new Pool({
      connectionString,
      max: Number(process.env.PGPOOL_MAX ?? 10),
      // Supabase and most managed hosts require TLS; a self-hosted box on a
      // private network may not. Opt out explicitly with PGSSL=disable.
      ssl: process.env.PGSSL === "disable" ? undefined : { rejectUnauthorized: false },
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return pool;
}

/** The active database, whichever backend is in play. Use this everywhere. */
export async function getDb(): Promise<Queryable> {
  if (isLocalMode()) return getLocalDb();
  return getPool() as unknown as Queryable;
}

/** Run a query against the active database. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<{ rows: T[] }> {
  const db = await getDb();
  return db.query<T>(sql, params);
}

/**
 * Run `fn` inside a transaction, rolling back on throw.
 *
 * Used wherever a partial write would corrupt the ledger or the invite gate —
 * i.e. payment confirmation, refunds and signup attribution.
 */
export async function transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
  if (isLocalMode()) {
    const local = await getLocalDb();
    return local.transaction(fn);
  }

  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client as unknown as Queryable);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Close the pool (tests, graceful shutdown). */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
