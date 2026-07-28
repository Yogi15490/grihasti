/**
 * Dev utility: regenerate db/migrations/0002_seed_products.sql from the
 * canonical designs list so the two never drift.
 *   node --experimental-strip-types scripts/gen-seed.mjs > db/migrations/0002_seed_products.sql
 * Stock quantities are placeholders keyed off each design's `weight` — replace
 * with real numbers after the Week-1 production pilot.
 */
const { DESIGNS } = await import("../src/data/designs.ts");
const stock = { high: 40, medium: 25, low: 15 };
const esc = (s) => s.replace(/'/g, "''");
let out = "-- Grihasti — product seed (generated from src/data/designs.ts)\n";
out += "-- Stock quantities are PLACEHOLDERS pending the Week-1 production pilot.\n\n";
for (const d of DESIGNS) {
  out += `insert into products (slug, name, type, description, price_inr, stock_qty, is_active) values ('${esc(d.slug)}', '${esc(d.name)}', '${d.type}', '${esc(d.persona + " — " + d.cues)}', ${d.priceInr}, ${stock[d.weight]}, true) on conflict (slug) do nothing;\n`;
}
process.stdout.write(out);
