-- M2: verification queue, exact locations, and the credit ledger.
--
-- Exact coordinates live only in property_locations. anon and authenticated
-- have no privileges on that table. Admin screens read coordinates through
-- security definer functions that check is_admin(). A later GRANT SELECT
-- still returns no rows to buyers, because RLS allows only admins.
--
-- A location check spends one credit (reason unlock, delta -1). Not found,
-- or removing the listing while the check is still open, writes a refund.
-- Balance is the sum of the ledger. There is no balance column.

create type public.property_source as enum ('ai', 'manual', 'agent');

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  verified_by uuid references public.profiles (id) on delete set null,
  verified_at timestamptz not null default now(),
  source public.property_source not null default 'manual',
  created_at timestamptz not null default now()
);

create table public.property_locations (
  property_id uuid primary key references public.properties (id) on delete cascade,
  lat double precision not null check (lat between 35 and 48),
  lng double precision not null check (lng between 6 and 19)
);

comment on table public.property_locations is
  'Exact house coordinates. No API privileges for buyers. Admins read them only via security definer functions.';

create table public.listing_properties (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index listing_properties_property_id_idx on public.listing_properties (property_id);

comment on table public.listing_properties is
  'One listing points at one physical house. Several listings can share a house.';

create type public.verification_status as enum ('queued', 'in_review', 'found', 'not_found');

create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete restrict,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  trip_listing_id uuid not null references public.trip_listings (id) on delete cascade,
  status public.verification_status not null default 'queued',
  candidates jsonb not null default '[]'::jsonb,
  property_id uuid references public.properties (id) on delete set null,
  admin_notes text check (admin_notes is null or char_length(admin_notes) <= 2000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index verification_requests_trip_listing_idx
  on public.verification_requests (trip_listing_id, created_at desc);

create index verification_requests_requested_by_idx
  on public.verification_requests (requested_by);

create unique index verification_requests_one_open_idx
  on public.verification_requests (trip_listing_id)
  where status in ('queued', 'in_review');

create type public.credit_reason as enum ('purchase', 'unlock', 'refund', 'grant');

comment on type public.credit_reason is
  'unlock spends a credit on a location check. refund returns it when the house is not found, or the listing is removed while the check is still open.';

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason public.credit_reason not null,
  stripe_payment_intent text,
  trip_listing_id uuid references public.trip_listings (id) on delete set null,
  verification_request_id uuid references public.verification_requests (id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (reason = 'unlock' and delta < 0)
    or (reason in ('purchase', 'refund', 'grant') and delta > 0)
  )
);

create index credit_ledger_user_created_idx
  on public.credit_ledger (user_id, created_at desc);

create unique index credit_ledger_stripe_idx
  on public.credit_ledger (stripe_payment_intent)
  where stripe_payment_intent is not null;

create unique index credit_ledger_one_unlock_idx
  on public.credit_ledger (verification_request_id)
  where reason = 'unlock' and verification_request_id is not null;

create unique index credit_ledger_one_refund_idx
  on public.credit_ledger (verification_request_id)
  where reason = 'refund' and verification_request_id is not null;

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  to_email text not null,
  subject text not null check (char_length(subject) between 1 and 200),
  body text not null check (char_length(body) between 1 and 4000),
  kind text not null check (kind in ('verification_found', 'verification_not_found')),
  verification_request_id uuid references public.verification_requests (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index notification_outbox_pending_idx
  on public.notification_outbox (created_at)
  where status = 'pending';

comment on table public.notification_outbox is
  'Email waiting to be sent. Nothing here is delivered until the send-notifications function is switched on. Bodies must not contain coordinates or admin notes.';

-- Keep an explicit check_requested / verified / not_found. Buyer edits still
-- cannot set status: that column is not granted to authenticated.
create or replace function public.derive_trip_listing_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('check_requested', 'verified', 'not_found') then
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

create function public.enqueue_verification_email(p_request_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_name text;
  v_comune text;
  v_url text;
  v_email text;
  v_user uuid;
  v_subject text;
  v_body text;
begin
  if p_kind not in ('verification_found', 'verification_not_found') then
    raise exception 'not allowed';
  end if;

  select t.name, tl.comune_name, l.url, pr.email, vr.requested_by
    into v_trip_name, v_comune, v_url, v_email, v_user
  from public.verification_requests vr
  join public.trip_listings tl on tl.id = vr.trip_listing_id
  join public.trips t on t.id = tl.trip_id
  join public.listings l on l.id = vr.listing_id
  join public.profiles pr on pr.id = vr.requested_by
  where vr.id = p_request_id;

  if v_user is null then
    raise exception 'not allowed';
  end if;

  if p_kind = 'verification_found' then
    v_subject := format('Location found on %s', v_trip_name);
    v_body := format(
      E'Hello,\n\nWe have found the location of a listing in %s on your trip "%s".\n\nOpen Guidocasa and look at that trip to see the status. This email does not include the location.\n\nThe listing you added: %s\n\nFor viewings, prices and any next step, contact the agent named on the listing. We are not an estate agency and take no part in the sale.',
      v_comune, v_trip_name, v_url
    );
  else
    v_subject := format('Location not found on %s', v_trip_name);
    v_body := format(
      E'Hello,\n\nWe could not find an exact location for a listing in %s on your trip "%s". Your credit is back on your balance.\n\nYou can ask us to look again from the trip.\n\nThe listing you added: %s\n\nFor the house itself, contact the agent named on the listing. We are not an estate agency and take no part in the sale.',
      v_comune, v_trip_name, v_url
    );
  end if;

  if char_length(v_subject) > 200 then
    v_subject := left(v_subject, 200);
  end if;

  insert into public.notification_outbox (
    user_id, to_email, subject, body, kind, verification_request_id
  ) values (
    v_user, v_email, v_subject, v_body, p_kind, p_request_id
  );
end;
$$;

create function public.request_verification(p_trip_listing_id uuid)
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

create function public.grant_credits(p_email text, p_amount integer, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_user uuid;
  v_count integer;
  v_balance integer;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'not allowed';
  end if;

  if p_amount is null or p_amount < 1 or p_amount > 500 then
    raise exception 'invalid amount';
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'note too long';
  end if;

  select count(*) into v_count
  from public.profiles
  where lower(email) = lower(trim(coalesce(p_email, '')));

  if v_count <> 1 then
    raise exception 'no such person';
  end if;

  select id into v_user
  from public.profiles
  where lower(email) = lower(trim(p_email));

  perform 1 from public.profiles where id = v_user for update;

  insert into public.credit_ledger (user_id, delta, reason, note, created_by)
  values (v_user, p_amount, 'grant', v_note, v_uid);

  select coalesce(sum(delta), 0) into v_balance
  from public.credit_ledger
  where user_id = v_user;

  return v_balance;
end;
$$;

create function public.credit_balance()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(delta), 0)::integer
  from public.credit_ledger
  where user_id = (select auth.uid());
$$;

create function public.admin_credit_balance(p_email text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_count integer;
  v_balance integer;
begin
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception 'not allowed';
  end if;

  select count(*) into v_count
  from public.profiles
  where lower(email) = lower(trim(coalesce(p_email, '')));

  if v_count <> 1 then
    raise exception 'no such person';
  end if;

  select id into v_user
  from public.profiles
  where lower(email) = lower(trim(p_email));

  select coalesce(sum(delta), 0) into v_balance
  from public.credit_ledger
  where user_id = v_user;

  return v_balance;
end;
$$;

create function public.admin_recent_grants()
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
    select jsonb_agg(item order by item ->> 'created_at' desc)
    from (
      select jsonb_build_object(
        'email', pr.email,
        'delta', cl.delta,
        'note', cl.note,
        'created_at', cl.created_at
      ) as item
      from public.credit_ledger cl
      join public.profiles pr on pr.id = cl.user_id
      where cl.reason = 'grant'
      order by cl.created_at desc
      limit 8
    ) recent
  ), '[]'::jsonb);
end;
$$;

create function public.admin_verification_queue()
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
    select jsonb_agg(item order by item ->> 'trip_start', item ->> 'created_at')
    from (
      select jsonb_build_object(
        'id', vr.id,
        'status', vr.status,
        'created_at', vr.created_at,
        'admin_notes', vr.admin_notes,
        'listing_id', vr.listing_id,
        'trip_listing_id', vr.trip_listing_id,
        'trip_id', t.id,
        'trip_name', t.name,
        'trip_start', t.start_date,
        'trip_end', t.end_date,
        'buyer_email', pr.email,
        'comune_name', tl.comune_name,
        'comune_istat', tl.comune_istat,
        'approx_lat', tl.approx_lat,
        'approx_lng', tl.approx_lng,
        'approx_radius_m', tl.approx_radius_m,
        'given_address', tl.given_address,
        'given_lat', tl.given_lat,
        'given_lng', tl.given_lng,
        'listing_url', l.url,
        'portal', l.portal,
        'linked_property_id', lp.property_id,
        'linked_lat', pl.lat,
        'linked_lng', pl.lng
      ) as item
      from public.verification_requests vr
      join public.trip_listings tl on tl.id = vr.trip_listing_id
      join public.trips t on t.id = tl.trip_id
      join public.profiles pr on pr.id = vr.requested_by
      join public.listings l on l.id = vr.listing_id
      left join public.listing_properties lp on lp.listing_id = vr.listing_id
      left join public.property_locations pl on pl.property_id = lp.property_id
      where vr.status in ('queued', 'in_review')
    ) open_requests
  ), '[]'::jsonb);
end;
$$;

create function public.admin_properties_near(
  p_lat double precision,
  p_lng double precision,
  p_listing_id uuid default null
)
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

  if p_lat is null or p_lng is null
     or p_lat < 35 or p_lat > 48 or p_lng < 6 or p_lng > 19 then
    raise exception 'not allowed';
  end if;

  return coalesce((
    select jsonb_agg(item order by (item ->> 'distance_m')::integer)
    from (
      select jsonb_build_object(
        'id', near.property_id,
        'lat', near.lat,
        'lng', near.lng,
        'distance_m', near.distance_m,
        'label', near.label
      ) as item
      from (
        select
          pl.property_id,
          pl.lat,
          pl.lng,
          round(6371000 * acos(least(1::double precision, greatest(-1::double precision,
            cos(radians(p_lat)) * cos(radians(pl.lat)) * cos(radians(pl.lng) - radians(p_lng))
            + sin(radians(p_lat)) * sin(radians(pl.lat))
          ))))::integer as distance_m,
          coalesce((
            select left(string_agg(distinct tl.comune_name, ', ' order by tl.comune_name), 120)
            from public.listing_properties lp
            join public.trip_listings tl on tl.listing_id = lp.listing_id
            where lp.property_id = pl.property_id
          ), 'House') as label
        from public.property_locations pl
        where (
          6371000 * acos(least(1::double precision, greatest(-1::double precision,
            cos(radians(p_lat)) * cos(radians(pl.lat)) * cos(radians(pl.lng) - radians(p_lng))
            + sin(radians(p_lat)) * sin(radians(pl.lat))
          )))
        ) <= 20000
        or exists (
          select 1 from public.listing_properties lp
          where lp.listing_id = p_listing_id and lp.property_id = pl.property_id
        )
        order by 4
        limit 25
      ) near
    ) rows
  ), '[]'::jsonb);
end;
$$;

create function public.resolve_verification(
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
  v_requested_by uuid;
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

  select status, listing_id, trip_listing_id, requested_by
    into v_status, v_listing_id, v_trip_listing_id, v_requested_by
  from public.verification_requests
  where id = p_request_id
  for update;

  if v_status is null or v_status not in ('queued', 'in_review') then
    raise exception 'already resolved';
  end if;

  if p_outcome = 'found' then
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
  end if;

  return jsonb_build_object('ok', true, 'status', p_outcome);
end;
$$;

create function public.refund_open_verification_on_listing_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select id, requested_by
    from public.verification_requests
    where trip_listing_id = old.id
      and status in ('queued', 'in_review')
  loop
    if exists (
      select 1 from public.credit_ledger
      where verification_request_id = r.id and reason = 'unlock'
    ) and not exists (
      select 1 from public.credit_ledger
      where verification_request_id = r.id and reason = 'refund'
    ) then
      insert into public.credit_ledger (
        user_id, delta, reason, trip_listing_id, verification_request_id, created_by
      ) values (
        r.requested_by, 1, 'refund', old.id, r.id, (select auth.uid())
      );
    end if;
  end loop;
  return old;
end;
$$;

create trigger trip_listings_refund_open_verification
  before delete on public.trip_listings
  for each row execute function public.refund_open_verification_on_listing_delete();

alter table public.properties enable row level security;
alter table public.property_locations enable row level security;
alter table public.listing_properties enable row level security;
alter table public.verification_requests enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.notification_outbox enable row level security;

create policy "properties: admin all" on public.properties
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "property_locations: admin all" on public.property_locations
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "listing_properties: admin all" on public.listing_properties
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "verification_requests: own trip or admin" on public.verification_requests
  for select to authenticated
  using (
    (select public.is_admin())
    or requested_by = (select auth.uid())
    or exists (
      select 1 from public.trip_listings tl
      where tl.id = verification_requests.trip_listing_id
        and public.is_trip_member(tl.trip_id)
    )
  );

create policy "credit_ledger: own or admin" on public.credit_ledger
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_admin())
  );

create policy "notification_outbox: admin read" on public.notification_outbox
  for select to authenticated
  using ((select public.is_admin()));

revoke all on public.properties from public, anon, authenticated;
revoke all on public.property_locations from public, anon, authenticated;
revoke all on public.listing_properties from public, anon, authenticated;
revoke all on public.notification_outbox from public, anon, authenticated;

revoke all on public.verification_requests from public, anon, authenticated;
grant select (
  id, listing_id, requested_by, trip_listing_id, status, created_at, resolved_at
) on public.verification_requests to authenticated;

revoke all on public.credit_ledger from public, anon, authenticated;
grant select (
  id, user_id, delta, reason, trip_listing_id, verification_request_id, created_at
) on public.credit_ledger to authenticated;

revoke execute on function public.enqueue_verification_email(uuid, text) from public, anon, authenticated;
revoke execute on function public.refund_open_verification_on_listing_delete() from public, anon, authenticated;

revoke execute on function public.request_verification(uuid) from public, anon;
revoke execute on function public.grant_credits(text, integer, text) from public, anon;
revoke execute on function public.credit_balance() from public, anon;
revoke execute on function public.admin_credit_balance(text) from public, anon;
revoke execute on function public.admin_recent_grants() from public, anon;
revoke execute on function public.admin_verification_queue() from public, anon;
revoke execute on function public.admin_properties_near(double precision, double precision, uuid) from public, anon;
revoke execute on function public.resolve_verification(uuid, text, double precision, double precision, uuid, text) from public, anon;

grant execute on function public.request_verification(uuid) to authenticated;
grant execute on function public.grant_credits(text, integer, text) to authenticated;
grant execute on function public.credit_balance() to authenticated;
grant execute on function public.admin_credit_balance(text) to authenticated;
grant execute on function public.admin_recent_grants() to authenticated;
grant execute on function public.admin_verification_queue() to authenticated;
grant execute on function public.admin_properties_near(double precision, double precision, uuid) to authenticated;
grant execute on function public.resolve_verification(uuid, text, double precision, double precision, uuid, text) to authenticated;
