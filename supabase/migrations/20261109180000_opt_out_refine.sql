-- Follow-up to the seller opt-out.
--
-- The confirmation is stored and required. Approving refunds a buyer who
-- already had the house found, once, and tells them the house is no longer
-- available. An admin can restore an approval without putting the pin back
-- and without charging anyone.

alter table private.seller_opt_out_requests
  add column owner_confirmed boolean,
  add column restored_at timestamptz,
  add column restored_by uuid references public.profiles (id) on delete set null;

update private.seller_opt_out_requests
set owner_confirmed = true
where owner_confirmed is null;

alter table private.seller_opt_out_requests
  alter column owner_confirmed set not null;

alter table private.seller_opt_out_requests
  add constraint seller_opt_out_requests_owner_confirmed_check
  check (owner_confirmed);

create index seller_opt_out_requests_restored_by_idx
  on private.seller_opt_out_requests (restored_by);

do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'private.seller_opt_out_requests'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%approved%'
  loop
    execute format('alter table private.seller_opt_out_requests drop constraint %I', r.conname);
  end loop;
end $$;

alter table private.seller_opt_out_requests
  add constraint seller_opt_out_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'restored'));

alter table private.seller_opt_out_requests
  add constraint seller_opt_out_requests_decided_check
  check (
    (status = 'pending' and decided_at is null and restored_at is null)
    or (status in ('approved', 'rejected') and decided_at is not null and restored_at is null)
    or (status = 'restored' and decided_at is not null and restored_at is not null)
  );

comment on column private.seller_opt_out_requests.owner_confirmed is
  'The requester confirmed they are the owner, or have the owner''s permission. Always true: the form cannot be stored without it.';

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
    'opt_out_declined',
    'location_unavailable'
  ));

create or replace function public.enqueue_verification_email(p_request_id uuid, p_kind text)
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
  if p_kind not in ('verification_found', 'verification_not_found', 'location_unavailable') then
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
  elsif p_kind = 'location_unavailable' then
    v_subject := format('A house on %s is no longer available', v_trip_name);
    v_body := format(
      E'Hello,\n\nA house in %s on your trip "%s" is no longer available on Guidocasa. Your credit is back on your balance.\n\nThe listing you added: %s\n\nFor the house itself, contact the agent named on the listing. We are not an estate agency and take no part in the sale.',
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

drop function public.close_verification_not_found(uuid, text);

create function public.close_verification_not_found(
  p_request_id uuid,
  p_note text default null,
  p_kind text default 'verification_not_found'
)
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
  v_kind text := coalesce(nullif(btrim(coalesce(p_kind, '')), ''), 'verification_not_found');
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'not allowed';
  end if;

  if v_kind not in ('verification_not_found', 'location_unavailable') then
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

  perform public.enqueue_verification_email(p_request_id, v_kind);
end;
$$;

drop function public.submit_seller_opt_out(text[], text, text, boolean, text);
drop function private.insert_seller_opt_out(text[], text, text, boolean, text);

create function private.insert_seller_opt_out(
  p_listing_urls text[],
  p_comune text,
  p_contact_email text,
  p_confirmed boolean,
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

  insert into private.seller_opt_out_requests (
    listing_urls, comune, contact_email, owner_confirmed
  ) values (
    v_urls, v_comune, v_email, true
  );

  return jsonb_build_object('ok', true);
end;
$$;

create function public.submit_seller_opt_out(
  p_listing_urls text[],
  p_comune text,
  p_contact_email text,
  p_confirmed boolean,
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

create or replace function public.admin_opt_out_queue()
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
    select jsonb_agg(item order by item ->> 'sort', item ->> 'created_at')
    from (
      select jsonb_build_object(
        'id', r.id,
        'status', r.status,
        'listing_urls', to_jsonb(r.listing_urls),
        'comune', r.comune,
        'contact_email', r.contact_email,
        'owner_confirmed', r.owner_confirmed,
        'created_at', r.created_at,
        'sort', case when r.status = 'pending' then '0' else '1' end
      ) as item
      from private.seller_opt_out_requests r
      where r.status in ('pending', 'approved')
    ) visible_requests
  ), '[]'::jsonb);
end;
$$;

create or replace function public.decide_seller_opt_out(
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
    perform public.close_verification_not_found(r.id, null, 'location_unavailable');
  end loop;

  for r in
    select vr.id, vr.requested_by, vr.trip_listing_id
    from public.verification_requests vr
    join public.listings l on l.id = vr.listing_id
    where vr.status = 'found'
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
        r.requested_by, 1, 'refund', r.trip_listing_id, r.id, v_uid
      );
      perform public.enqueue_verification_email(r.id, 'location_unavailable');
    end if;
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

create function public.restore_seller_opt_out(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_status text;
  v_urls text[] := '{}';
  v_property_ids uuid[] := '{}';
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'not allowed';
  end if;

  select status, coalesce(canonical_urls, '{}')
    into v_status, v_urls
  from private.seller_opt_out_requests
  where id = p_request_id
  for update;

  if v_status is null then
    raise exception 'not found';
  end if;

  if v_status <> 'approved' then
    raise exception 'not approved';
  end if;

  select coalesce(array_agg(op.property_id), '{}')
    into v_property_ids
  from private.opted_out_properties op
  where op.request_id = p_request_id
     or op.property_id in (
       select lp.property_id
       from public.listings l
       join public.listing_properties lp on lp.listing_id = l.id
       where l.canonical_url = any (v_urls)
     );

  delete from private.opted_out_urls u
  where u.canonical_url = any (v_urls)
    and not exists (
      select 1
      from private.seller_opt_out_requests other
      where other.id <> p_request_id
        and other.status = 'approved'
        and u.canonical_url = any (other.canonical_urls)
    );

  delete from private.opted_out_properties op
  where op.property_id = any (v_property_ids)
    and not exists (
      select 1
      from private.opted_out_urls u
      join public.listings l on l.canonical_url = u.canonical_url
      join public.listing_properties lp on lp.listing_id = l.id
      where lp.property_id = op.property_id
    );

  update public.trip_listings tl
  set status = 'approximate'
  where tl.status = 'unavailable'
    and (
      tl.listing_id in (
        select l.id from public.listings l where l.canonical_url = any (v_urls)
      )
      or tl.listing_id in (
        select lp.listing_id
        from public.listing_properties lp
        where lp.property_id = any (v_property_ids)
      )
    );

  update private.seller_opt_out_requests
  set status = 'restored',
      restored_at = now(),
      restored_by = v_uid
  where id = p_request_id;

  return jsonb_build_object('ok', true, 'status', 'restored');
end;
$$;

revoke all on function public.enqueue_verification_email(uuid, text) from public, anon, authenticated;

revoke all on function public.close_verification_not_found(uuid, text, text) from public, anon, authenticated;

revoke all on function private.insert_seller_opt_out(text[], text, text, boolean, text) from public;
grant execute on function private.insert_seller_opt_out(text[], text, text, boolean, text) to anon, authenticated;

revoke all on function public.submit_seller_opt_out(text[], text, text, boolean, text) from public;
grant execute on function public.submit_seller_opt_out(text[], text, text, boolean, text) to anon, authenticated;

revoke all on function public.restore_seller_opt_out(uuid) from public, anon;
grant execute on function public.restore_seller_opt_out(uuid) to authenticated;
