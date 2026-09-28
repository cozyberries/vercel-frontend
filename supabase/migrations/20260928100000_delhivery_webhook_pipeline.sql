-- supabase/migrations/20260928100000_delhivery_webhook_pipeline.sql
-- Consolidates the Delhivery webhook pipeline from cozyberries-admin into this
-- repo's migration history (admin-merge spec 2026-09-28). The two apps share one
-- Supabase project, so most objects already exist live; everything here is
-- idempotent.
--
-- Tiers (CLAUDE.md, Database Security Conventions):
--   webhook_events         — Admin/internal: RLS enabled + forced, no grants to
--                            anon/authenticated, no policies, service_role only.
--   claim_webhook_events() — execute for service_role only. Declared with
--                            SET search_path (20260914020000_harden_functions.sql
--                            set it live; CREATE OR REPLACE would silently drop
--                            it, so it is inline here).
--   notifications          — existing table used by the service-role
--                            notifications API. Only relaxed: user_id becomes
--                            nullable (admin broadcast rows use user_id IS NULL).
--                            Grants are NOT touched (authenticated keeps
--                            select/insert/update from rls_deny_by_default).
--   orders                 — shipment summary columns the admin app introduced.

alter table public.orders
  add column if not exists carrier_name text,
  add column if not exists estimated_delivery_date timestamptz,
  add column if not exists delhivery_latest_status text,
  add column if not exists delhivery_latest_scan_at timestamptz,
  add column if not exists delhivery_latest_location text;

create table if not exists public.webhook_events (
  id              uuid        not null default gen_random_uuid() primary key,
  source          text        not null default 'delhivery',
  event_type      text        not null default 'shipment_scan',
  awb             text,
  payload         jsonb       not null,
  status          text        not null default 'pending'
                    check (status in ('pending', 'processing', 'processed', 'failed')),
  attempt_count   int         not null default 0,
  next_retry_at   timestamptz,
  last_error      text,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_webhook_events_status_retry
  on public.webhook_events (status, next_retry_at, created_at);
create index if not exists idx_webhook_events_processing_reclaim
  on public.webhook_events (updated_at, created_at, id)
  where status = 'processing';
create index if not exists idx_webhook_events_awb
  on public.webhook_events (awb, created_at desc)
  where awb is not null;

create or replace function public.set_webhook_events_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.set_webhook_events_updated_at() from public, anon, authenticated;

drop trigger if exists trg_webhook_events_updated_at on public.webhook_events;
drop trigger if exists trg_webhook_events_set_updated_at on public.webhook_events;
create trigger trg_webhook_events_set_updated_at
  before update on public.webhook_events
  for each row execute function public.set_webhook_events_updated_at();

alter table public.webhook_events enable row level security;
alter table public.webhook_events force row level security;
-- Tier style here is no-policies + grants; drop the policy the admin repo created.
drop policy if exists "Service role full access" on public.webhook_events;
revoke all on table public.webhook_events from public, anon, authenticated;
grant all on table public.webhook_events to service_role;

create or replace function public.claim_webhook_events(
  p_batch_size      int,
  p_lease_threshold timestamptz,
  p_now             timestamptz
)
returns setof public.webhook_events
language sql
set search_path = public
as $$
  update public.webhook_events
  set status = 'processing', updated_at = p_now
  where id in (
    select id from public.webhook_events
    where (
      (status = 'pending' and (next_retry_at is null or next_retry_at <= p_now))
      or (status = 'failed' and next_retry_at is not null and next_retry_at <= p_now)
      or (status = 'processing' and updated_at <= p_lease_threshold)
    )
    order by created_at asc
    limit least(greatest(coalesce(p_batch_size, 0), 1), 500)
    for update skip locked
  )
  returning *;
$$;

revoke all on function public.claim_webhook_events(int, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_webhook_events(int, timestamptz, timestamptz)
  to service_role;

-- notifications: broadcast rows for admins carry user_id null. The type check
-- below matches what the admin repo already applied live (drop-and-add is
-- idempotent against it).
alter table public.notifications alter column user_id drop not null;
alter table public.notifications add column if not exists meta jsonb;
create index if not exists idx_notifications_user_read_created
  on public.notifications (user_id, read, created_at desc);
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'info'::text, 'success'::text, 'warning'::text, 'error'::text,
    'order_status'::text, 'payment_status'::text, 'shipping_scan'::text
  ]));
