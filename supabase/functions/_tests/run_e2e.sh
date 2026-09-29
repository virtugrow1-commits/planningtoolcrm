#!/bin/bash
# End-to-end tests of the GHL edge functions against a local Postgres + PostgREST
# and a mock GoHighLevel. Requirements: a Postgres with the schema loaded (see
# README in this folder), the postgrest binary, deno.
set -e
cd "$(dirname "$0")/.."
DENO=${DENO:-deno}
PG_URI=${PG_URI:-postgres://authenticator@127.0.0.1:54329/crm}
POSTGREST_BIN=${POSTGREST_BIN:-postgrest}
LOGDIR=${LOGDIR:-/tmp/e2e-logs}; mkdir -p "$LOGDIR"
SECRET='e2e-test-secret-that-is-at-least-32-chars-long'
ANON=$($DENO run -A _tests/jwt.ts anon)
SERVICE=$($DENO run -A _tests/jwt.ts service_role)

pids=()
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT

PGRST_DB_URI="$PG_URI" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$SECRET" PGRST_SERVER_PORT=3000 PGRST_DB_POOL=10 \
  "$POSTGREST_BIN" > "$LOGDIR/postgrest.log" 2>&1 & pids+=($!)

declare -A PORTS=( [ghl-sync]=9101 [ghl-auto-sync]=9102 [ghl-webhook]=9103 [crm-automations]=9104 [stage-offerte]=9105 )
FP='{'; for k in "${!PORTS[@]}"; do FP+="\"$k\":${PORTS[$k]},"; done; FP="${FP%,}}"

MOCK_PORT=9000 POSTGREST_URL=http://127.0.0.1:3000 FUNCTION_PORTS="$FP" $DENO run -A _tests/mock_server.ts > "$LOGDIR/mock.log" 2>&1 & pids+=($!)

export SUPABASE_URL=http://127.0.0.1:9000 SUPABASE_ANON_KEY="$ANON" SUPABASE_SERVICE_ROLE_KEY="$SERVICE" \
  GHL_API_KEY=test-ghl-key GHL_LOCATION_ID=loc_test GHL_API_BASE_OVERRIDE=http://127.0.0.1:9000/ghl GHL_WEBHOOK_SECRET=hook-secret
for k in "${!PORTS[@]}"; do
  $DENO run -A _tests/serve_function.ts "$k" "${PORTS[$k]}" > "$LOGDIR/$k.log" 2>&1 & pids+=($!)
done

for i in $(seq 1 60); do
  ok=1; for port in 3000 9000 9101 9102 9103 9104 9105; do (echo > /dev/tcp/127.0.0.1/$port) 2>/dev/null || ok=0; done
  [ $ok = 1 ] && break; sleep 1
done
[ $ok = 1 ] || { echo "services did not start"; tail -5 "$LOGDIR"/*.log; exit 1; }

E2E_ANON="$ANON" E2E_SERVICE="$SERVICE" $DENO test -A _tests/e2e.test.ts "$@"
