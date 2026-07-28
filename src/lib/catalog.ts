/**
 * Grihasti — catalog reads (spec §7.2, §7.3).
 *
 * Stock comes from the database on every request, never from build-time data.
 * On a limited drop with a three-week window, a cached "in stock" badge on a
 * sold-out design costs a sale and an apology email.
 */

import { query } from "./db.ts";
import { DESIGNS, type Design } from "../data/designs.ts";

const num = (v: unknown): number => Number(v ?? 0);

/** Below this, the UI switches to urgency copy. */
export const LOW_STOCK_AT = Number(process.env.LOW_STOCK_THRESHOLD ?? 5);

export interface CatalogItem {
  productId: string;
  slug: string;
  name: string;
  type: "caricature" | "giftset";
  priceInr: number;
  stockQty: number;
  isActive: boolean;
  isSoldOut: boolean;
  isLow: boolean;
  scentOptions: string[];
  /** Editorial copy from designs.ts — the DB holds commerce data, not voice. */
  design?: Design;
  /** Placeholder illustration until photography lands. See scripts/gen-avatars.mjs. */
  imageUrl: string;
}

/**
 * Product art. Served from our own origin as static SVG — no third-party
 * avatar CDN, which would be one more thing that can be slow or blocked on an
 * Indian mobile network during the only three weeks that matter.
 */
export function imageFor(slug: string): string {
  return `/designs/${slug}.svg`;
}

const designBySlug = new Map(DESIGNS.map((d) => [d.slug, d]));

function decorate(row: {
  id: string;
  slug: string;
  name: string;
  type: string;
  price_inr: string;
  stock_qty: number;
  is_active: boolean;
  scent_options: string[] | null;
}): CatalogItem {
  const stockQty = row.stock_qty;
  return {
    productId: row.id,
    slug: row.slug,
    name: row.name,
    type: row.type as CatalogItem["type"],
    priceInr: num(row.price_inr),
    stockQty,
    isActive: row.is_active,
    isSoldOut: stockQty <= 0,
    isLow: stockQty > 0 && stockQty <= LOW_STOCK_AT,
    scentOptions: row.scent_options ?? ["Aangan at Dusk", "Sunday Slow"],
    design: designBySlug.get(row.slug),
    imageUrl: imageFor(row.slug),
  };
}

/**
 * The collection. Sold-out designs stay visible but unbuyable — a gap in the
 * grid reads as a broken site, and "sold out" is social proof besides.
 */
export async function listCatalog(): Promise<CatalogItem[]> {
  const { rows } = await query<Parameters<typeof decorate>[0]>(
    `select id, slug, name, type, price_inr, stock_qty, is_active, scent_options
       from products
      where is_active
      order by (stock_qty = 0), type desc, name`,
  );
  return rows.map(decorate);
}

export async function getCatalogItem(slug: string): Promise<CatalogItem | null> {
  const { rows } = await query<Parameters<typeof decorate>[0]>(
    `select id, slug, name, type, price_inr, stock_qty, is_active, scent_options
       from products where slug = $1`,
    [slug],
  );
  return rows[0] ? decorate(rows[0]) : null;
}

/** Re-price and re-check a client-held cart. Never trust localStorage. */
export async function priceCart(
  lines: { slug: string; qty: number }[],
): Promise<{
  items: (CatalogItem & { qty: number; lineTotalInr: number; available: boolean })[];
  subtotalInr: number;
  hasProblems: boolean;
}> {
  if (!lines.length) return { items: [], subtotalInr: 0, hasProblems: false };

  const { rows } = await query<Parameters<typeof decorate>[0]>(
    `select id, slug, name, type, price_inr, stock_qty, is_active, scent_options
       from products where slug = any($1::text[])`,
    [lines.map((l) => l.slug)],
  );
  const bySlug = new Map(rows.map((r) => [r.slug, decorate(r)]));

  let subtotalInr = 0;
  let hasProblems = false;

  const items = lines.flatMap((l) => {
    const item = bySlug.get(l.slug);
    if (!item) {
      hasProblems = true;
      return [];
    }
    const available = item.isActive && item.stockQty >= l.qty;
    if (!available) hasProblems = true;
    // Price from the database, not from whatever the browser remembered.
    const lineTotalInr = Math.round(item.priceInr * l.qty * 100) / 100;
    subtotalInr += lineTotalInr;
    return [{ ...item, qty: l.qty, lineTotalInr, available }];
  });

  return { items, subtotalInr: Math.round(subtotalInr * 100) / 100, hasProblems };
}
