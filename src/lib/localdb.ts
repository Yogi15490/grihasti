/**
 * Grihasti — zero-setup local database.
 *
 * When DATABASE_URL is not set (and we're not in production), the app runs
 * against an embedded Postgres — the same PGlite build the tests use. It
 * applies every migration on first boot and persists to `.local-db/`, so
 * `npm run dev` gives a fully working site with no Supabase account, no
 * connection string and no configuration.
 *
 * This exists so the site can be clicked through and judged before any
 * infrastructure decisions are made. It is NEVER used in production —
 * see the guard in isLocalMode().
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Queryable } from "./db.ts";

export const LOCAL_DB_DIR = process.env.LOCAL_DB_DIR ?? ".local-db";

/** True when we should use the embedded database. */
export function isLocalMode(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return !process.env.DATABASE_URL;
}

export interface LocalDb extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
}

// Next dev reloads modules on every edit; without a global the database would
// be rebuilt (and re-migrated) on each hot reload.
const globalRef = globalThis as unknown as { __grihastiLocalDb?: Promise<LocalDb> };

async function build(): Promise<LocalDb> {
  const { PGlite } = await import("@electric-sql/pglite");
  // resolve(), not join(): LOCAL_DB_DIR may legitimately be an absolute path
  // (tests point it at a temp dir), and join() would splice it onto cwd.
  const dir = resolve(process.cwd(), LOCAL_DB_DIR);
  const firstRun = !existsSync(dir);

  const pg = await PGlite.create(dir);

  const migrationsDir = join(process.cwd(), "db", "migrations");
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

  // Migrations are written to be re-runnable (`if not exists`, `create or
  // replace`), so applying them on every boot is safe and keeps a persisted
  // database in step after a schema change.
  for (const f of files) {
    try {
      await pg.exec(readFileSync(join(migrationsDir, f), "utf8"));
    } catch (e) {
      console.error(`[local-db] migration ${f} failed:`, (e as Error).message);
      throw e;
    }
  }

  if (firstRun) {
    console.log(
      `\n  ✓ Local database created in ${LOCAL_DB_DIR}/ — ${files.length} migrations applied.` +
        `\n    No Supabase needed. Delete that folder to start over.\n`,
    );
  }

  const db: LocalDb = {
    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
      const r = await pg.query(sql, params as never[]);
      return { rows: r.rows as T[] };
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      return (await pg.transaction(async (tx) => {
        const wrapped: Queryable = {
          async query<T2 = Record<string, unknown>>(sql: string, params?: unknown[]) {
            const r = await tx.query(sql, params as never[]);
            return { rows: r.rows as T2[] };
          },
        };
        return fn(wrapped);
      })) as T;
    },
  };

  return db;
}

export function getLocalDb(): Promise<LocalDb> {
  if (!globalRef.__grihastiLocalDb) {
    globalRef.__grihastiLocalDb = build();
  }
  return globalRef.__grihastiLocalDb;
}

/**
 * In local mode the first person to sign in becomes an admin, so /admin is
 * reachable without hand-editing the database. Never runs in production.
 */
export async function promoteFirstUserToAdmin(db: Queryable): Promise<void> {
  if (!isLocalMode()) return;
  await db.query(
    `update users set is_admin = true
      where id = (select id from users order by created_at, id limit 1)
        and not exists (select 1 from users where is_admin)`,
  );
}
