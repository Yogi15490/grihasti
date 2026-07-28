-- Grihasti — order lifecycle, provider-agnostic payments, GST invoicing.
--
-- Razorpay is deliberately NOT baked into the schema. Spec §6 names the columns
-- razorpay_order_id / razorpay_payment_id; we keep those (so the spec's DDL
-- still applies cleanly) but add generic provider columns alongside. The order
-- pipeline is built and tested against a stub provider, and Razorpay lands at
-- the end as one adapter writing the same two fields.

-- ── Provider-agnostic payment reference ──────────────────────────────────
alter table orders add column if not exists payment_provider text;
alter table orders add column if not exists payment_ref text;
alter table orders add column if not exists payment_intent_ref text;

-- Snapshot the tax rate that applied when the sale happened. An invoice must
-- reproduce exactly, forever; reading a current env var at reprint time would
-- silently rewrite history the first time the rate changes.
alter table orders add column if not exists gst_rate numeric(5,4);

-- Set when payment succeeded but stock could not be decremented (oversell).
-- We never refuse to record money we actually received — we flag the order for
-- admin refund instead. See orders.ts confirmPayment.
alter table orders add column if not exists fulfilment_hold boolean not null default false;
alter table orders add column if not exists hold_reason text;

alter table orders add column if not exists cancelled_at timestamptz;
alter table orders add column if not exists refunded_at timestamptz;
alter table orders add column if not exists dispatched_at timestamptz;

create index if not exists idx_orders_status on orders (status);
create index if not exists idx_orders_open_points
  on orders (user_id) where status = 'created';

-- Payment reference must be unique per provider: two orders can never claim
-- the same payment. Defence in depth behind the webhook idempotency guard.
create unique index if not exists idx_orders_payment_ref
  on orders (payment_provider, payment_ref)
  where payment_ref is not null;

-- ── Gap-free GST invoice numbering (spec §10) ────────────────────────────
-- GST requires a consecutive series. A sequence would leave gaps on rollback,
-- so the counter is a locked row incremented inside the payment transaction.
create table if not exists invoice_counters (
  fy       text primary key,
  last_seq int not null default 0
);

create or replace function next_invoice_no(p_at timestamptz default now())
returns text
language plpgsql as $$
declare
  v_y   int := extract(year  from p_at);
  v_m   int := extract(month from p_at);
  v_fy  text;
  v_seq int;
begin
  -- Indian financial year runs April -> March.
  if v_m >= 4 then
    v_fy := v_y::text || '-' || substr((v_y + 1)::text, 3, 2);
  else
    v_fy := (v_y - 1)::text || '-' || substr(v_y::text, 3, 2);
  end if;

  insert into invoice_counters (fy, last_seq)
  values (v_fy, 1)
  on conflict (fy) do update
    set last_seq = invoice_counters.last_seq + 1
  returning last_seq into v_seq;

  return 'GRH/' || v_fy || '/' || lpad(v_seq::text, 5, '0');
end;
$$;

-- ── Atomic stock decrement (spec §8) ─────────────────────────────────────
-- Conditional UPDATE: returns false if insufficient stock, never oversells.
create or replace function decrement_stock(p_product_id uuid, p_qty int)
returns boolean
language plpgsql as $$
declare
  v_rows int;
begin
  update products
     set stock_qty = stock_qty - p_qty
   where id = p_product_id
     and stock_qty >= p_qty;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

create or replace function restock(p_product_id uuid, p_qty int)
returns void
language sql as $$
  update products set stock_qty = stock_qty + p_qty where id = p_product_id;
$$;

-- ── Available points (double-spend guard) ────────────────────────────────
-- SPEC GAP (§3.5): the spec writes the REDEEM row only at payment confirmation.
-- Between order creation and payment the points are still visible as balance,
-- so a customer can open two orders that each redeem the same ₹500 and pay for
-- both — ending at -₹500 with goods already shipped.
--
-- Rather than move REDEEM earlier (which would break "earn only after verified
-- payment" symmetry and complicate abandoned carts), available balance nets off
-- points already committed to open orders.
create or replace function available_points(p_user_id uuid)
returns numeric
language sql stable as $$
  select points_balance(p_user_id)
       - coalesce((
           select sum(points_redeemed_inr)
             from orders
            where user_id = p_user_id
              and status = 'created'
              and points_redeemed_inr > 0
         ), 0);
$$;
