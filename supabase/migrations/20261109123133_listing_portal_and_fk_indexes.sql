-- Indexes for the M2 foreign keys that have no covering index, and one
-- portal value for websites that are not Immobiliare, Idealista or Casa.
--
-- listings.portal allowed null, and the app sent '' for other websites.
-- Both become 'other'. A name that is already stored is left as it is.
-- This does not change policies or grants.

update public.listings
set portal = 'other'
where portal is null or btrim(portal) = '';

alter table public.listings
  alter column portal set default 'other';

alter table public.listings
  alter column portal set not null;

alter table public.listings
  add constraint listings_portal_not_blank
  check (char_length(btrim(portal)) > 0);

comment on column public.listings.portal is
  'Site the listing came from. Known portals are immobiliare, idealista and casa. Every other website is other. Never null or blank.';

create or replace function public.ensure_listing(p_url text, p_canonical_url text, p_portal text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_portal text;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  -- '' and null are the old way of saying "some other website".
  v_portal := coalesce(nullif(btrim(p_portal), ''), 'other');

  insert into public.listings (url, canonical_url, portal, created_by)
  values (p_url, p_canonical_url, v_portal, (select auth.uid()))
  on conflict (canonical_url) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.listings where canonical_url = p_canonical_url;
  end if;

  return v_id;
end;
$$;

-- Primary keys already cover property_locations.property_id and
-- listing_properties.listing_id. These seven were the uncovered ones.
create index properties_verified_by_idx
  on public.properties (verified_by);

create index verification_requests_listing_id_idx
  on public.verification_requests (listing_id);

create index verification_requests_property_id_idx
  on public.verification_requests (property_id);

create index credit_ledger_trip_listing_id_idx
  on public.credit_ledger (trip_listing_id);

create index credit_ledger_created_by_idx
  on public.credit_ledger (created_by);

create index notification_outbox_user_id_idx
  on public.notification_outbox (user_id);

create index notification_outbox_verification_request_id_idx
  on public.notification_outbox (verification_request_id);
