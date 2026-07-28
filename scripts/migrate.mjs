/**
 * Grihasti — production migration runner.
 *
 * Applies db/migrations/*.sql in filename order against DATABASE_URL, recording
 * each one in `schema_migrations` so re-running is a no-op. This runs on every
 * deploy (see docker-compose web command), which means a deploy that ships a
 * new migration applies it automatically — and a deploy that doesn't, doesn't
 * touch the schema.
 *
 * Each migration runs inside its own transaction: a half-applied migration on
 * a database holding a money ledger is not a state worth being in.
 *
 * Usage: DATABASE_URL=postgres://... node scripts/migrate.mjs
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "db", "migrations");

const { DATABASE_URL, PGSSL } = process.env;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: PGSSL === "disable" ? undefined : { rejectUnauthorized: false },
});

const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);

async function main() {
  await client.connect();

  await client.query(`
    create table if not exists schema_migrations (
      filename    text primary key,
      checksum    text not null,
      applied_at  timestamptz not null default now()
    )
  `);

  const applied = new Map(
    (await client.query("select filename, checksum from schema_migrations")).rows.map(
      (r) => [r.filename, r.checksum],
    ),
  );

  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  let ran = 0;

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    const checksum = sha(sql);
    const previous = applied.get(file);

    if (previous) {
      // A migration that changed after being applied means someone edited
      // history. Warn loudly rather than silently diverging from production.
      if (previous !== checksum) {
        console.warn(
          `  ! ${file} has changed since it was applied ` +
            `(${previous} -> ${checksum}). Not re-running. ` +
            `Add a new migration instead of editing an applied one.`,
        );
      }
      continue;
    }

    process.stdout.write(`  → ${file} ... `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(
        "insert into schema_migrations (filename, checksum) values ($1, $2)",
        [file, checksum],
      );
      await client.query("commit");
      console.log("ok");
      ran++;
    } catch (e) {
      await client.query("rollback").catch(() => {});
      console.log("FAILED");
      console.error(`\nMigration ${file} failed:\n${e.message}\n`);
      process.exit(1);
    }
  }

  console.log(
    ran === 0
      ? `Schema up to date (${files.length} migrations already applied).`
      : `Applied ${ran} migration(s). ${files.length} total.`,
  );
}

main()
  .catch((e) => {
    console.error("Migration runner failed:", e.message);
    process.exit(1);
  })
  .finally(() => client.end().catch(() => {}));
