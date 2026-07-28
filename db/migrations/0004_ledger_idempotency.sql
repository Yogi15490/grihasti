-- Grihasti — close the NULL hole in the ledger idempotency guard.
--
-- SPEC DEVIATION (§6), deliberate. The spec declares:
--     unique (order_id, user_id, type, level)
-- and §10 leans on that constraint to make the Razorpay webhook idempotent
-- (§11 step 8: "duplicate payment webhook -> no double credit").
--
-- But `level` is NULL for REDEEM and for the points-return CLAWBACK row, and
-- Postgres treats NULLs as DISTINCT in a unique index by default. So
-- (order, user, 'REDEEM', NULL) does NOT conflict with itself: a replayed
-- webhook would happily insert a second REDEEM row and debit the customer
-- twice for points they spent once. The EARN rows (level 0..3, non-null) were
-- protected; the redemption rows never were.
--
-- Fix: NULLS NOT DISTINCT (Postgres 15+; Supabase and any current self-host
-- qualify). Now a NULL level compares equal to a NULL level and the guard
-- covers every ledger type.

do $$
declare
  v_constraint text;
begin
  -- Drop whatever the inline `unique (...)` in 0001 was auto-named.
  select conname into v_constraint
    from pg_constraint
   where conrelid = 'points_ledger'::regclass
     and contype = 'u';

  if v_constraint is not null then
    execute format('alter table points_ledger drop constraint %I', v_constraint);
  end if;
end $$;

-- Safety net: if a duplicate REDEEM/CLAWBACK already slipped in before this
-- migration ran, the index below would fail to build. Surface that loudly
-- rather than silently skipping the guard.
do $$
declare
  v_dupes int;
begin
  select count(*) into v_dupes from (
    select order_id, user_id, type, level
      from points_ledger
     group by order_id, user_id, type, level
    having count(*) > 1
  ) d;

  if v_dupes > 0 then
    raise exception
      'Cannot apply idempotency guard: % duplicate ledger group(s) already exist. '
      'Investigate and reconcile before re-running (the ledger is append-only, '
      'so correct with compensating ADJUST rows, never DELETE).', v_dupes;
  end if;
end $$;

-- Scoped to order-linked rows only. NULLS NOT DISTINCT applies to every column
-- in the index, including order_id — so an unpartitioned index would also treat
-- two off-order ADJUST rows for the same user as duplicates, and silently
-- reject the second. ADJUST (spec §3.5) is how support corrects a balance by
-- hand; capping a user at one lifetime correction is not acceptable.
--
-- The partial WHERE keeps the guard exactly where idempotency is needed —
-- rows written by the payment webhook, which always carry an order_id — while
-- leaving manual adjustments unconstrained.
create unique index if not exists idx_ledger_idempotent
  on points_ledger (order_id, user_id, type, level)
  nulls not distinct
  where order_id is not null;

comment on index idx_ledger_idempotent is
  'Idempotency guard for the payment webhook (spec §10). NULLS NOT DISTINCT is '
  'load-bearing: without it, REDEEM/CLAWBACK rows (level IS NULL) are unguarded. '
  'Partial on order_id so manual ADJUST rows are not caught by it.';
