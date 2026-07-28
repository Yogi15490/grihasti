-- Grihasti — initial schema (spec §6)
-- Postgres / Supabase. Points amounts use numeric(12,4) for sub-paise cashback precision.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  phone text unique,
  email text,
  name text,
  inviter_id uuid references users(id),          -- write-once, first-touch (enforce in app + trigger)
  invite_code text unique not null,
  invites_remaining int not null default 5 check (invites_remaining >= 0),
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  type text not null check (type in ('caricature','giftset')),
  description text,
  price_inr numeric(10,2) not null,
  stock_qty int not null default 0 check (stock_qty >= 0),
  scent_options text[] not null default '{Aangan at Dusk,Sunday Slow}',
  images jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  status text not null default 'created'
    check (status in ('created','paid','dispatched','delivered','cancelled','refunded')),
  gross_total_inr numeric(10,2) not null,
  points_redeemed_inr numeric(12,4) not null default 0,
  cash_paid_inr numeric(10,2) not null default 0,
  razorpay_order_id text,
  razorpay_payment_id text,
  gst_invoice_no text,
  shipping_address jsonb,
  awb_tracking text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  product_id uuid not null references products(id),
  qty int not null default 1 check (qty > 0),
  unit_price_inr numeric(10,2) not null,
  scent text,
  name_message text
);

create table if not exists points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  order_id uuid references orders(id),
  type text not null check (type in ('EARN_SELF','EARN_REFERRAL','REDEEM','CLAWBACK','ADJUST')),
  level int,                                       -- 0 buyer, 1..3 upline, null otherwise
  amount_inr numeric(12,4) not null,               -- +earn / -redeem / -clawback
  created_at timestamptz not null default now(),
  unique (order_id, user_id, type, level)          -- idempotency guard against duplicate webhooks
);

create table if not exists referral_events (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references users(id),
  invitee_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  unique (invitee_id)                              -- one inviter per user
);

create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  contact text not null,
  poll_choice text,
  ref_code text,
  created_at timestamptz not null default now()
);

create index if not exists idx_users_inviter on users(inviter_id);
create index if not exists idx_ledger_user on points_ledger(user_id);
create index if not exists idx_orders_user on orders(user_id);
create index if not exists idx_order_items_order on order_items(order_id);

-- Enforce write-once inviter_id (cannot be changed once set)
create or replace function lock_inviter_id() returns trigger as $$
begin
  if old.inviter_id is not null and new.inviter_id is distinct from old.inviter_id then
    raise exception 'inviter_id is immutable';
  end if;
  return new;
end; $$ language plpgsql;

drop trigger if exists trg_lock_inviter on users;
create trigger trg_lock_inviter before update on users
  for each row execute function lock_inviter_id();
