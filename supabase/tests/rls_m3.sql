-- Two buyers and an admin.
-- Buyer B cannot read buyer A's plan.
-- A buyer cannot read coordinates for a house they have not unlocked.
-- A partner on the trip still cannot read that pin.

\set ON_ERROR_STOP on

do $$
declare
  v_anna uuid;
  v_bram uuid;
  v_admin uuid;
  v_trip_anna uuid;
  v_trip_bram uuid;
  v_listing_open uuid;
  v_listing_closed uuid;
  v_listing_bram uuid;
  v_tl_open uuid;
  v_tl_closed uuid;
  v_tl_bram uuid;
  v_property_open uuid;
  v_property_closed uuid;
  v_property_bram uuid;
  v_request_open uuid;
  v_request_closed uuid;
  v_request_bram uuid;
begin
  insert into auth.users (email) values ('m3-anna@example.com') returning id into v_anna;
  insert into auth.users (email) values ('m3-bram@example.com') returning id into v_bram;
  insert into auth.users (email) values ('m3-admin@example.com') returning id into v_admin;
  update public.profiles set role = 'admin' where id = v_admin;

  insert into public.trips (owner_id, name, start_date, end_date, max_drive_minutes_per_day)
  values (v_anna, 'Anna plan', '2026-11-10', '2026-11-11', 180)
  returning id into v_trip_anna;

  insert into public.trips (owner_id, name, start_date, end_date)
  values (v_bram, 'Bram plan', '2026-11-10', '2026-11-11')
  returning id into v_trip_bram;

  insert into public.listings (url, canonical_url, portal, created_by)
  values ('https://example.com/m3-open', 'https://example.com/m3-open', 'other', v_anna)
  returning id into v_listing_open;

  insert into public.listings (url, canonical_url, portal, created_by)
  values ('https://example.com/m3-closed', 'https://example.com/m3-closed', 'other', v_anna)
  returning id into v_listing_closed;

  insert into public.listings (url, canonical_url, portal, created_by)
  values ('https://example.com/m3-bram', 'https://example.com/m3-bram', 'other', v_bram)
  returning id into v_listing_bram;

  insert into public.trip_listings (
    trip_id, listing_id, comune_istat, comune_name, approx_lat, approx_lng, approx_radius_m
  ) values (
    v_trip_anna, v_listing_open, '004003', 'Alba', 44.70, 8.03, 3000
  ) returning id into v_tl_open;

  insert into public.trip_listings (
    trip_id, listing_id, comune_istat, comune_name, approx_lat, approx_lng, approx_radius_m
  ) values (
    v_trip_anna, v_listing_closed, '004004', 'Asti', 44.90, 8.20, 3000
  ) returning id into v_tl_closed;

  insert into public.trip_listings (
    trip_id, listing_id, comune_istat, comune_name, approx_lat, approx_lng, approx_radius_m
  ) values (
    v_trip_bram, v_listing_bram, '001272', 'Torino', 45.07, 7.68, 4000
  ) returning id into v_tl_bram;

  insert into public.properties (verified_by, source) values (v_admin, 'manual') returning id into v_property_open;
  insert into public.properties (verified_by, source) values (v_admin, 'manual') returning id into v_property_closed;
  insert into public.properties (verified_by, source) values (v_admin, 'manual') returning id into v_property_bram;

  insert into public.property_locations (property_id, lat, lng) values (v_property_open, 44.701111, 8.031111);
  insert into public.property_locations (property_id, lat, lng) values (v_property_closed, 46.111111, 9.222222);
  insert into public.property_locations (property_id, lat, lng) values (v_property_bram, 45.501111, 7.501111);

  insert into public.listing_properties (listing_id, property_id) values (v_listing_open, v_property_open);
  insert into public.listing_properties (listing_id, property_id) values (v_listing_closed, v_property_closed);
  insert into public.listing_properties (listing_id, property_id) values (v_listing_bram, v_property_bram);

  insert into public.verification_requests (
    listing_id, requested_by, trip_listing_id, status, property_id, resolved_at
  ) values (
    v_listing_open, v_anna, v_tl_open, 'found', v_property_open, now()
  ) returning id into v_request_open;

  insert into public.verification_requests (
    listing_id, requested_by, trip_listing_id, status, property_id, resolved_at
  ) values (
    v_listing_closed, v_anna, v_tl_closed, 'found', v_property_closed, now()
  ) returning id into v_request_closed;

  insert into public.verification_requests (
    listing_id, requested_by, trip_listing_id, status, property_id, resolved_at
  ) values (
    v_listing_bram, v_bram, v_tl_bram, 'found', v_property_bram, now()
  ) returning id into v_request_bram;

  insert into public.credit_ledger (user_id, delta, reason, trip_listing_id, verification_request_id)
  values (v_anna, -1, 'unlock', v_tl_open, v_request_open);

  insert into public.credit_ledger (user_id, delta, reason, trip_listing_id, verification_request_id)
  values (v_anna, -1, 'unlock', v_tl_closed, v_request_closed);
  insert into public.credit_ledger (user_id, delta, reason, trip_listing_id, verification_request_id)
  values (v_anna, 1, 'refund', v_tl_closed, v_request_closed);

  insert into public.credit_ledger (user_id, delta, reason, trip_listing_id, verification_request_id)
  values (v_bram, -1, 'unlock', v_tl_bram, v_request_bram);

  perform set_config('test.m3_anna', v_anna::text, false);
  perform set_config('test.m3_bram', v_bram::text, false);
  perform set_config('test.m3_admin', v_admin::text, false);
  perform set_config('test.m3_trip_anna', v_trip_anna::text, false);
  perform set_config('test.m3_trip_bram', v_trip_bram::text, false);
  perform set_config('test.m3_tl_open', v_tl_open::text, false);
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.m3_anna'), false);

select public.save_schedule(
  current_setting('test.m3_trip_anna')::uuid,
  jsonb_build_object(
    'source', 'straight_line',
    'lunchStartMinute', 750,
    'lunchEndMinute', 900,
    'days', '[]'::jsonb,
    'unscheduled', '[]'::jsonb
  )
);

do $$
begin
  perform public.save_schedule(
    current_setting('test.m3_trip_anna')::uuid,
    jsonb_build_object(
      'source', 'straight_line',
      'lunchStartMinute', 750,
      'lunchEndMinute', 900,
      'days', jsonb_build_array(jsonb_build_object('lat', 44.701111)),
      'unscheduled', '[]'::jsonb
    )
  );
  raise exception 'plan with coordinates was stored';
exception
  when others then
    if sqlerrm <> 'plan stores coordinates' then
      raise;
    end if;
end $$;

do $$
begin
  insert into public.schedules (trip_id, version, plan, created_by)
  values (
    current_setting('test.m3_trip_anna')::uuid,
    99,
    '{"source":"straight_line","days":[],"unscheduled":[]}'::jsonb,
    current_setting('test.m3_anna')::uuid
  );
  raise exception 'buyer inserted a schedule directly';
exception
  when insufficient_privilege then
    null;
end $$;

do $$
declare
  n int;
  lat double precision;
begin
  select count(*) into n from public.schedules where trip_id = current_setting('test.m3_trip_anna')::uuid;
  if n <> 1 then
    raise exception 'anna should see her plan, count %', n;
  end if;

  select count(*) into n from public.buyer_unlocked_pins(current_setting('test.m3_trip_anna')::uuid);
  if n <> 1 then
    raise exception 'anna should see one unlocked pin, count %', n;
  end if;

  select pins.lat into lat
  from public.buyer_unlocked_pins(current_setting('test.m3_trip_anna')::uuid) as pins;
  if abs(lat - 44.701111) > 0.0000001 then
    raise exception 'unlocked pin lat %', lat;
  end if;

  select count(*) into n
  from public.buyer_unlocked_pins(current_setting('test.m3_trip_anna')::uuid) as pins
  where abs(pins.lat - 46.111111) < 0.0000001 or abs(pins.lng - 9.222222) < 0.0000001;
  if n <> 0 then
    raise exception 'anna received a pin for a house she did not keep paid for';
  end if;

  select count(*) into n
  from public.buyer_unlocked_pins(current_setting('test.m3_trip_bram')::uuid);
  if n <> 0 then
    raise exception 'anna read bram pins, count %', n;
  end if;
end $$;

insert into public.trip_starts (trip_id, label, lat, lng)
values (current_setting('test.m3_trip_anna')::uuid, 'Alba', 44.70, 8.03);

set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.m3_bram'), false);

do $$
declare
  n int;
begin
  select count(*) into n from public.schedules where trip_id = current_setting('test.m3_trip_anna')::uuid;
  if n <> 0 then
    raise exception 'bram read anna plan, count %', n;
  end if;

  select count(*) into n from public.trip_starts where trip_id = current_setting('test.m3_trip_anna')::uuid;
  if n <> 0 then
    raise exception 'bram read anna start, count %', n;
  end if;

  select count(*) into n from public.buyer_unlocked_pins(current_setting('test.m3_trip_anna')::uuid);
  if n <> 0 then
    raise exception 'bram read anna pins, count %', n;
  end if;

  select count(*) into n from public.buyer_unlocked_pins(current_setting('test.m3_trip_bram')::uuid);
  if n <> 1 then
    raise exception 'bram should see his own pin, count %', n;
  end if;
end $$;

do $$
begin
  perform public.save_schedule(
    current_setting('test.m3_trip_anna')::uuid,
    '{"source":"straight_line","lunchStartMinute":750,"lunchEndMinute":900,"days":[],"unscheduled":[]}'::jsonb
  );
  raise exception 'bram saved anna plan';
exception
  when others then
    if sqlerrm <> 'not allowed' then
      raise;
    end if;
end $$;

do $$
begin
  insert into public.trip_starts (trip_id, label, lat, lng)
  values (current_setting('test.m3_trip_anna')::uuid, 'Bram', 44.7, 8.0);
  raise exception 'bram wrote anna start';
exception
  when insufficient_privilege then
    null;
  when others then
    if sqlerrm not like '%row-level security%' then
      raise;
    end if;
end $$;

-- A partner may read the plan, and still cannot read the pin.
reset role;
insert into public.trip_members (trip_id, user_id, role)
values (current_setting('test.m3_trip_anna')::uuid, current_setting('test.m3_bram')::uuid, 'partner');

set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.m3_bram'), false);

do $$
declare
  n int;
begin
  select count(*) into n from public.schedules where trip_id = current_setting('test.m3_trip_anna')::uuid;
  if n <> 1 then
    raise exception 'partner should see the plan, count %', n;
  end if;
  select count(*) into n from public.buyer_unlocked_pins(current_setting('test.m3_trip_anna')::uuid);
  if n <> 0 then
    raise exception 'partner read a pin they did not pay for, count %', n;
  end if;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.m3_admin'), false);

do $$
declare
  n int;
begin
  select count(*) into n from public.schedules where trip_id = current_setting('test.m3_trip_anna')::uuid;
  if n <> 1 then
    raise exception 'admin should read the plan, count %', n;
  end if;
  select count(*) into n from public.buyer_unlocked_pins(current_setting('test.m3_trip_anna')::uuid);
  if n <> 0 then
    raise exception 'admin pin rpc returned a buyer pin, count %', n;
  end if;
end $$;

do $$
begin
  perform lat from public.property_locations;
  raise exception 'table select on property_locations is granted';
exception
  when insufficient_privilege then
    null;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.m3_anna'), false);

do $$
begin
  perform lat from public.property_locations;
  raise exception 'buyer read property_locations';
exception
  when insufficient_privilege then
    null;
end $$;

do $$
begin
  perform private.buyer_unlocked_pins(current_setting('test.m3_trip_anna')::uuid);
  raise exception 'buyer called the private pin function';
exception
  when insufficient_privilege then
    null;
end $$;

set role anon;

do $$
begin
  perform public.buyer_unlocked_pins(current_setting('test.m3_trip_anna')::uuid);
  raise exception 'anon called buyer pins';
exception
  when insufficient_privilege then
    null;
end $$;

-- Opt-out tables from 20261109123722. Created here so this branch can prove
-- the pin function hides them before that migration is on main. Same idea as
-- private.opted_out_properties and private.opted_out_urls, with force RLS.
reset role;

create table private.opted_out_properties (
  property_id uuid primary key references public.properties (id) on delete cascade,
  request_id uuid,
  created_at timestamptz not null default now()
);

create table private.opted_out_urls (
  canonical_url text primary key,
  request_id uuid,
  created_at timestamptz not null default now()
);

alter table private.opted_out_properties enable row level security;
alter table private.opted_out_properties force row level security;
alter table private.opted_out_urls enable row level security;
alter table private.opted_out_urls force row level security;

insert into private.opted_out_properties (property_id)
select lp.property_id
from public.trip_listings tl
join public.listing_properties lp on lp.listing_id = tl.listing_id
where tl.id = current_setting('test.m3_tl_open')::uuid;

set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.m3_anna'), false);

do $$
declare
  n int;
begin
  select count(*) into n from public.buyer_unlocked_pins(current_setting('test.m3_trip_anna')::uuid);
  if n <> 0 then
    raise exception 'opted-out property still returned a pin, count %', n;
  end if;
end $$;

reset role;
delete from private.opted_out_properties;

insert into private.opted_out_urls (canonical_url) values ('https://example.com/m3-open');

set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.m3_anna'), false);

do $$
declare
  n int;
begin
  select count(*) into n from public.buyer_unlocked_pins(current_setting('test.m3_trip_anna')::uuid);
  if n <> 0 then
    raise exception 'opted-out listing url still returned a pin, count %', n;
  end if;
end $$;

reset role;
delete from private.opted_out_urls;

set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.m3_anna'), false);

do $$
declare
  n int;
  lat double precision;
begin
  select count(*) into n from public.buyer_unlocked_pins(current_setting('test.m3_trip_anna')::uuid);
  if n <> 1 then
    raise exception 'pin should return once the opt-out is lifted, count %', n;
  end if;
  select pins.lat into lat
  from public.buyer_unlocked_pins(current_setting('test.m3_trip_anna')::uuid) as pins;
  if abs(lat - 44.701111) > 0.0000001 then
    raise exception 'restored pin lat %', lat;
  end if;
end $$;

reset role;
