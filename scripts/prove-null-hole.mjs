/**
 * Demonstrates why migration 0004 exists.
 *
 * Builds two tables — one with the unique constraint EXACTLY as spec §6 writes
 * it, one with NULLS NOT DISTINCT — and replays a duplicate REDEEM row against
 * each, as a retried Razorpay webhook would.
 *
 * Run: node scripts/prove-null-hole.mjs
 */
import { PGlite } from "@electric-sql/pglite";

const db = await PGlite.create();

const ORDER = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";

async function trial(label, constraintSql) {
  await db.exec(`drop table if exists l;
    create table l (
      order_id uuid, user_id uuid, type text, level int, amount numeric(12,4),
      ${constraintSql}
    );`);

  const ins = `insert into l values ('${ORDER}','${USER}','REDEEM',null,-100)`;
  await db.exec(ins);
  let blocked = false;
  try {
    await db.exec(ins); // the webhook retry
  } catch {
    blocked = true;
  }

  const { rows } = await db.query(
    "select count(*)::int as n, coalesce(sum(amount),0)::text as s from l",
  );
  console.log(
    `${label}\n  duplicate blocked : ${blocked}\n` +
      `  REDEEM rows       : ${rows[0].n}\n` +
      `  customer balance  : ₹${rows[0].s}\n`,
  );
  return rows[0].n;
}

console.log("\nReplaying a duplicate REDEEM (level IS NULL), as a retried webhook would:\n");

const specRows = await trial(
  "SPEC §6 as written  — unique (order_id, user_id, type, level)",
  "unique (order_id, user_id, type, level)",
);
const fixedRows = await trial(
  "MIGRATION 0004      — ... nulls not distinct",
  "unique nulls not distinct (order_id, user_id, type, level)",
);

console.log(
  specRows === 2 && fixedRows === 1
    ? "CONFIRMED: the spec's guard does not cover NULL levels. The customer is\n" +
        "debited ₹200 for ₹100 of points they spent once. Migration 0004 closes it."
    : `UNEXPECTED: spec=${specRows} fixed=${fixedRows} — re-check before trusting this.`,
);

await db.close();
