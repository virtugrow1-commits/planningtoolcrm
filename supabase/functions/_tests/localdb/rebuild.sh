#!/bin/bash
# Rebuild the local test database: stub → historical migrations (tolerant) → live tables from types.ts → our new migrations (strict, twice for idempotency)
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../../../.."
python3 "$HERE/gen_from_types.py" > "$HERE/10_tables_from_types.sql"
P="psql -h /tmp/pgtest -p 54329 -U postgres"
MINE="20260929090000|20260929100000|20260929110000|20260929120000"
$P -q -c "drop database if exists crm" -c "create database crm"
$P -d crm -q -f $HERE/00_supabase_stub.sql >/dev/null 2>&1
hist() { for f in $(ls supabase/migrations/*.sql | grep -Ev "$MINE"); do $P -d crm -q -f "$f" >/dev/null 2>&1; done; }
hist
$P -d crm -q -f $HERE/10_tables_from_types.sql >/dev/null 2>&1
hist; hist
$P -d crm -q -f $HERE/20_fks_from_types.sql >/dev/null 2>&1
for round in 1 2; do
  for f in $(ls supabase/migrations/*.sql | grep -E "$MINE"); do
    out=$($P -d crm -v ON_ERROR_STOP=1 -q -f "$f" 2>&1) || { echo "STRICT FAIL (round $round) $f"; echo "$out" | tail -5; exit 1; }
  done
done
echo "REBUILD_OK"
