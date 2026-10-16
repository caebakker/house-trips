-- M0: profiles with role, created automatically on sign-up.

create type public.user_role as enum ('buyer', 'admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  role public.user_role not null default 'buyer',
  locale text not null default 'en',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Security definer so policies can check the caller's role without
-- recursing into profiles RLS.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

create policy "profiles: read own or admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy "profiles: update own or admin" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

-- Buyers may edit only these columns; role changes go through the
-- service role (or SQL editor), never the client.
revoke update on public.profiles from authenticated, anon;
grant update (display_name, locale) on public.profiles to authenticated;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
