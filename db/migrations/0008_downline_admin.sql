-- Grihasti — downline traversal, admin role, dispatch fields (spec §7.7, §9).

-- ── Admin role ───────────────────────────────────────────────────────────
-- Deliberately a column, not a separate table: there will be two or three
-- admins, and a role system is complexity this launch cannot pay for.
alter table users add column if not exists is_admin boolean not null default false;

create index if not exists idx_users_admin on users (id) where is_admin;

-- ── Dispatch (spec §9) ───────────────────────────────────────────────────
alter table orders add column if not exists courier_name text;
alter table orders add column if not exists shiprocket_order_id text;
alter table orders add column if not exists label_url text;

-- ── Admin audit ──────────────────────────────────────────────────────────
-- Support staff can adjust balances and stock. Those actions must be
-- attributable — an append-only ledger is worth little if anyone can write
-- ADJUST rows with no record of who or why.
create table if not exists admin_actions (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid not null references users(id),
  action      text not null,
  target_type text,
  target_id   uuid,
  detail      jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_admin_actions_created on admin_actions (created_at desc);

-- ── Downline (spec §7.7) ─────────────────────────────────────────────────
-- Mirror of get_upline: everyone beneath a user, capped at the same depth the
-- payout reaches. Showing deeper levels would imply earnings that never come.
create or replace function get_downline(p_user_id uuid, p_levels int default 3)
returns table (
  level        int,
  user_id      uuid,
  email        text,
  joined_at    timestamptz,
  orders_paid  bigint,
  earned_from  numeric
)
language sql stable as $$
  with recursive tree as (
    select u.id, u.email, u.created_at, 1 as lvl
      from users u
     where u.inviter_id = p_user_id
    union all
    select u.id, u.email, u.created_at, t.lvl + 1
      from users u
      join tree t on u.inviter_id = t.id
     where t.lvl < p_levels
  )
  select
    t.lvl,
    t.id,
    t.email,
    t.created_at,
    (select count(*) from orders o
      where o.user_id = t.id and o.status in ('paid','dispatched','delivered')),
    -- What the viewing user has actually earned from this person's orders.
    coalesce((
      select sum(pl.amount_inr)
        from points_ledger pl
        join orders o on o.id = pl.order_id
       where pl.user_id = p_user_id
         and o.user_id = t.id
         and pl.type in ('EARN_REFERRAL','CLAWBACK')
    ), 0)
  from tree t
  order by t.lvl, t.created_at;
$$;
