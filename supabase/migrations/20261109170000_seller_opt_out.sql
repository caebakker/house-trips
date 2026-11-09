-- Sellers (or someone they have authorised) can ask us to stop locating a house.
--
-- This runs after the scheduler migration (live version 20261109140801).
-- That migration already created schema private and buyer_unlocked_pins.
-- The pin function reads private.opted_out_properties and private.opted_out_urls
-- when those tables exist, so creating them here is what starts withholding pins.
-- Do not replace buyer_unlocked_pins.
--
-- Requests live in the private schema, which is not part of the Data API.
-- Anonymous visitors insert only through private.insert_seller_opt_out, a
-- security definer function. public.submit_seller_opt_out is a thin wrapper
-- so the client can call it. Nobody can select the request rows: there are
-- no grants and no policies. Admins read and decide through security definer
-- functions that check is_admin().
--
-- Approving records the canonical listing URL, plus any other listing M2 has
-- already linked to the same house. Stored pins are deleted, open checks are
-- closed with the same not-found refund as the queue, and later checks are
-- refused. Buyers are not told why.

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

comment on schema private is
  'Not exposed by the API. Seller opt-out records and the buyer coordinate lookup.';

-- The hosted project and the local test bootstrap both have service_role.
-- It must not read these tables, even though it bypasses row level security.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on schema private from service_role';
  end if;
end $$;

create table private.seller_opt_out_requests (
  id uuid primary key default gen_random_uuid(),
  listing_urls text[] not null check (cardinality(listing_urls) between 1 and 10),
  canonical_urls text[] check (canonical_urls is null or cardinality(canonical_urls) between 1 and 100),
  comune text check (comune is null or char_length(comune) between 1 and 80),
  contact_email text check (contact_email is null or char_length(contact_email) between 3 and 320),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  check (
    (status = 'pending' and decided_at is null)
    or (status in ('approved', 'rejected') and decided_at is not null)
  )
);

create index seller_opt_out_requests_pending_idx
  on private.seller_opt_out_requests (created_at)
  where status = 'pending';

create index seller_opt_out_requests_decided_by_idx
  on private.seller_opt_out_requests (decided_by);

comment on table private.seller_opt_out_requests is
  'Minimum data for a stop-locating request: listing links, an optional comune, an optional email. No owner name.';

create table private.opted_out_urls (
  canonical_url text primary key check (
    canonical_url ~* '^https://'
    and char_length(canonical_url) between 12 and 2000
    and canonical_url !~ '[[:space:]]'
  ),
  request_id uuid references private.seller_opt_out_requests (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index opted_out_urls_request_id_idx
  on private.opted_out_urls (request_id);

comment on table private.opted_out_urls is
  'Canonical listing URLs we must not locate. Matching uses the same canonical_url stored on listings.';

create table private.opted_out_properties (
  property_id uuid primary key references public.properties (id) on delete cascade,
  request_id uuid references private.seller_opt_out_requests (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index opted_out_properties_request_id_idx
  on private.opted_out_properties (request_id);

comment on table private.opted_out_properties is
  'Houses M2 had already linked to an opted-out listing. The pin in property_locations is deleted.';

create table private.opt_out_submit_log (
  id bigint generated always as identity primary key,
  bucket text not null check (char_length(bucket) between 1 and 400),
  created_at timestamptz not null default now()
);

create index opt_out_submit_log_bucket_idx
  on private.opt_out_submit_log (bucket, created_at desc);

comment on table private.opt_out_submit_log is
  'Coarse rate limit for the public form. Buckets are email, client IP when the API provides one, and a global count.';

alter table private.seller_opt_out_requests enable row level security;
alter table private.seller_opt_out_requests force row level security;
alter table private.opted_out_urls enable row level security;
alter table private.opted_out_urls force row level security;
alter table private.opted_out_properties enable row level security;
alter table private.opted_out_properties force row level security;
alter table private.opt_out_submit_log enable row level security;
alter table private.opt_out_submit_log force row level security;

revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on all tables in schema private from service_role';
    execute 'revoke all on all sequences in schema private from service_role';
  end if;
end $$;

-- No policies. Combined with the revokes, the API roles cannot read or write.
-- Security definer functions owned by the migration role still can.

alter type public.trip_listing_status add value if not exists 'unavailable';

create or replace function public.derive_trip_listing_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('check_requested', 'verified', 'not_found', 'unavailable') then
    return new;
  end if;
  if tg_op = 'INSERT' or old.status in ('approximate', 'address_given') then
    new.status := case
      when new.given_lat is not null then 'address_given'::public.trip_listing_status
      else 'approximate'::public.trip_listing_status
    end;
  end if;
  return new;
end;
$$;

-- Shared with resolve_verification so an opt-out refunds the same way as Not found.
create function public.close_verification_not_found(p_request_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_status public.verification_status;
  v_trip_listing_id uuid;
  v_requested_by uuid;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'not allowed';
  end if;

  if v_note is not null and char_length(v_note) > 2000 then
    raise exception 'note too long';
  end if;

  select status, trip_listing_id, requested_by
    into v_status, v_trip_listing_id, v_requested_by
  from public.verification_requests
  where id = p_request_id
  for update;

  if v_status is null or v_status not in ('queued', 'in_review') then
    raise exception 'already resolved';
  end if;

  update public.verification_requests
  set status = 'not_found',
      admin_notes = v_note,
      resolved_at = now()
  where id = p_request_id;

  update public.trip_listings
  set status = 'not_found'
  where id = v_trip_listing_id;

  if exists (
    select 1 from public.credit_ledger
    where verification_request_id = p_request_id and reason = 'unlock'
  ) and not exists (
    select 1 from public.credit_ledger
    where verification_request_id = p_request_id and reason = 'refund'
  ) then
    insert into public.credit_ledger (
      user_id, delta, reason, trip_listing_id, verification_request_id, created_by
    ) values (
      v_requested_by, 1, 'refund', v_trip_listing_id, p_request_id, v_uid
    );
  end if;

  perform public.enqueue_verification_email(p_request_id, 'verification_not_found');
end;
$$;

create or replace function public.request_verification(p_trip_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_trip_id uuid;
  v_listing_id uuid;
  v_status public.trip_listing_status;
  v_balance integer;
  v_id uuid;
  v_blocked boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select tl.trip_id, tl.listing_id, tl.status
    into v_trip_id, v_listing_id, v_status
  from public.trip_listings tl
  where tl.id = p_trip_listing_id;

  if v_trip_id is null or not public.is_trip_member(v_trip_id) then
    raise exception 'not allowed';
  end if;

  -- Serialise with an approval, which locks the same listing row.
  perform 1 from public.listings where id = v_listing_id for update;

  select
    v_status = 'unavailable'
    or exists (
      select 1
      from private.opted_out_urls u
      join public.listings l on l.canonical_url = u.canonical_url
      where l.id = v_listing_id
    )
    or exists (
      select 1
      from public.listing_properties lp
      join private.opted_out_properties op on op.property_id = lp.property_id
      where lp.listing_id = v_listing_id
    )
  into v_blocked;

  if v_blocked then
    raise exception 'cannot locate';
  end if;

  if v_status = 'verified' then
    raise exception 'already found';
  end if;

  if exists (
    select 1 from public.verification_requests
    where trip_listing_id = p_trip_listing_id
      and status in ('queued', 'in_review')
  ) then
    raise exception 'already requested';
  end if;

  perform 1 from public.profiles where id = v_uid for update;

  select coalesce(sum(delta), 0) into v_balance
  from public.credit_ledger
  where user_id = v_uid;

  if v_balance < 1 then
    raise exception 'no credits';
  end if;

  begin
    insert into public.verification_requests (listing_id, requested_by, trip_listing_id)
    values (v_listing_id, v_uid, p_trip_listing_id)
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'already requested';
  end;

  insert into public.credit_ledger (
    user_id, delta, reason, trip_listing_id, verification_request_id, created_by
  ) values (
    v_uid, -1, 'unlock', p_trip_listing_id, v_id, v_uid
  );

  update public.trip_listings
  set status = 'check_requested'
  where id = p_trip_listing_id;

  return v_id;
end;
$$;

create or replace function public.resolve_verification(
  p_request_id uuid,
  p_outcome text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_property_id uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_status public.verification_status;
  v_listing_id uuid;
  v_trip_listing_id uuid;
  v_property_id uuid;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'not allowed';
  end if;

  if p_outcome not in ('found', 'not_found') then
    raise exception 'not allowed';
  end if;

  if v_note is not null and char_length(v_note) > 2000 then
    raise exception 'note too long';
  end if;

  select status, listing_id, trip_listing_id
    into v_status, v_listing_id, v_trip_listing_id
  from public.verification_requests
  where id = p_request_id
  for update;

  if v_status is null or v_status not in ('queued', 'in_review') then
    raise exception 'already resolved';
  end if;

  if p_outcome = 'found' then
    if exists (
      select 1
      from private.opted_out_urls u
      join public.listings l on l.canonical_url = u.canonical_url
      where l.id = v_listing_id
    ) or exists (
      select 1
      from public.listing_properties lp
      join private.opted_out_properties op on op.property_id = lp.property_id
      where lp.listing_id = v_listing_id
    ) or (
      p_property_id is not null and exists (
        select 1 from private.opted_out_properties op
        where op.property_id = p_property_id
      )
    ) then
      raise exception 'cannot locate';
    end if;

    if p_property_id is not null then
      if not exists (
        select 1 from public.property_locations where property_id = p_property_id
      ) then
        raise exception 'unknown house';
      end if;
      v_property_id := p_property_id;
    else
      if p_lat is null or p_lng is null then
        raise exception 'pin required';
      end if;
      insert into public.properties (verified_by, source)
      values (v_uid, 'manual')
      returning id into v_property_id;

      begin
        insert into public.property_locations (property_id, lat, lng)
        values (v_property_id, p_lat, p_lng);
      exception
        when check_violation then
          raise exception 'pin outside italy';
      end;
    end if;

    insert into public.listing_properties (listing_id, property_id)
    values (v_listing_id, v_property_id)
    on conflict (listing_id) do update set property_id = excluded.property_id;

    update public.verification_requests
    set status = 'found',
        property_id = v_property_id,
        admin_notes = v_note,
        resolved_at = now()
    where id = p_request_id;

    update public.trip_listings
    set status = 'verified'
    where id = v_trip_listing_id;

    perform public.enqueue_verification_email(p_request_id, 'verification_found');
  else
    perform public.close_verification_not_found(p_request_id, p_note);
  end if;

  return jsonb_build_object('ok', true, 'status', p_outcome);
end;
$$;

create function private.request_ip()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_raw text;
  v_ip text;
begin
  begin
    v_raw := current_setting('request.headers', true);
  exception
    when others then
      return null;
  end;

  if v_raw is null or btrim(v_raw) = '' then
    return null;
  end if;

  begin
    v_ip := btrim(split_part(coalesce(v_raw::json ->> 'x-forwarded-for', ''), ',', 1));
  exception
    when others then
      return null;
  end;

  if v_ip is null or v_ip = '' or char_length(v_ip) > 64 then
    return null;
  end if;

  return v_ip;
end;
$$;

create function private.insert_seller_opt_out(
  p_listing_urls text[],
  p_comune text default null,
  p_contact_email text default null,
  p_confirmed boolean default null,
  p_company text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_urls text[] := '{}';
  v_email text;
  v_comune text;
  v_ip text;
  v_count integer;
begin
  v_email := nullif(lower(btrim(coalesce(p_contact_email, ''))), '');
  v_ip := private.request_ip();

  delete from private.opt_out_submit_log
  where created_at < now() - interval '2 days';

  if v_email is not null then
    insert into private.opt_out_submit_log (bucket) values ('email:' || v_email);
    select count(*) into v_count
    from private.opt_out_submit_log
    where bucket = 'email:' || v_email
      and created_at > now() - interval '1 day';
    if v_count > 5 then
      raise exception 'slow down';
    end if;
  end if;

  if v_ip is not null then
    insert into private.opt_out_submit_log (bucket) values ('ip:' || v_ip);
    select count(*) into v_count
    from private.opt_out_submit_log
    where bucket = 'ip:' || v_ip
      and created_at > now() - interval '1 hour';
    if v_count > 10 then
      raise exception 'slow down';
    end if;
  end if;

  insert into private.opt_out_submit_log (bucket) values ('global');
  select count(*) into v_count
  from private.opt_out_submit_log
  where bucket = 'global'
    and created_at > now() - interval '1 hour';
  if v_count > 40 then
    raise exception 'slow down';
  end if;

  -- Filled honeypot: pretend it worked and store nothing.
  if nullif(btrim(coalesce(p_company, '')), '') is not null then
    return jsonb_build_object('ok', true);
  end if;

  if p_confirmed is not true then
    raise exception 'not confirmed';
  end if;

  if v_email is not null and (
    char_length(v_email) > 320
    or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ) then
    raise exception 'invalid email';
  end if;

  v_comune := nullif(btrim(coalesce(p_comune, '')), '');
  if v_comune is not null and char_length(v_comune) > 80 then
    raise exception 'invalid comune';
  end if;

  if p_listing_urls is null or cardinality(p_listing_urls) > 10 then
    raise exception 'invalid urls';
  end if;

  foreach v_url in array p_listing_urls loop
    if v_url is null or btrim(v_url) = '' then
      continue;
    end if;
    v_url := btrim(v_url);
    if char_length(v_url) > 2000
       or v_url !~* '^https?://'
       or v_url ~ '[[:space:]]' then
      raise exception 'invalid urls';
    end if;
    v_urls := array_append(v_urls, v_url);
  end loop;

  if v_urls is null or cardinality(v_urls) < 1 or cardinality(v_urls) > 10 then
    raise exception 'invalid urls';
  end if;

  insert into private.seller_opt_out_requests (listing_urls, comune, contact_email)
  values (v_urls, v_comune, v_email);

  return jsonb_build_object('ok', true);
end;
$$;

create function public.submit_seller_opt_out(
  p_listing_urls text[],
  p_comune text default null,
  p_contact_email text default null,
  p_confirmed boolean default null,
  p_company text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.insert_seller_opt_out(
    p_listing_urls,
    p_comune,
    p_contact_email,
    p_confirmed,
    p_company
  );
$$;

create function public.admin_opt_out_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception 'not allowed';
  end if;

  return coalesce((
    select jsonb_agg(item order by item ->> 'created_at')
    from (
      select jsonb_build_object(
        'id', r.id,
        'listing_urls', to_jsonb(r.listing_urls),
        'comune', r.comune,
        'contact_email', r.contact_email,
        'created_at', r.created_at
      ) as item
      from private.seller_opt_out_requests r
      where r.status = 'pending'
    ) pending_requests
  ), '[]'::jsonb);
end;
$$;

create function private.enqueue_opt_out_notice(p_email text, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject text;
  v_body text;
begin
  if p_email is null or p_kind not in ('opt_out_confirmed', 'opt_out_declined') then
    raise exception 'not allowed';
  end if;

  if p_kind = 'opt_out_confirmed' then
    v_subject := 'We have stopped locating the property';
    v_body :=
      E'Hello,\n\nWe have recorded your request and will not locate or show that property.\n\nYou do not need to do anything else.\n\nGuidocasa is not an estate agency and takes no part in any sale.';
  else
    v_subject := 'We have reviewed your request';
    v_body :=
      E'Hello,\n\nWe have reviewed your request and will not change anything for it.\n\nIf the property is yours, or the owner has authorised you, you can send the public listing link again from the opt-out page.\n\nGuidocasa is not an estate agency and takes no part in any sale.';
  end if;

  insert into public.notification_outbox (user_id, to_email, subject, body, kind)
  values (null, p_email, v_subject, v_body, p_kind);
end;
$$;

create function public.decide_seller_opt_out(
  p_request_id uuid,
  p_decision text,
  p_canonical_urls text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_status text;
  v_email text;
  v_url text;
  v_urls text[] := '{}';
  v_more text[] := '{}';
  v_property_ids uuid[] := '{}';
  r record;
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'not allowed';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'not allowed';
  end if;

  select status, contact_email
    into v_status, v_email
  from private.seller_opt_out_requests
  where id = p_request_id
  for update;

  if v_status is null then
    raise exception 'not found';
  end if;

  if v_status <> 'pending' then
    raise exception 'already decided';
  end if;

  if p_decision = 'rejected' then
    update private.seller_opt_out_requests
    set status = 'rejected',
        decided_at = now(),
        decided_by = v_uid
    where id = p_request_id;

    if v_email is not null then
      perform private.enqueue_opt_out_notice(v_email, 'opt_out_declined');
    end if;

    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  if p_canonical_urls is null or cardinality(p_canonical_urls) > 20 then
    raise exception 'invalid urls';
  end if;

  foreach v_url in array p_canonical_urls loop
    if v_url is null or btrim(v_url) = '' then
      continue;
    end if;
    v_url := btrim(v_url);
    if char_length(v_url) > 2000
       or v_url !~* '^https://'
       or v_url ~ '[[:space:]]'
       or v_url = any (v_urls) then
      if v_url = any (v_urls) then
        continue;
      end if;
      raise exception 'invalid urls';
    end if;
    v_urls := array_append(v_urls, v_url);
  end loop;

  if cardinality(v_urls) < 1 then
    raise exception 'invalid urls';
  end if;

  select coalesce(array_agg(distinct lp.property_id), '{}')
    into v_property_ids
  from public.listings l
  join public.listing_properties lp on lp.listing_id = l.id
  where l.canonical_url = any (v_urls);

  select coalesce(array_agg(distinct l.canonical_url), '{}')
    into v_more
  from public.listing_properties lp
  join public.listings l on l.id = lp.listing_id
  where lp.property_id = any (v_property_ids);

  select coalesce(array_agg(distinct u), '{}')
    into v_urls
  from (
    select unnest(v_urls) as u
    union
    select unnest(v_more) as u
  ) expanded
  where u is not null and btrim(u) <> '';

  perform 1
  from public.listings
  where canonical_url = any (v_urls)
     or id in (
       select lp.listing_id
       from public.listing_properties lp
       where lp.property_id = any (v_property_ids)
     )
  order by id
  for update;

  insert into private.opted_out_urls (canonical_url, request_id)
  select u, p_request_id
  from unnest(v_urls) as u
  on conflict (canonical_url) do nothing;

  insert into private.opted_out_properties (property_id, request_id)
  select property_id, p_request_id
  from unnest(v_property_ids) as property_id
  on conflict (property_id) do nothing;

  delete from public.property_locations
  where property_id = any (v_property_ids);

  for r in
    select vr.id
    from public.verification_requests vr
    join public.listings l on l.id = vr.listing_id
    where vr.status in ('queued', 'in_review')
      and (
        l.canonical_url = any (v_urls)
        or exists (
          select 1
          from public.listing_properties lp
          where lp.listing_id = l.id
            and lp.property_id = any (v_property_ids)
        )
      )
    order by vr.id
    for update of vr
  loop
    perform public.close_verification_not_found(r.id, null);
  end loop;

  update public.trip_listings tl
  set status = 'unavailable',
      given_address = null,
      given_lat = null,
      given_lng = null
  where tl.listing_id in (
    select l.id from public.listings l where l.canonical_url = any (v_urls)
  )
  or tl.listing_id in (
    select lp.listing_id
    from public.listing_properties lp
    where lp.property_id = any (v_property_ids)
  );

  update private.seller_opt_out_requests
  set status = 'approved',
      canonical_urls = v_urls,
      decided_at = now(),
      decided_by = v_uid
  where id = p_request_id;

  if v_email is not null then
    perform private.enqueue_opt_out_notice(v_email, 'opt_out_confirmed');
  end if;

  return jsonb_build_object('ok', true, 'status', 'approved');
end;
$$;

-- Clears a stored address and pin, and keeps the stop unavailable, including
-- listings added after the approval. Runs after derive_trip_listing_status.
create function private.suppress_opted_out_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_blocked boolean;
begin
  select exists (
    select 1
    from public.listings l
    join private.opted_out_urls u on u.canonical_url = l.canonical_url
    where l.id = new.listing_id
  ) or exists (
    select 1
    from public.listing_properties lp
    join private.opted_out_properties op on op.property_id = lp.property_id
    where lp.listing_id = new.listing_id
  )
  into v_blocked;

  if v_blocked then
    new.given_address := null;
    new.given_lat := null;
    new.given_lng := null;
    new.status := 'unavailable';
  end if;

  return new;
end;
$$;

create trigger trip_listings_suppress_opted_out
  before insert or update on public.trip_listings
  for each row execute function private.suppress_opted_out_location();

do $$
declare
  v_name text;
begin
  select conname into v_name
  from pg_constraint
  where conrelid = 'public.notification_outbox'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%verification_found%';

  if v_name is not null then
    execute format('alter table public.notification_outbox drop constraint %I', v_name);
  end if;
end $$;

alter table public.notification_outbox
  add constraint notification_outbox_kind_check
  check (kind in (
    'verification_found',
    'verification_not_found',
    'opt_out_confirmed',
    'opt_out_declined'
  ));

alter table public.notification_outbox
  alter column user_id drop not null;

comment on table public.notification_outbox is
  'Email waiting to be sent. Nothing here is delivered until the send-notifications function is switched on. Bodies must not contain coordinates, a typed address, or admin notes. Seller opt-out notices have no user id.';

revoke all on function private.request_ip() from public, anon, authenticated;
revoke all on function private.enqueue_opt_out_notice(text, text) from public, anon, authenticated;
revoke all on function private.suppress_opted_out_location() from public, anon;
grant execute on function private.suppress_opted_out_location() to authenticated;

revoke all on function private.insert_seller_opt_out(text[], text, text, boolean, text) from public;
grant execute on function private.insert_seller_opt_out(text[], text, text, boolean, text) to anon, authenticated;

revoke all on function public.submit_seller_opt_out(text[], text, text, boolean, text) from public;
grant execute on function public.submit_seller_opt_out(text[], text, text, boolean, text) to anon, authenticated;

revoke all on function public.admin_opt_out_queue() from public, anon;
grant execute on function public.admin_opt_out_queue() to authenticated;

revoke all on function public.decide_seller_opt_out(uuid, text, text[]) from public, anon;
grant execute on function public.decide_seller_opt_out(uuid, text, text[]) to authenticated;

revoke all on function public.close_verification_not_found(uuid, text) from public, anon, authenticated;
