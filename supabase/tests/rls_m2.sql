-- Buyer, second buyer, and admin.
-- Buyers cannot read stored coordinates or another buyer's requests.
-- A not-found result refunds the credit. Emails carry no coordinates.

\set ON_ERROR_STOP on

do $$
declare
  v_anna uuid;
  v_bram uuid;
  v_admin uuid;
  v_trip_soon uuid;
  v_trip_later uuid;
  v_trip_bram uuid;
  v_listing_soon uuid;
  v_listing_later uuid;
  v_listing_dupe uuid;
  v_listing_bram uuid;
  v_tl_soon uuid;
  v_tl_later uuid;
  v_tl_dupe uuid;
  v_tl_bram uuid;
begin
  insert into auth.users (email) values ('anna@example.com') returning id into v_anna;
  insert into auth.users (email) values ('bram@example.com') returning id into v_bram;
  insert into auth.users (email) values ('admin@example.com') returning id into v_admin;
  update public.profiles set role = 'admin' where id = v_admin;

  insert into public.trips (owner_id, name, start_date, end_date)
  values (v_anna, 'November scouting', '2026-11-02', '2026-11-06')
  returning id into v_trip_soon;

  insert into public.trips (owner_id, name, start_date, end_date)
  values (v_anna, 'December scouting', '2026-12-01', '2026-12-04')
  returning id into v_trip_later;

  insert into public.trips (owner_id, name, start_date, end_date)
  values (v_bram, 'Bram trip', '2026-11-10', '2026-11-12')
  returning id into v_trip_bram;

  insert into public.trip_members (trip_id, user_id, role)
  values (v_trip_soon, v_bram, 'partner');

  insert into public.listings (url, canonical_url, portal, created_by)
  values ('https://example.com/listing-soon', 'https://example.com/listing-soon', 'other', v_anna)
  returning id into v_listing_soon;

  insert into public.listings (url, canonical_url, portal, created_by)
  values ('https://example.com/listing-later', 'https://example.com/listing-later', 'other', v_anna)
  returning id into v_listing_later;

  insert into public.listings (url, canonical_url, portal, created_by)
  values ('https://example.com/listing-dupe', 'https://example.com/listing-dupe', 'other', v_anna)
  returning id into v_listing_dupe;

  insert into public.listings (url, canonical_url, portal, created_by)
  values ('https://example.com/listing-bram', 'https://example.com/listing-bram', 'other', v_bram)
  returning id into v_listing_bram;

  insert into public.trip_listings (
    trip_id, listing_id, comune_istat, comune_name,
    approx_lat, approx_lng, approx_radius_m,
    given_address, given_lat, given_lng
  ) values (
    v_trip_soon, v_listing_soon, '001003', 'Alba',
    44.70, 8.03, 3000,
    'Via Segreta 99', 44.70, 8.03
  ) returning id into v_tl_soon;

  insert into public.trip_listings (
    trip_id, listing_id, comune_istat, comune_name,
    approx_lat, approx_lng, approx_radius_m
  ) values (
    v_trip_later, v_listing_later, '001004', 'Asti',
    44.90, 8.21, 3000
  ) returning id into v_tl_later;

  insert into public.trip_listings (
    trip_id, listing_id, comune_istat, comune_name,
    approx_lat, approx_lng, approx_radius_m
  ) values (
    v_trip_soon, v_listing_dupe, '001003', 'Alba',
    44.70, 8.03, 3000
  ) returning id into v_tl_dupe;

  insert into public.trip_listings (
    trip_id, listing_id, comune_istat, comune_name,
    approx_lat, approx_lng, approx_radius_m
  ) values (
    v_trip_bram, v_listing_bram, '001272', 'Torino',
    45.07, 7.68, 4000
  ) returning id into v_tl_bram;

  perform set_config('test.anna', v_anna::text, false);
  perform set_config('test.bram', v_bram::text, false);
  perform set_config('test.admin', v_admin::text, false);
  perform set_config('test.trip_soon', v_trip_soon::text, false);
  perform set_config('test.trip_bram', v_trip_bram::text, false);
  perform set_config('test.tl_soon', v_tl_soon::text, false);
  perform set_config('test.tl_later', v_tl_later::text, false);
  perform set_config('test.tl_dupe', v_tl_dupe::text, false);
  perform set_config('test.tl_bram', v_tl_bram::text, false);
  perform set_config('test.listing_soon', v_listing_soon::text, false);
end $$;

-- No credits yet.
set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.anna'), false);

do $$
begin
  perform public.request_verification(current_setting('test.tl_soon')::uuid);
  raise exception 'expected no credits';
exception
  when others then
    if sqlerrm <> 'no credits' then
      raise;
    end if;
end $$;

-- A buyer cannot grant credits.
do $$
begin
  perform public.grant_credits('anna@example.com', 5, null);
  raise exception 'buyer granted credits';
exception
  when others then
    if sqlerrm <> 'not allowed' then
      raise;
    end if;
end $$;

do $$
begin
  perform public.admin_verification_queue();
  raise exception 'buyer read the queue';
exception
  when others then
    if sqlerrm <> 'not allowed' then
      raise;
    end if;
end $$;

do $$
begin
  perform public.admin_properties_near(44.7, 8.03, null);
  raise exception 'buyer read coordinates via search';
exception
  when others then
    if sqlerrm <> 'not allowed' then
      raise;
    end if;
end $$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.admin'), false);
select public.grant_credits('anna@example.com', 3, 'test grant');
select public.grant_credits('bram@example.com', 1, null);

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.anna'), false);

select set_config(
  'test.req_soon',
  public.request_verification(current_setting('test.tl_soon')::uuid)::text,
  false
);
select set_config(
  'test.req_later',
  public.request_verification(current_setting('test.tl_later')::uuid)::text,
  false
);

do $$
begin
  if public.credit_balance() <> 1 then
    raise exception 'anna balance after two requests is %', public.credit_balance();
  end if;
end $$;

do $$
begin
  perform public.request_verification(current_setting('test.tl_soon')::uuid);
  raise exception 'expected already requested';
exception
  when others then
    if sqlerrm <> 'already requested' then
      raise;
    end if;
end $$;

-- Anna sees her own status columns only.
do $$
declare
  n int;
begin
  select count(*) into n
  from public.verification_requests
  where requested_by = current_setting('test.anna')::uuid;
  if n <> 2 then
    raise exception 'anna should see 2 requests, saw %', n;
  end if;
end $$;

do $$
declare
  n int;
begin
  select count(*) into n
  from public.verification_requests
  where requested_by = current_setting('test.bram')::uuid;
  if n <> 0 then
    raise exception 'anna saw bram requests';
  end if;
end $$;

do $$
begin
  perform admin_notes from public.verification_requests;
  raise exception 'buyer read admin notes';
exception
  when insufficient_privilege then
    null;
end $$;

do $$
begin
  perform property_id from public.verification_requests;
  raise exception 'buyer read property id';
exception
  when insufficient_privilege then
    null;
end $$;

do $$
begin
  perform * from public.verification_requests;
  raise exception 'buyer select star on requests';
exception
  when insufficient_privilege then
    null;
end $$;

do $$
begin
  perform lat, lng from public.property_locations;
  raise exception 'buyer read coordinates';
exception
  when insufficient_privilege then
    null;
end $$;

do $$
begin
  perform note from public.credit_ledger;
  raise exception 'buyer read ledger notes';
exception
  when insufficient_privilege then
    null;
end $$;

do $$
declare
  n int;
begin
  select count(*) into n
  from public.credit_ledger
  where user_id = current_setting('test.bram')::uuid;
  if n <> 0 then
    raise exception 'anna saw bram ledger';
  end if;

  select coalesce(sum(delta), 0) into n
  from public.credit_ledger
  where user_id = current_setting('test.anna')::uuid;
  if n <> 1 then
    raise exception 'anna ledger sum %, want 1', n;
  end if;
end $$;

do $$
begin
  insert into public.credit_ledger (user_id, delta, reason)
  values (current_setting('test.anna')::uuid, 10, 'grant');
  raise exception 'buyer inserted ledger row';
exception
  when insufficient_privilege then
    null;
end $$;

-- Bram is a partner on the November trip: he sees the trip, not Anna's credits.
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.bram'), false);

do $$
declare
  n int;
begin
  select count(*) into n from public.trips where id = current_setting('test.trip_soon')::uuid;
  if n <> 1 then
    raise exception 'partner should see the trip';
  end if;

  select count(*) into n from public.trips where id = current_setting('test.trip_bram')::uuid;
  if n <> 1 then
    raise exception 'bram should see his own trip';
  end if;

  select count(*) into n
  from public.credit_ledger
  where user_id = current_setting('test.anna')::uuid;
  if n <> 0 then
    raise exception 'partner saw the owner ledger';
  end if;

  -- Partner can see the request status on the shared trip, not Bram-only rows of Anna's other trip.
  select count(*) into n
  from public.verification_requests
  where id = current_setting('test.req_soon')::uuid;
  if n <> 1 then
    raise exception 'partner should see the shared trip request status';
  end if;

  select count(*) into n
  from public.verification_requests
  where id = current_setting('test.req_later')::uuid;
  if n <> 0 then
    raise exception 'bram saw anna''s other trip request';
  end if;
end $$;

do $$
begin
  perform public.request_verification(current_setting('test.tl_later')::uuid);
  raise exception 'bram requested anna listing';
exception
  when others then
    if sqlerrm <> 'not allowed' then
      raise;
    end if;
end $$;

select set_config(
  'test.req_bram',
  public.request_verification(current_setting('test.tl_bram')::uuid)::text,
  false
);

-- Admin queue is soonest trip first, and includes the internal note column via the function only.
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.admin'), false);

do $$
declare
  q jsonb := public.admin_verification_queue();
begin
  if jsonb_array_length(q) <> 3 then
    raise exception 'queue length %', jsonb_array_length(q);
  end if;
  if q->0->>'trip_start' <> '2026-11-02' then
    raise exception 'first trip %', q->0->>'trip_start';
  end if;
  if q->1->>'trip_start' <> '2026-11-10' then
    raise exception 'second trip %', q->1->>'trip_start';
  end if;
  if q->2->>'trip_start' <> '2026-12-01' then
    raise exception 'third trip %', q->2->>'trip_start';
  end if;
end $$;

do $$
begin
  perform admin_notes from public.verification_requests;
  raise exception 'admin table select exposed notes without the function';
exception
  when insufficient_privilege then
    null;
end $$;

select public.resolve_verification(
  current_setting('test.req_soon')::uuid,
  'found',
  44.701234,
  8.035678,
  null,
  'internal only gate code'
);

select public.resolve_verification(
  current_setting('test.req_later')::uuid,
  'not_found',
  null,
  null,
  null,
  'could not match the lane'
);

do $$
declare
  q jsonb := public.admin_properties_near(44.70, 8.03, null);
begin
  if jsonb_array_length(q) <> 1 then
    raise exception 'nearby count %', q;
  end if;
  if abs((q->0->>'lat')::numeric - 44.701234) > 0.0000001 then
    raise exception 'nearby lat %', q->0->>'lat';
  end if;
  if position('Alba' in q->0->>'label') = 0 then
    raise exception 'nearby label %', q->0->>'label';
  end if;
  if q->0->>'lng' is null then
    raise exception 'nearby missing lng';
  end if;
end $$;

-- Anna was on 1 credit. Not found refunds the December request, so she has 2.
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.anna'), false);

do $$
declare
  st public.trip_listing_status;
  n int;
begin
  if public.credit_balance() <> 2 then
    raise exception 'balance after refund is %', public.credit_balance();
  end if;

  select status into st from public.trip_listings where id = current_setting('test.tl_soon')::uuid;
  if st <> 'verified' then
    raise exception 'soon status %', st;
  end if;

  select status into st from public.trip_listings where id = current_setting('test.tl_later')::uuid;
  if st <> 'not_found' then
    raise exception 'later status %', st;
  end if;

  select count(*) into n
  from public.verification_requests
  where id = current_setting('test.req_soon')::uuid and status = 'found';
  if n <> 1 then
    raise exception 'anna cannot see found status';
  end if;
end $$;

do $$
begin
  perform lat from public.property_locations;
  raise exception 'buyer read coordinates after found';
exception
  when insufficient_privilege then
    null;
end $$;

do $$
begin
  perform public.request_verification(current_setting('test.tl_soon')::uuid);
  raise exception 'expected already found';
exception
  when others then
    if sqlerrm <> 'already found' then
      raise;
    end if;
end $$;

-- Duplicate listing of the same house links to the existing property.
select set_config(
  'test.req_dupe',
  public.request_verification(current_setting('test.tl_dupe')::uuid)::text,
  false
);

reset role;

do $$
declare
  v_property uuid;
  n int;
  b text;
begin
  select property_id into v_property
  from public.verification_requests
  where id = current_setting('test.req_soon')::uuid;

  if v_property is null then
    raise exception 'found request has no property';
  end if;
  perform set_config('test.property', v_property::text, false);

  select count(*) into n from public.property_locations;
  if n <> 1 then
    raise exception 'expected 1 coordinate row, got %', n;
  end if;

  select lat::text into b from public.property_locations;
  if b <> '44.701234' then
    raise exception 'stored lat %', b;
  end if;

  select body into b from public.notification_outbox where kind = 'verification_found';
  if b is null then
    raise exception 'missing found email';
  end if;
  if position('44.701234' in b) > 0 or position('8.035678' in b) > 0 then
    raise exception 'found email contains coordinates';
  end if;
  if position('Via Segreta' in b) > 0 then
    raise exception 'found email contains the address';
  end if;
  if position('internal only' in b) > 0 then
    raise exception 'found email contains the admin note';
  end if;
  if position('not an estate agency' in b) = 0 then
    raise exception 'found email dropped the agency notice';
  end if;
  if position('fine' in lower(b)) > 0 then
    raise exception 'found email mentions a fine';
  end if;
  if position('Alba' in b) = 0 then
    raise exception 'found email missing the comune';
  end if;

  select body into b from public.notification_outbox where kind = 'verification_not_found';
  if b is null then
    raise exception 'missing not-found email';
  end if;
  if position('credit is back' in b) = 0 then
    raise exception 'not-found email does not mention the refund';
  end if;
  if position('44.701234' in b) > 0 or position('Via Segreta' in b) > 0 then
    raise exception 'not-found email leaked location text';
  end if;
  if position('could not match the lane' in b) > 0 then
    raise exception 'not-found email leaked the admin note';
  end if;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.admin'), false);

select public.resolve_verification(
  current_setting('test.req_dupe')::uuid,
  'found',
  null,
  null,
  current_setting('test.property')::uuid,
  null
);

reset role;

do $$
declare
  n int;
begin
  select count(*) into n from public.property_locations;
  if n <> 1 then
    raise exception 'linking a duplicate created another pin, count %', n;
  end if;

  select count(distinct property_id) into n
  from public.listing_properties
  where listing_id in (
    current_setting('test.listing_soon')::uuid,
    (select listing_id from public.trip_listings where id = current_setting('test.tl_dupe')::uuid)
  );
  if n <> 1 then
    raise exception 'duplicate listings do not share one house';
  end if;
end $$;

-- Even if SELECT is granted later, RLS still hides coordinates from a buyer.
begin;
grant select on public.property_locations to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.anna'), false);
do $$
declare
  n int;
begin
  select count(*) into n from public.property_locations;
  if n <> 0 then
    raise exception 'rls leaked coordinates to a buyer, count %', n;
  end if;
end $$;
rollback;

-- Removing an open request refunds the credit.
set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.bram'), false);

do $$
begin
  if public.credit_balance() <> 0 then
    raise exception 'bram balance before delete is %', public.credit_balance();
  end if;
end $$;

delete from public.trip_listings where id = current_setting('test.tl_bram')::uuid;

do $$
begin
  if public.credit_balance() <> 1 then
    raise exception 'bram balance after delete is %', public.credit_balance();
  end if;
end $$;

reset role;

do $$
declare
  n int;
begin
  select count(*) into n from public.notification_outbox;
  if n <> 3 then
    raise exception 'expected 3 outbox rows, got %', n;
  end if;

  -- Buyers have no privilege on the outbox. Confirmed below as anna.
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.anna'), false);

do $$
begin
  perform id from public.notification_outbox;
  raise exception 'buyer read the outbox';
exception
  when insufficient_privilege then
    null;
end $$;

reset role;
