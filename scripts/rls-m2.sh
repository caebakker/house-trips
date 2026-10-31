#!/usr/bin/env bash
# Apply migrations to a throwaway local database and prove the M2 access rules.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
db="guidocasa_rls_test"

sudo -u postgres psql -v ON_ERROR_STOP=1 -c "drop database if exists ${db};"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "create database ${db};"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$db" -f "$root/supabase/tests/bootstrap.sql"

shopt -s nullglob
files=("$root"/supabase/migrations/*.sql)
if [[ ${#files[@]} -eq 0 ]]; then
  echo "no migrations found" >&2
  exit 1
fi
for file in "${files[@]}"; do
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$db" -f "$file"
done

sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$db" -f "$root/supabase/tests/rls_m2.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "drop database if exists ${db};"
echo "RLS tests passed"
