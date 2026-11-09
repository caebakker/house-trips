-- Anon can submit an opt-out and cannot read it.
-- A buyer cannot read or decide. An admin can.
-- Approving deletes the pin, refunds an open check, and blocks the linked listing.

\set ON_ERROR_STOP on

do $$
declare
  v_nina uuid;
  v_admin uuid;
  v_trip uuid;
  v_listing_a uuid;
  v_listing_b uuid;
  v_listing_c uuid;
  v_property uuid;
  v_other uuid;
  v_tl_a uuid;
  v_tl_b uuid;
  v_tl_c uuid;
  v_found uuid;
begin
  insert into auth.users (email) values ('nina@example.com') returning id into v_nina;
  insert into auth.users (email) values ('optadmin@example.com') returning id into v_admin;
  update public.profiles set role = 'admin' where id = v_admin;

  insert into public.trips (owner_id, name, start_date, end_date)
  values (v_nina, 'Nina scouting', '2026-11-20', '2026-11-22')
  returning id into v_trip;

  insert into public.listings (url, canonical_url, portal, created_by)
  values (
    'https://www.immobiliare.it/annunci/116128813',
    'https://www.immobiliare.it/annunci/116128813',
    'immobiliare',
    v_nina
  )
  returning id into v_listing_a;

  insert into public.listings (url, canonical_url, portal, created_by)
  values (
    'https://www.idealista.it/immobile/24811320',
    'https://www.idealista.it/immobile/24811320',
    'idealista',
    v_nina
  )
  returning id into v_listing_b;

  insert into public.listings (url, canonical_url, portal, created_by)
  values (
    'https://example.com/unrelated-house',
    'https://example.com/unrelated-house',
    'other',
    v_nina
  )
  returning id into v_listing_c;

  insert into public.properties (verified_by, source)
  values (v_admin, 'manual')
  returning id into v_property;

  insert into public.property_locations (property_id, lat, lng)
  values (v_property, 44.701111, 8.035111);

  insert into public.properties (verified_by, source)
  values (v_admin, 'manual')
  returning id into v_other;

  insert into public.property_locations (property_id, lat, lng)
  values (v_other, 45.070000, 7.680000);

  insert into public.listing_properties (listing_id, property_id)
  values (v_listing_a, v_property), (v_listing_b, v_property), (v_listing_c, v_other);

  insert into public.trip_listings (
    trip_id, listing_id, status, comune_istat, comune_name,
    approx_lat, approx_lng, approx_radius_m,
    given_address, given_lat, given_lng
  ) values (
    v_trip, v_listing_a, 'verified', '001003', 'Alba',
    44.70, 8.03, 3000,
    'Via Segreta 99', 44.701111, 8.035111
  ) returning id into v_tl_a;

  insert into public.trip_listings (
    trip_id, listing_id, comune_istat, comune_name,
    approx_lat, approx_lng, approx_radius_m
  ) values (
    v_trip, v_listing_b, '001003', 'Alba',
    44.70, 8.03, 3000
  ) returning id into v_tl_b;

  insert into public.trip_listings (
    trip_id, listing_id, comune_istat, comune_name,
    approx_lat, approx_lng, approx_radius_m,
    given_address, given_lat, given_lng
  ) values (
    v_trip, v_listing_c, '001272', 'Torino',
    45.07, 7.68, 4000,
    'Via Roma 1', 45.07, 7.68
  ) returning id into v_tl_c;

  insert into public.verification_requests (
    listing_id, requested_by, trip_listing_id, status, property_id, resolved_at
  ) values (
    v_listing_a, v_nina, v_tl_a, 'found', v_property, now()
  ) returning id into v_found;

  insert into public.credit_ledger (
    user_id, delta, reason, trip_listing_id, verification_request_id, created_by
  ) values (
    v_nina, -1, 'unlock', v_tl_a, v_found, v_nina
  );

  perform set_config('test.nina', v_nina::text, false);
  perform set_config('test.optadmin', v_admin::text, false);
  perform set_config('test.trip_nina', v_trip::text, false);
  perform set_config('test.tl_a', v_tl_a::text, false);
  perform set_config('test.tl_b', v_tl_b::text, false);
  perform set_config('test.tl_c', v_tl_c::text, false);
  perform set_config('test.listing_a', v_listing_a::text, false);
  perform set_config('test.listing_b', v_listing_b::text, false);
  perform set_config('test.property', v_property::text, false);
  perform set_config('test.other_property', v_other::text, false);
  perform set_config('test.found', v_found::text, false);
end $$;

-- Tables stay closed: no policies, row security forced, no grants.
do $$
declare
  n int;
  r record;
begin
  for r in
    select c.relname, c.relrowsecurity, c.relforcerowsecurity
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'private'
      and c.relkind = 'r'
  loop
    if r.relname not in (
      'seller_opt_out_requests',
      'opted_out_urls',
      'opted_out_properties',
      'opt_out_submit_log'
    ) then
      raise exception 'unexpected private table %', r.relname;
    end if;
    if not r.relrowsecurity or not r.relforcerowsecurity then
      raise exception 'RLS is not forced on private.%', r.relname;
    end if;
  end loop;

  select count(*) into n
  from pg_policies
  where schemaname = 'private';
  if n <> 0 then
    raise exception 'private schema has policies';
  end if;

  if has_table_privilege('anon', 'private.seller_opt_out_requests', 'select')
     or has_table_privilege('authenticated', 'private.seller_opt_out_requests', 'select')
     or has_table_privilege('anon', 'private.seller_opt_out_requests', 'insert')
     or has_table_privilege('service_role', 'private.seller_opt_out_requests', 'select') then
    raise exception 'request table is granted to an API role';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '', false);
set role anon;

do $$
begin
  if (public.submit_seller_opt_out(
    array['http://immobiliare.it/en/annunci/116128813/?utm_source=ig'],
    '  Alba  ',
    'Owner@Example.com',
    true,
    ''
  ) ->> 'ok') is distinct from 'true' then
    raise exception 'anon submit failed';
  end if;
end $$;

do $$
begin
  if (public.submit_seller_opt_out(
    array['https://example.com/honeypot'],
    null,
    'honeypot@example.com',
    true,
    'acme widgets'
  ) ->> 'ok') is distinct from 'true' then
    raise exception 'honeypot was rejected';
  end if;
end $$;

do $$
begin
  perform public.submit_seller_opt_out(
    array['https://example.com/no-confirm'],
    null,
    'noconfirm@example.com',
    false,
    ''
  );
  raise exception 'unconfirmed request was stored';
exception
  when others then
    if sqlerrm <> 'not confirmed' then
      raise;
    end if;
end $$;

do $$
begin
  perform public.submit_seller_opt_out(
    array['javascript:alert(1)'],
    null,
    null,
    true,
    ''
  );
  raise exception 'bad url was stored';
exception
  when others then
    if sqlerrm <> 'invalid urls' then
      raise;
    end if;
end $$;

do $$
begin
  perform public.admin_opt_out_queue();
  raise exception 'anon read the queue';
exception
  when insufficient_privilege then
    null;
end $$;

do $$
begin
  perform id from private.seller_opt_out_requests;
  raise exception 'anon read requests';
exception
  when insufficient_privilege then
    null;
end $$;

reset role;
set role service_role;

do $$
begin
  perform id from private.seller_opt_out_requests;
  raise exception 'service role read requests';
exception
  when insufficient_privilege then
    null;
end $$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.nina'), false);

do $$
begin
  perform public.admin_opt_out_queue();
  raise exception 'buyer read the queue';
exception
  when others then
    if sqlerrm <> 'not allowed' then
      raise;
    end if;
end $$;

do $$
begin
  perform public.decide_seller_opt_out('00000000-0000-0000-0000-000000000000', 'approved', null);
  raise exception 'buyer decided a request';
exception
  when others then
    if sqlerrm <> 'not allowed' then
      raise;
    end if;
end $$;

do $$
begin
  perform canonical_url from private.opted_out_urls;
  raise exception 'buyer read opted-out urls';
exception
  when insufficient_privilege then
    null;
end $$;

-- Five submits are allowed. The sixth is refused and stores nothing.
do $$
declare
  i int;
begin
  for i in 1..5 loop
    perform public.submit_seller_opt_out(
      array['https://example.com/rate-' || i],
      null,
      'rate@example.com',
      true,
      ''
    );
  end loop;
end $$;

do $$
begin
  perform public.submit_seller_opt_out(
    array['https://example.com/rate-6'],
    null,
    'rate@example.com',
    true,
    ''
  );
  raise exception 'rate limit did not trip';
exception
  when others then
    if sqlerrm <> 'slow down' then
      raise;
    end if;
end $$;

reset role;

do $$
declare
  n int;
  v_comune text;
  v_email text;
begin
  select count(*) into n
  from private.seller_opt_out_requests
  where contact_email = 'honeypot@example.com';
  if n <> 0 then
    raise exception 'honeypot stored a request';
  end if;

  select count(*) into n
  from private.seller_opt_out_requests
  where contact_email in ('noconfirm@example.com')
     or 'javascript:alert(1)' = any (listing_urls);
  if n <> 0 then
    raise exception 'invalid submit stored a request';
  end if;

  select count(*) into n
  from private.seller_opt_out_requests
  where 'https://example.com/rate-6' = any (listing_urls);
  if n <> 0 then
    raise exception 'rate limited submit was stored';
  end if;

  select comune, contact_email into v_comune, v_email
  from private.seller_opt_out_requests
  where contact_email = 'owner@example.com';
  if v_comune <> 'Alba' or v_email <> 'owner@example.com' then
    raise exception 'stored comune or email was not trimmed, got % %', v_comune, v_email;
  end if;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.optadmin'), false);

select public.grant_credits('nina@example.com', 2, null);

do $$
declare
  q jsonb;
  n int;
begin
  q := public.admin_opt_out_queue();
  select count(*) into n
  from jsonb_array_elements(q) item
  where item ->> 'contact_email' = 'owner@example.com';
  if n <> 1 then
    raise exception 'queue missing the owner request, got %', q;
  end if;
  if position('honeypot@example.com' in q::text) > 0 then
    raise exception 'queue contains the honeypot';
  end if;
end $$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.nina'), false);

select public.request_verification(current_setting('test.tl_b')::uuid);

do $$
declare
  n int;
  lat double precision;
begin
  select count(*) into n
  from public.buyer_unlocked_pins(current_setting('test.trip_nina')::uuid);
  if n <> 1 then
    raise exception 'unlocked pin missing before opt-out, count %', n;
  end if;
  select pins.lat into lat
  from public.buyer_unlocked_pins(current_setting('test.trip_nina')::uuid) as pins;
  if abs(lat - 44.701111) > 0.0000001 then
    raise exception 'unlocked pin lat %', lat;
  end if;
end $$;

reset role;

do $$
declare
  v_id uuid;
begin
  select id into v_id
  from private.seller_opt_out_requests
  where contact_email = 'owner@example.com';
  perform set_config('test.opt_request', v_id::text, false);
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.optadmin'), false);

select public.decide_seller_opt_out(
  current_setting('test.opt_request')::uuid,
  'approved',
  array[
    'https://www.immobiliare.it/annunci/116128813',
    'https://www.casa.it/immobili/82715349'
  ]
);

do $$
begin
  perform public.decide_seller_opt_out(
    current_setting('test.opt_request')::uuid,
    'approved',
    array['https://www.immobiliare.it/annunci/116128813']
  );
  raise exception 'approved twice';
exception
  when others then
    if sqlerrm <> 'already decided' then
      raise;
    end if;
end $$;

reset role;

do $$
declare
  n int;
  st public.trip_listing_status;
  addr text;
  lat double precision;
  b text;
  v_user uuid;
begin
  select count(*) into n from public.property_locations where property_id = current_setting('test.property')::uuid;
  if n <> 0 then
    raise exception 'opted-out pin was kept';
  end if;

  select count(*) into n from public.property_locations where property_id = current_setting('test.other_property')::uuid;
  if n <> 1 then
    raise exception 'unrelated pin was deleted';
  end if;

  if not exists (
    select 1 from private.opted_out_urls
    where canonical_url = 'https://www.immobiliare.it/annunci/116128813'
  ) or not exists (
    select 1 from private.opted_out_urls
    where canonical_url = 'https://www.idealista.it/immobile/24811320'
  ) or not exists (
    select 1 from private.opted_out_urls
    where canonical_url = 'https://www.casa.it/immobili/82715349'
  ) then
    raise exception 'canonical urls were not all recorded';
  end if;

  if exists (
    select 1 from private.opted_out_urls
    where canonical_url = 'https://example.com/unrelated-house'
  ) then
    raise exception 'unrelated listing was opted out';
  end if;

  select count(*) into n
  from private.opted_out_properties
  where property_id = current_setting('test.property')::uuid;
  if n <> 1 then
    raise exception 'linked property was not marked';
  end if;

  select status, given_address, given_lat
    into st, addr, lat
  from public.trip_listings
  where id = current_setting('test.tl_a')::uuid;
  if st <> 'unavailable' or addr is not null or lat is not null then
    raise exception 'unlocked stop still has a location: % % %', st, addr, lat;
  end if;

  select status into st from public.trip_listings where id = current_setting('test.tl_b')::uuid;
  if st <> 'unavailable' then
    raise exception 'open check was not closed as unavailable, got %', st;
  end if;

  select status, given_address into st, addr
  from public.trip_listings
  where id = current_setting('test.tl_c')::uuid;
  if st = 'unavailable' or addr is null then
    raise exception 'unrelated stop was cleared: % %', st, addr;
  end if;

  select count(*) into n
  from public.verification_requests
  where trip_listing_id = current_setting('test.tl_b')::uuid
    and status = 'not_found';
  if n <> 1 then
    raise exception 'open check was not marked not found';
  end if;

  select count(*) into n
  from public.credit_ledger
  where verification_request_id = (
    select id from public.verification_requests
    where trip_listing_id = current_setting('test.tl_b')::uuid
  ) and reason = 'refund';
  if n <> 1 then
    raise exception 'open check was not refunded';
  end if;

  select count(*) into n
  from public.credit_ledger
  where verification_request_id = current_setting('test.found')::uuid
    and reason = 'refund';
  if n <> 0 then
    raise exception 'a finished unlock was refunded';
  end if;

  select user_id, body into v_user, b
  from public.notification_outbox
  where kind = 'opt_out_confirmed' and to_email = 'owner@example.com';
  if b is null then
    raise exception 'missing seller confirmation';
  end if;
  if v_user is not null then
    raise exception 'seller notice was tied to a user';
  end if;
  if position('44.701111' in b) > 0 or position('Via Segreta' in b) > 0 or position('8.035111' in b) > 0 then
    raise exception 'seller notice contains a location';
  end if;
  if position('fine' in lower(b)) > 0 then
    raise exception 'seller notice mentions a fine';
  end if;
  if position('not an estate agency' in b) = 0 then
    raise exception 'seller notice dropped the agency line';
  end if;
end $$;

-- The scheduler pin function must hide an opted-out house even if a coordinate row is put back.
insert into public.property_locations (property_id, lat, lng)
values (current_setting('test.property')::uuid, 44.701111, 8.035111);

set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.nina'), false);

do $$
declare
  n int;
begin
  select count(*) into n
  from public.buyer_unlocked_pins(current_setting('test.trip_nina')::uuid);
  if n <> 0 then
    raise exception 'opted-out property still returned a pin, count %', n;
  end if;
end $$;

reset role;
delete from public.property_locations
where property_id = current_setting('test.property')::uuid;

do $$
declare
  v_id uuid;
begin
  insert into public.listings (url, canonical_url, portal, created_by)
  values (
    'https://www.casa.it/immobili/82715349',
    'https://www.casa.it/immobili/82715349',
    'casa',
    current_setting('test.nina')::uuid
  )
  returning id into v_id;
  perform set_config('test.listing_casa', v_id::text, false);
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.nina'), false);

do $$
declare
  v_balance integer;
  v_id uuid;
begin
  v_balance := public.credit_balance();
  if v_balance <> 1 then
    raise exception 'balance after refund is %', v_balance;
  end if;

  insert into public.trip_listings (
    trip_id, listing_id, comune_istat, comune_name,
    approx_lat, approx_lng, approx_radius_m,
    given_address, given_lat, given_lng
  ) values (
    current_setting('test.trip_nina')::uuid,
    current_setting('test.listing_casa')::uuid,
    '001003', 'Alba',
    44.70, 8.03, 3000,
    'Via Nuova 4', 44.71, 8.04
  ) returning id into v_id;

  perform set_config('test.tl_future', v_id::text, false);
end $$;

reset role;

do $$
declare
  st public.trip_listing_status;
  addr text;
begin
  select status, given_address into st, addr
  from public.trip_listings
  where id = current_setting('test.tl_future')::uuid;
  if st <> 'unavailable' or addr is not null then
    raise exception 'new stop on an opted-out listing kept a pin: % %', st, addr;
  end if;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.nina'), false);

do $$
declare
  v_balance integer;
begin
  begin
    perform public.request_verification(current_setting('test.tl_future')::uuid);
    raise exception 'future check was accepted';
  exception
    when others then
      if sqlerrm <> 'cannot locate' then
        raise;
      end if;
  end;

  v_balance := public.credit_balance();
  if v_balance <> 1 then
    raise exception 'refused check changed the balance to %', v_balance;
  end if;

  begin
    perform public.request_verification(current_setting('test.tl_a')::uuid);
    raise exception 'unlocked listing could be requested again';
  exception
    when others then
      if sqlerrm <> 'cannot locate' then
        raise;
      end if;
  end;
end $$;

reset role;
set role anon;

select public.submit_seller_opt_out(
  array['https://example.com/please-reject'],
  null,
  'reject@example.com',
  true,
  ''
);

reset role;

do $$
declare
  v_id uuid;
begin
  select id into v_id
  from private.seller_opt_out_requests
  where contact_email = 'reject@example.com';
  perform set_config('test.reject_request', v_id::text, false);
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.optadmin'), false);

select public.decide_seller_opt_out(current_setting('test.reject_request')::uuid, 'rejected', null);

reset role;

do $$
declare
  n int;
  b text;
begin
  select count(*) into n
  from private.opted_out_urls
  where canonical_url = 'https://example.com/please-reject';
  if n <> 0 then
    raise exception 'a rejection opted a url out';
  end if;

  select count(*) into n
  from public.property_locations
  where property_id = current_setting('test.other_property')::uuid;
  if n <> 1 then
    raise exception 'rejection deleted a pin';
  end if;

  select body into b
  from public.notification_outbox
  where kind = 'opt_out_declined' and to_email = 'reject@example.com';
  if b is null then
    raise exception 'missing decline notice';
  end if;
  if position('44.701111' in b) > 0 or position('fine' in lower(b)) > 0 then
    raise exception 'decline notice leaked or mentioned a fine';
  end if;

  if exists (
    select 1 from private.seller_opt_out_requests
    where contact_email = 'owner@example.com' and status = 'pending'
  ) then
    raise exception 'approved request is still pending';
  end if;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.nina'), false);

do $$
begin
  perform id from public.notification_outbox;
  raise exception 'buyer read the outbox';
exception
  when insufficient_privilege then
    null;
end $$;

reset role;
