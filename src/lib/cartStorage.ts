/**
 * Grihasti — browser-side cart.
 *
 * The cart is a convenience, not a source of truth. Prices and stock held here
 * are for display only; both are re-read from the database at checkout
 * (see catalog.priceCart and orders.createOrder). Nothing a customer can edit
 * in devtools reaches the ledger.
 */

export const CART_KEY = "grihasti_cart";
export const CART_EVENT = "grihasti:cart";

export interface CartLine {
  slug: string;
  name: string;
  /** Display price at time of adding — re-priced server-side at checkout. */
  unitPriceInr: number;
  qty: number;
  scent: string;
  nameMessage: string;
}

function isLine(v: unknown): v is CartLine {
  const l = v as CartLine;
  return (
    !!l &&
    typeof l.slug === "string" &&
    typeof l.qty === "number" &&
    Number.isFinite(l.qty) &&
    l.qty > 0
  );
}

export function readCart(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CART_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isLine) : [];
  } catch {
    // Corrupt cart shouldn't brick the site — start fresh.
    return [];
  }
}

export function writeCart(lines: CartLine[]): void {
  window.localStorage.setItem(CART_KEY, JSON.stringify(lines));
  window.dispatchEvent(new Event(CART_EVENT));
}

export function addToCart(line: CartLine): void {
  const cart = readCart();
  // Same design + same scent + same message is the same line — bump quantity
  // rather than stacking duplicates the customer then has to remove one by one.
  const match = cart.find(
    (l) => l.slug === line.slug && l.scent === line.scent && l.nameMessage === line.nameMessage,
  );
  if (match) match.qty += line.qty;
  else cart.push(line);
  writeCart(cart);
}

export function updateQty(index: number, qty: number): void {
  const cart = readCart();
  if (!cart[index]) return;
  if (qty <= 0) cart.splice(index, 1);
  else cart[index].qty = Math.min(qty, 50);
  writeCart(cart);
}

export function removeLine(index: number): void {
  const cart = readCart();
  cart.splice(index, 1);
  writeCart(cart);
}

export function clearCart(): void {
  window.localStorage.removeItem(CART_KEY);
  window.dispatchEvent(new Event(CART_EVENT));
}
