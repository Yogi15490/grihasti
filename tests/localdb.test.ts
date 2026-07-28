/**
 * Zero-setup local database mode.
 *
 * Exercises the exact code path `npm run dev` takes when DATABASE_URL is unset:
 * boot the embedded Postgres, apply every migration from db/migrations, seed
 * the catalog, and run a real order end to end.
 *
 * This is the safety net for a feature whose whole promise is "it just works
 * with no configuration" — if migrations or the seed break, this fails here
 * rather than on someone's first `npm run dev`.
 */

import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Must be set before importing localdb — the module reads it at load time.
const TMP_DB = join(tmpdir(), `grihasti-localdb-test-${process.pid}`);
process.env.LOCAL_DB_DIR = TMP_DB;
delete process.env.DATABASE_URL;

const { getLocalDb, isLocalMode, promoteFirstUserToAdmin } = await import("../src/lib/localdb.ts");
const { createOrder, confirmPayment } = await import("../src/lib/orders.ts");
const { listCatalog } = await import("../src/lib/catalog.ts");

after(() => {
  try { rmSync(TMP_DB, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe("local mode detection", () => {
  test("is on when DATABASE_URL is absent and we're not in production", () => {
    assert.equal(isLocalMode(), true);
  });

  test("is OFF in production, whatever else is set", () => {
    // A local WASM database must never back a real storefront.
    // NODE_ENV is typed read-only by @types/node, so poke the env object
    // directly — this is exactly the runtime condition we need to assert.
    const env = process.env as Record<string, string | undefined>;
    const prev = env.NODE_ENV;
    try {
      env.NODE_ENV = "production";
      assert.equal(isLocalMode(), false);
    } finally {
      if (prev === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = prev;
    }
  });

  test("is OFF whenever a real DATABASE_URL is provided", () => {
    process.env.DATABASE_URL = "postgres://user:pass@host:5432/db";
    try {
      assert.equal(isLocalMode(), false);
    } finally {
      delete process.env.DATABASE_URL;
    }
  });
});

describe("boot", () => {
  test("applies every migration and seeds the catalog", async () => {
    const db = await getLocalDb();

    // Every table the app touches must exist after boot.
    const { rows } = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const tables = new Set(rows.map((r) => r.table_name));
    for (const t of [
      "users", "products", "orders", "order_items", "points_ledger",
      "referral_events", "waitlist", "otp_codes", "sessions",
      "invoice_counters", "admin_actions",
    ]) {
      assert.ok(tables.has(t), `missing table: ${t}`);
    }

    // Seed ran — 14 caricatures + the gift set.
    const products = await db.query<{ n: string }>(`select count(*)::text as n from products`);
    assert.equal(Number(products.rows[0].n), 15, "catalog seeded from 0002");
  });

  test("returns the same instance on repeated calls (survives hot reload)", async () => {
    const a = await getLocalDb();
    const b = await getLocalDb();
    assert.equal(a, b, "re-migrating on every render would be ruinous");
  });

  test("listCatalog reads the seeded products", async () => {
    const items = await listCatalog();
    assert.equal(items.length, 15);
    const cool = items.find((i) => i.slug === "cool-bhaiya");
    assert.ok(cool, "seeded design present");
    assert.equal(cool!.priceInr, 900);
    assert.ok(cool!.stockQty > 0, "seed gives it stock so the site is usable");
  });
});

describe("a real order, on the local database", () => {
  test("full chain: signup, referral, order, cashback to three levels", async () => {
    const db = await getLocalDb();

    const mk = async (email: string, ref?: string) => {
      const id = await db
        .query<{ signup_with_attribution: string }>(
          `select signup_with_attribution($1, null, null, $2)`, [email, ref ?? null],
        )
        .then((r) => r.rows[0].signup_with_attribution);
      const code = await db
        .query<{ invite_code: string }>(`select invite_code from users where id = $1`, [id])
        .then((r) => r.rows[0].invite_code);
      return { id, code };
    };

    const a = await mk("local-a@example.com");
    const b = await mk("local-b@example.com", a.code);
    const c = await mk("local-c@example.com", b.code);
    const d = await mk("local-d@example.com", c.code);

    const order = await createOrder(db, {
      userId: d.id,
      items: [{ slug: "cool-bhaiya", qty: 1, scent: "Sunday Slow" }],
    });
    assert.equal(order.grossTotalInr, 900);

    await confirmPayment(db, {
      orderId: order.orderId,
      provider: "dev",
      paymentRef: `dev_${order.orderId}`,
      amountInr: 900,
    });

    const bal = async (id: string) =>
      Number(
        (await db.query<{ points_balance: string }>(`select points_balance($1)`, [id]))
          .rows[0].points_balance,
      );

    assert.equal(await bal(d.id), 45, "buyer 5%");
    assert.equal(await bal(c.id), 22.5, "L1");
    assert.equal(await bal(b.id), 11.25, "L2");
    assert.equal(await bal(a.id), 5.625, "L3");

    const invoice = await db.query<{ gst_invoice_no: string }>(
      `select gst_invoice_no from orders where id = $1`, [order.orderId],
    );
    assert.match(invoice.rows[0].gst_invoice_no, /^GRH\/\d{4}-\d{2}\/\d{5}$/);
  });

  test("transactions roll back on the local backend", async () => {
    const db = await getLocalDb();
    const before = await db
      .query<{ n: string }>(`select count(*)::text as n from users`)
      .then((r) => Number(r.rows[0].n));

    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.query(
          `select signup_with_attribution('rollback@example.com', null, null, null)`,
        );
        throw new Error("boom");
      }),
      /boom/,
    );

    const after_ = await db
      .query<{ n: string }>(`select count(*)::text as n from users`)
      .then((r) => Number(r.rows[0].n));
    assert.equal(after_, before, "a failed transaction must leave nothing behind");
  });

  test("first user is promoted to admin so /admin is reachable", async () => {
    const db = await getLocalDb();
    await promoteFirstUserToAdmin(db);

    const admins = await db.query<{ n: string }>(
      `select count(*)::text as n from users where is_admin`,
    );
    assert.equal(Number(admins.rows[0].n), 1, "exactly one admin, not everybody");
  });
});
