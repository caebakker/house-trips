create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  start_date date not null,
  end_date date not null,
  max_drive_minutes_per_day integer not null default 240
    check (max_drive_minutes_per_day between 30 and 720),
  default_dwell_minutes integer not null default 10
    check (default_dwell_minutes between 1 and 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (end_date - start_date <= 60)
);

create index trips_owner_id_idx on public.trips (owner_id);

create trigger trips_set_updated_at
  before update on public.trips
  for each row execute function public.set_updated_at();

create type public.trip_member_role as enum ('owner', 'partner');

create table public.trip_members (
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.trip_member_role not null,
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create index trip_members_user_id_idx on public.trip_members (user_id);

create function public.add_trip_owner_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.trip_members (trip_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger trips_add_owner_member
  after insert on public.trips
  for each row execute function public.add_trip_owner_member();

create function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id and user_id = (select auth.uid())
  );
$$;

create function public.is_trip_owner(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id and user_id = (select auth.uid()) and role = 'owner'
  );
$$;

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  url text not null check (url ~ '^https?://'),
  canonical_url text not null unique check (canonical_url ~ '^https?://'),
  portal text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create function public.ensure_listing(p_url text, p_canonical_url text, p_portal text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  insert into public.listings (url, canonical_url, portal, created_by)
  values (p_url, p_canonical_url, p_portal, (select auth.uid()))
  on conflict (canonical_url) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.listings where canonical_url = p_canonical_url;
  end if;

  return v_id;
end;
$$;

create type public.trip_listing_status as enum
  ('approximate', 'address_given', 'check_requested', 'verified', 'not_found');

create table public.trip_listings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete restrict,
  status public.trip_listing_status not null default 'approximate',
  priority smallint not null default 2 check (priority between 1 and 3),
  dwell_minutes integer check (dwell_minutes between 1 and 240),
  buyer_notes text check (char_length(buyer_notes) <= 2000),
  rating smallint check (rating between 1 and 5),
  comune_istat text not null check (comune_istat ~ '^[0-9]{6}$'),
  comune_name text not null,
  approx_lat double precision not null check (approx_lat between 35 and 48),
  approx_lng double precision not null check (approx_lng between 6 and 19),
  approx_radius_m integer not null check (approx_radius_m between 100 and 50000),
  given_address text check (char_length(given_address) <= 300),
  given_lat double precision check (given_lat between 35 and 48),
  given_lng double precision check (given_lng between 6 and 19),
  agent_name text check (char_length(agent_name) <= 200),
  agent_email text check (char_length(agent_email) <= 320),
  agent_phone text check (char_length(agent_phone) <= 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, listing_id),
  check ((given_lat is null) = (given_lng is null))
);

create index trip_listings_listing_id_idx on public.trip_listings (listing_id);

create trigger trip_listings_set_updated_at
  before update on public.trip_listings
  for each row execute function public.set_updated_at();

create function public.derive_trip_listing_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or old.status in ('approximate', 'address_given') then
    new.status := case when new.given_lat is not null
                       then 'address_given'::public.trip_listing_status
                       else 'approximate'::public.trip_listing_status end;
  end if;
  return new;
end;
$$;

create trigger trip_listings_derive_status
  before insert or update on public.trip_listings
  for each row execute function public.derive_trip_listing_status();

alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.listings enable row level security;
alter table public.trip_listings enable row level security;

create policy "trips: members read" on public.trips
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (select public.is_trip_member(id))
    or (select public.is_admin())
  );

create policy "trips: create own" on public.trips
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "trips: owner updates" on public.trips
  for update to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()))
  with check (owner_id = (select auth.uid()) or (select public.is_admin()));

create policy "trips: owner deletes" on public.trips
  for delete to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()));

create policy "trip_members: members read" on public.trip_members
  for select to authenticated
  using ((select public.is_trip_member(trip_id)) or (select public.is_admin()));

create policy "listings: read via own trips" on public.listings
  for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.trip_listings tl
      where tl.listing_id = listings.id and public.is_trip_member(tl.trip_id)
    )
  );

create policy "trip_listings: members read" on public.trip_listings
  for select to authenticated
  using ((select public.is_trip_member(trip_id)) or (select public.is_admin()));

create policy "trip_listings: members add" on public.trip_listings
  for insert to authenticated
  with check ((select public.is_trip_member(trip_id)) or (select public.is_admin()));

create policy "trip_listings: members edit" on public.trip_listings
  for update to authenticated
  using ((select public.is_trip_member(trip_id)) or (select public.is_admin()))
  with check ((select public.is_trip_member(trip_id)) or (select public.is_admin()));

create policy "trip_listings: members remove" on public.trip_listings
  for delete to authenticated
  using ((select public.is_trip_member(trip_id)) or (select public.is_admin()));

revoke all on public.listings from anon, authenticated;
grant select on public.listings to authenticated;

revoke all on public.trip_members from anon, authenticated;
grant select on public.trip_members to authenticated;

revoke all on public.trips from anon;
revoke update on public.trips from authenticated;
grant update (name, start_date, end_date, max_drive_minutes_per_day, default_dwell_minutes)
  on public.trips to authenticated;

revoke all on public.trip_listings from anon;
revoke insert, update on public.trip_listings from authenticated;
grant insert (trip_id, listing_id, priority, dwell_minutes, buyer_notes, rating,
              comune_istat, comune_name, approx_lat, approx_lng, approx_radius_m,
              given_address, given_lat, given_lng, agent_name, agent_email, agent_phone)
  on public.trip_listings to authenticated;
grant update (priority, dwell_minutes, buyer_notes, rating,
              comune_istat, comune_name, approx_lat, approx_lng, approx_radius_m,
              given_address, given_lat, given_lng, agent_name, agent_email, agent_phone)
  on public.trip_listings to authenticated;

revoke execute on function public.add_trip_owner_member() from public, anon, authenticated;
revoke execute on function public.is_trip_member(uuid) from public, anon;
revoke execute on function public.is_trip_owner(uuid) from public, anon;
revoke execute on function public.ensure_listing(text, text, text) from public, anon;
grant execute on function public.is_trip_member(uuid) to authenticated;
grant execute on function public.is_trip_owner(uuid) to authenticated;
grant execute on function public.ensure_listing(text, text, text) to authenticated;
