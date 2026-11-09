-- M3: saved drive-by plans and the buyer's start point.
--
-- Exact coordinates stay in property_locations. Buyers still have no
-- privileges on that table. The only buyer path to a pin is
-- public.buyer_unlocked_pins, which reads through private schema
-- functions and returns a coordinate only when this buyer paid for a
-- found check on that listing.
--
-- Seller opt-out (migration 20261109123722) stores houses in
-- private.opted_out_properties and listing URLs in private.opted_out_urls.
-- This migration sorts after that one. The lookup below reads those tables
-- when they exist, so an opted-out house never returns a pin even if a
-- coordinate row is still present. Until that migration is applied the
-- tables are absent and nothing is withheld.

create schema if not exists private;

-- Revoke the default public grant only. Do not revoke anon or authenticated:
-- the opt-out migration grants them usage of this schema, and this file
-- runs later.
revoke all on schema private from public;

comment on schema private is
  'Not exposed by the API. Seller opt-out records, when that migration has run, and the buyer coordinate lookup.';

create function private.property_withheld(p_property_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_withheld boolean;
begin
  if p_property_id is null then
    return true;
  end if;

  if to_regclass('private.opted_out_properties') is null then
    return false;
  end if;

  execute
    'select exists (select 1 from private.opted_out_properties where property_id = $1)'
    into v_withheld
    using p_property_id;

  return coalesce(v_withheld, false);
end;
$$;

revoke all on function private.property_withheld(uuid) from public, anon, authenticated;

create function private.listing_opted_out(p_listing_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out boolean;
begin
  if p_listing_id is null then
    return true;
  end if;

  if to_regclass('private.opted_out_urls') is null then
    return false;
  end if;

  execute
    'select exists (
       select 1
       from public.listings l
       join private.opted_out_urls u on u.canonical_url = l.canonical_url
       where l.id = $1
     )'
    into v_out
    using p_listing_id;

  return coalesce(v_out, false);
end;
$$;

revoke all on function private.listing_opted_out(uuid) from public, anon, authenticated;

create function private.buyer_unlocked_pins(p_trip_id uuid)
returns table (
  trip_listing_id uuid,
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select tl.id, pl.lat, pl.lng
  from public.trip_listings tl
  join public.listing_properties lp on lp.listing_id = tl.listing_id
  join public.property_locations pl on pl.property_id = lp.property_id
  where tl.trip_id = p_trip_id
    and (select public.is_trip_member(p_trip_id))
    and not private.property_withheld(pl.property_id)
    and not private.listing_opted_out(tl.listing_id)
    and exists (
      select 1
      from public.verification_requests vr
      where vr.trip_listing_id = tl.id
        and vr.requested_by = (select auth.uid())
        and vr.status = 'found'
        and vr.property_id = pl.property_id
        and exists (
          select 1
          from public.credit_ledger spent
          where spent.verification_request_id = vr.id
            and spent.user_id = (select auth.uid())
            and spent.reason = 'unlock'
        )
        and not exists (
          select 1
          from public.credit_ledger refunded
          where refunded.verification_request_id = vr.id
            and refunded.reason = 'refund'
        )
    );
$$;

revoke all on function private.buyer_unlocked_pins(uuid) from public, anon, authenticated;

create function public.buyer_unlocked_pins(p_trip_id uuid)
returns table (
  trip_listing_id uuid,
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select pins.trip_listing_id, pins.lat, pins.lng
  from private.buyer_unlocked_pins(p_trip_id) as pins;
$$;

comment on function public.buyer_unlocked_pins(uuid) is
  'Coordinates for houses this buyer paid to find. Empty for every other house, including a partner on the same trip who did not pay.';

revoke all on function public.buyer_unlocked_pins(uuid) from public, anon;
grant execute on function public.buyer_unlocked_pins(uuid) to authenticated;

create table public.trip_starts (
  trip_id uuid primary key references public.trips (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 200),
  lat double precision not null check (lat between 35 and 48),
  lng double precision not null check (lng between 6 and 19),
  lunch_start_minute smallint not null default 750 check (lunch_start_minute between 0 and 1439),
  lunch_end_minute smallint not null default 900 check (lunch_end_minute between 1 and 1440),
  updated_at timestamptz not null default now(),
  check (lunch_end_minute > lunch_start_minute)
);

comment on table public.trip_starts is
  'Where the buyer starts and ends each day. A place they typed or a pin they dropped, never a house coordinate.';

create trigger trip_starts_set_updated_at
  before update on public.trip_starts
  for each row execute function public.set_updated_at();

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  version integer not null check (version >= 1),
  plan jsonb not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (trip_id, version),
  check (octet_length(plan::text) <= 100000),
  check (position('"lat"' in plan::text) = 0),
  check (position('"lng"' in plan::text) = 0),
  check (position('"latitude"' in plan::text) = 0),
  check (position('"longitude"' in plan::text) = 0),
  check (position('"coordinates"' in plan::text) = 0)
);

comment on table public.schedules is
  'Buyer-visible drive-by plan. Times and order only. No house coordinates.';

create index schedules_trip_version_idx on public.schedules (trip_id, version desc);

create index schedules_created_by_idx on public.schedules (created_by);

create function public.save_schedule(p_trip_id uuid, p_plan jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_version integer;
  v_text text;
begin
  if v_uid is null or p_trip_id is null or not public.is_trip_member(p_trip_id) then
    raise exception 'not allowed';
  end if;

  if p_plan is null
     or jsonb_typeof(p_plan) <> 'object'
     or jsonb_typeof(p_plan -> 'days') <> 'array'
     or jsonb_typeof(p_plan -> 'unscheduled') <> 'array'
     or coalesce(p_plan ->> 'source', '') not in ('openrouteservice', 'straight_line')
     or jsonb_array_length(p_plan -> 'days') > 61 then
    raise exception 'invalid plan';
  end if;

  v_text := p_plan::text;
  if octet_length(v_text) > 100000
     or position('"lat"' in v_text) > 0
     or position('"lng"' in v_text) > 0
     or position('"latitude"' in v_text) > 0
     or position('"longitude"' in v_text) > 0
     or position('"coordinates"' in v_text) > 0 then
    raise exception 'plan stores coordinates';
  end if;

  perform 1 from public.trips where id = p_trip_id for update;

  select coalesce(max(version), 0) + 1 into v_version
  from public.schedules
  where trip_id = p_trip_id;

  insert into public.schedules (trip_id, version, plan, created_by)
  values (p_trip_id, v_version, p_plan, v_uid);

  return v_version;
end;
$$;

revoke all on function public.save_schedule(uuid, jsonb) from public, anon;
grant execute on function public.save_schedule(uuid, jsonb) to authenticated;

alter table public.trip_starts enable row level security;
alter table public.schedules enable row level security;

create policy "trip_starts: members read" on public.trip_starts
  for select to authenticated
  using ((select public.is_trip_member(trip_id)) or (select public.is_admin()));

create policy "trip_starts: members insert" on public.trip_starts
  for insert to authenticated
  with check ((select public.is_trip_member(trip_id)) or (select public.is_admin()));

create policy "trip_starts: members update" on public.trip_starts
  for update to authenticated
  using ((select public.is_trip_member(trip_id)) or (select public.is_admin()))
  with check ((select public.is_trip_member(trip_id)) or (select public.is_admin()));

create policy "schedules: members read" on public.schedules
  for select to authenticated
  using ((select public.is_trip_member(trip_id)) or (select public.is_admin()));

revoke all on public.trip_starts from public, anon, authenticated;
grant select (
  trip_id, label, lat, lng, lunch_start_minute, lunch_end_minute, updated_at
) on public.trip_starts to authenticated;
grant insert (
  trip_id, label, lat, lng, lunch_start_minute, lunch_end_minute
) on public.trip_starts to authenticated;
grant update (
  label, lat, lng, lunch_start_minute, lunch_end_minute
) on public.trip_starts to authenticated;

revoke all on public.schedules from public, anon, authenticated;
grant select (id, trip_id, version, plan, created_at) on public.schedules to authenticated;
