-- The tidy migration rewrites blank portals, rejects new blanks, and
-- leaves access rules alone. RLS behaviour is checked in rls_m2.sql.
\set ON_ERROR_STOP on

do $$
declare
  v_blank text;
  v_null text;
  v_named text;
  v_kept text;
  v_not_null boolean;
  v_default text;
  uncovered int;
begin
  select portal into v_blank
  from public.listings
  where canonical_url = 'https://example.com/portal-blank';
  select portal into v_null
  from public.listings
  where canonical_url = 'https://example.com/portal-null';
  select portal into v_named
  from public.listings
  where canonical_url = 'https://example.com/portal-idealista';
  select portal into v_kept
  from public.listings
  where canonical_url = 'https://example.com/portal-named';

  if v_blank is distinct from 'other' or v_null is distinct from 'other' then
    raise exception 'blank portals were not rewritten (blank=%, null=%)', v_blank, v_null;
  end if;
  if v_named is distinct from 'idealista' or v_kept is distinct from 'agenzia example' then
    raise exception 'an existing portal name was changed (named=%, kept=%)', v_named, v_kept;
  end if;

  select a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
  into v_not_null, v_default
  from pg_attribute a
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.listings'::regclass
    and a.attname = 'portal';

  if v_not_null is not true or v_default is distinct from '''other''::text' then
    raise exception 'portal default is % not null %', v_default, v_not_null;
  end if;

  select count(*) into uncovered
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where con.contype = 'f'
    and ns.nspname = 'public'
    and c.relname in (
      'properties',
      'property_locations',
      'listing_properties',
      'verification_requests',
      'credit_ledger',
      'notification_outbox'
    )
    and not exists (
      select 1
      from pg_index i
      where i.indrelid = con.conrelid
        and i.indisvalid
        and (i.indkey::int2[])[0:cardinality(con.conkey) - 1] @> con.conkey
    );

  if uncovered <> 0 then
    raise exception '% M2 foreign keys still have no covering index', uncovered;
  end if;

  if has_table_privilege('authenticated', 'public.property_locations', 'select')
    or has_table_privilege('anon', 'public.property_locations', 'select')
    or has_table_privilege('authenticated', 'public.properties', 'select')
    or has_table_privilege('anon', 'public.notification_outbox', 'select') then
    raise exception 'buyer privileges on private tables changed';
  end if;
end $$;

do $$
begin
  insert into public.listings (url, canonical_url, portal)
  values ('https://example.com/reject-null', 'https://example.com/reject-null', null);
  raise exception 'null portal was accepted';
exception
  when not_null_violation then
    null;
end $$;

do $$
begin
  insert into public.listings (url, canonical_url, portal)
  values ('https://example.com/reject-blank', 'https://example.com/reject-blank', '   ');
  raise exception 'blank portal was accepted';
exception
  when check_violation then
    null;
end $$;

insert into public.listings (url, canonical_url)
values ('https://example.com/default-portal', 'https://example.com/default-portal');

do $$
begin
  if (select portal from public.listings where canonical_url = 'https://example.com/default-portal')
    is distinct from 'other' then
    raise exception 'portal default is not other';
  end if;
end $$;

insert into auth.users (email) values ('portal-check@example.com');
select set_config(
  'test.portal_user',
  (select id::text from auth.users where email = 'portal-check@example.com'),
  false
);

set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.portal_user'), false);

select set_config(
  'test.fn_blank',
  public.ensure_listing(
    'https://example.com/fn-blank',
    'https://example.com/fn-blank',
    ''
  )::text,
  false
);
select set_config(
  'test.fn_null',
  public.ensure_listing(
    'https://example.com/fn-null',
    'https://example.com/fn-null',
    null
  )::text,
  false
);
select set_config(
  'test.fn_space',
  public.ensure_listing(
    'https://example.com/fn-space',
    'https://example.com/fn-space',
    '   '
  )::text,
  false
);
select set_config(
  'test.fn_casa',
  public.ensure_listing(
    'https://example.com/fn-casa',
    'https://example.com/fn-casa',
    'casa'
  )::text,
  false
);
select set_config(
  'test.fn_again',
  public.ensure_listing(
    'https://example.com/fn-casa',
    'https://example.com/fn-casa',
    ''
  )::text,
  false
);

reset role;

do $$
begin
  if (select portal from public.listings where id = current_setting('test.fn_blank')::uuid) <> 'other'
    or (select portal from public.listings where id = current_setting('test.fn_null')::uuid) <> 'other'
    or (select portal from public.listings where id = current_setting('test.fn_space')::uuid) <> 'other'
    or (select portal from public.listings where id = current_setting('test.fn_casa')::uuid) <> 'casa' then
    raise exception 'ensure_listing stored an unexpected portal';
  end if;
  if current_setting('test.fn_again') is distinct from current_setting('test.fn_casa') then
    raise exception 'ensure_listing did not keep the existing listing';
  end if;
  if (select portal from public.listings where id = current_setting('test.fn_casa')::uuid) <> 'casa' then
    raise exception 'a repeat call rewrote the stored portal';
  end if;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', '', false);

do $$
begin
  perform public.ensure_listing(
    'https://example.com/fn-anon',
    'https://example.com/fn-anon',
    'other'
  );
  raise exception 'unauthenticated ensure_listing succeeded';
exception
  when others then
    if sqlerrm <> 'not authenticated' then
      raise;
    end if;
end $$;

reset role;
