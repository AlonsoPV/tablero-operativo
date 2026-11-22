#!/usr/bin/env bash
set -euo pipefail
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

RUN=/root/scrumban-qa-wsl-run
WIN=/mnt/c/Users/alpev/scrumban-qa-local

echo "== node =="
node -v
echo "== sync harness =="
mkdir -p "$RUN/scripts/qa" "$RUN/.qa"
# run-tree may be the same mount as WIN; only copy when distinct
if [ "$(realpath "$WIN/scripts/qa/run-r3-functional.mjs")" != "$(realpath "$RUN/scripts/qa/run-r3-functional.mjs" 2>/dev/null || echo missing)" ]; then
  cp -f "$WIN/scripts/qa/run-r3-functional.mjs" "$RUN/scripts/qa/run-r3-functional.mjs"
  cp -f "$WIN/scripts/qa/qaGuard.mjs" "$RUN/scripts/qa/qaGuard.mjs"
fi
test -f "$RUN/.env.qa.local"
test -f "$RUN/scripts/qa/run-r3-functional.mjs"

echo "== QA A health =="
AUTH_CODE=$(curl -s -m 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:54421/auth/v1/health || echo FAIL)
echo "auth=$AUTH_CODE"
# load anon for rest probe without printing secrets
set -a
# shellcheck disable=SC1091
. "$RUN/.env.qa.local"
set +a
REST_CODE=$(curl -s -m 5 -o /dev/null -w "%{http_code}" \
  -H "apikey: ${QA_A_ANON_KEY}" \
  -H "Authorization: Bearer ${QA_A_ANON_KEY}" \
  "http://127.0.0.1:54421/rest/v1/" || echo FAIL)
echo "rest=$REST_CODE"

echo "== containers =="
docker ps --filter name=scrumban-qa-a --format '{{.Names}} {{.Status}}'

echo "== migration =="
MIG=$(docker exec supabase_db_scrumban-qa-a psql -U postgres -tAc \
  "select count(*) from supabase_migrations.schema_migrations where version='20261121150601';")
echo "schema_migrations_20261121150601=$MIG"

echo "== rls =="
docker exec supabase_db_scrumban-qa-a psql -U postgres -tAc \
  "select relname||' rls='||relrowsecurity::text from pg_class where relname in ('agent_memory','agent_documents') order by 1;"

echo "== baseline counts =="
docker exec supabase_db_scrumban-qa-a psql -U postgres -tAc \
  "select 'agent_memory='||count(*) from public.agent_memory;
   select 'agent_documents='||count(*) from public.agent_documents;
   select 'notification_email_logs='||count(*) from public.notification_email_logs;
   select 'whatsapp_messages='||count(*) from public.whatsapp_messages;
   select 'assistant_pending_ops='||count(*) from public.assistant_pending_ops;
   select 'a2='||coalesce(estado,'missing') from public.acciones_diarias where id='00000000-0000-4000-a000-0000000000a2';"

echo "== env guards (no secrets) =="
echo "QA_LOCAL=${QA_LOCAL:-}"
echo "QA_A_SUPABASE_URL=${QA_A_SUPABASE_URL:-}"
echo "QA_A_LOCAL_REF=${QA_A_LOCAL_REF:-}"
echo "R2_EXECUTION_MODE=${R2_EXECUTION_MODE:-}"
echo "AGENT_MEMORY_R3=${AGENT_MEMORY_R3:-(unset)}"
echo "AGENT_ORCHESTRATOR_R1=${AGENT_ORCHESTRATOR_R1:-}"

AUTH_CODE="$AUTH_CODE" REST_CODE="$REST_CODE" MIG="$MIG" node <<NODE
import { writeFileSync } from 'node:fs'
const out = {
  ranAt: new Date().toISOString(),
  auth: process.env.AUTH_CODE,
  rest: process.env.REST_CODE,
  migrationCount: process.env.MIG,
  qa: {
    local: process.env.QA_LOCAL,
    url: process.env.QA_A_SUPABASE_URL,
    ref: process.env.QA_A_LOCAL_REF,
  },
  flagFile: process.env.AGENT_MEMORY_R3 ?? '(unset)',
  r2Mode: process.env.R2_EXECUTION_MODE ?? null,
  r1: process.env.AGENT_ORCHESTRATOR_R1 ?? null,
  hop: 'wsl-loopback-only',
  harness: 'scripts/qa/run-r3-functional.mjs',
  marker: 'r3b-func-',
}
writeFileSync('/root/scrumban-qa-wsl-run/.qa/r3-functional-preflight.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
NODE

test "$AUTH_CODE" = "200"
test "$MIG" = "1"
test "${QA_A_LOCAL_REF}" = "qalocala000000000000"
test "${QA_A_SUPABASE_URL}" = "http://127.0.0.1:54421"
test "${AGENT_MEMORY_R3:-}" = ""
echo "PREFLIGHT_OK"
