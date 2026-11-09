#!/usr/bin/env bash
# Apply migrations to a throwaway local database and prove the M2 access rules.
# Also checks the portal tidy migration rewrites existing rows and does not
# change RLS policies.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
db="guidocasa_rls_test"
snap="$(mktemp -d)"
trap 'rm -rf "$snap"' EXIT

psql_db() {
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$db" "$@"
}

snapshot_access() {
  psql_db -At -c "
    select 'policy|' || format(
      '%s|%s|%s|%s|%s',
      tablename,
      policyname,
      cmd,
      coalesce(qual, ''),
      coalesce(with_check, '')
    )
    from pg_policies
    where schemaname = 'public'
    union all
    select 'table|' || format('%s|%s|%s', relname, relrowsecurity, relforcerowsecurity)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    union all
    select 'grant|' || format('%s|%s|%s', table_name, grantee, privilege_type)
    from information_schema.role_table_grants
    where table_schema = 'public'
    union all
    select 'column|' || format('%s|%s|%s|%s', table_name, column_name, grantee, privilege_type)
    from information_schema.column_privileges
    where table_schema = 'public'
    union all
    select 'routine|' || format('%s|%s|%s', routine_name, grantee, privilege_type)
    from information_schema.routine_privileges
    where routine_schema = 'public'
    order by 1;
  "
}

sudo -u postgres psql -v ON_ERROR_STOP=1 -c "drop database if exists ${db};"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "create database ${db};"
psql_db -f "$root/supabase/tests/bootstrap.sql"

shopt -s nullglob
files=("$root"/supabase/migrations/*.sql)
if [[ ${#files[@]} -eq 0 ]]; then
  echo "no migrations found" >&2
  exit 1
fi

seeded=0
for file in "${files[@]}"; do
  if [[ "$(basename "$file")" == *_listing_portal_and_fk_indexes.sql ]]; then
    snapshot_access > "$snap/before.txt"
    psql_db <<'SQL'
insert into public.listings (url, canonical_url, portal)
values
  ('https://example.com/portal-blank', 'https://example.com/portal-blank', ''),
  ('https://example.com/portal-null', 'https://example.com/portal-null', null),
  ('https://example.com/portal-idealista', 'https://example.com/portal-idealista', 'idealista'),
  ('https://example.com/portal-named', 'https://example.com/portal-named', 'agenzia example');
SQL
    psql_db -f "$file"
    snapshot_access > "$snap/after.txt"
    if ! diff -u "$snap/before.txt" "$snap/after.txt"; then
      echo "RLS policies or grants changed" >&2
      exit 1
    fi
    seeded=1
    continue
  fi
  psql_db -f "$file"
done

if [[ "$seeded" -ne 1 ]]; then
  echo "listing portal migration was not applied" >&2
  exit 1
fi

psql_db -f "$root/supabase/tests/portal_tidy.sql"
psql_db -f "$root/supabase/tests/rls_m2.sql"
psql_db -f "$root/supabase/tests/rls_m3.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "drop database if exists ${db};"
echo "RLS tests passed"
