#!/usr/bin/env bash
# Fase 3B · preflight + harness funcional R3 en QA A (WSL loopback).
# AGENT_MEMORY_R3=1 solo en el proceso del harness; .env.qa.local no se modifica.
set -eu
export NVM_DIR="$HOME/.nvm"
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"
nvm use 24.22.3 >/dev/null

SRC=/mnt/c/Users/alpev/scrumban-qa-local
RUN=/root/scrumban-qa-wsl-run
SESS="$SRC/.tmp/gate0-session.env"
ENVF="$SRC/.env.qa.local"
OUT_DIR="$SRC/.qa"
PREFLIGHT="$OUT_DIR/r3-functional-preflight.json"

mkdir -p "$OUT_DIR"
cd "$RUN"

# Session secrets (never printed)
set -a
# shellcheck source=/dev/null
. "$SESS"
# shellcheck source=/dev/null
. "$ENVF"
set +a

export QA_A_SUPABASE_URL="${QA_A_SUPABASE_URL:-http://127.0.0.1:54421}"
export QA_A_LOCAL_REF="${QA_A_LOCAL_REF:-qalocala000000000000}"
export QA_LOCAL="${QA_LOCAL:-1}"
export QA_LOCAL_PORTS="${QA_LOCAL_PORTS:-54421,54431}"
export R2_QA_PROJECT_REFS="${R2_QA_PROJECT_REFS:-qalocala000000000000,qalocalb000000000000}"
export R2_EXECUTION_MODE="${R2_EXECUTION_MODE:-simulated}"
# Flag must stay unset in file / parent; harness sets process-only.
unset AGENT_MEMORY_R3 || true

log() { printf '%s\n' "$*"; }

log "== preflight =="
AUTH_CODE=$(curl -s -m 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:54421/auth/v1/health || echo FAIL)
REST_CODE=$(curl -s -m 5 -o /dev/null -w "%{http_code}" \
  -H "apikey: ${QA_A_ANON_KEY}" \
  -H "Authorization: Bearer ${QA_A_ANON_KEY}" \
  "http://127.0.0.1:54421/rest/v1/" || echo FAIL)
MIG=$(docker exec supabase_db_scrumban-qa-a psql -U postgres -tAc \
  "select count(*) from supabase_migrations.schema_migrations where version='20261121150601';")
MEM_N=$(docker exec supabase_db_scrumban-qa-a psql -U postgres -tAc "select count(*) from public.agent_memory;")
DOC_N=$(docker exec supabase_db_scrumban-qa-a psql -U postgres -tAc "select count(*) from public.agent_documents;")
EMAIL_N=$(docker exec supabase_db_scrumban-qa-a psql -U postgres -tAc "select count(*) from public.notification_email_logs;")
WA_N=$(docker exec supabase_db_scrumban-qa-a psql -U postgres -tAc "select count(*) from public.whatsapp_messages;")
A2=$(docker exec supabase_db_scrumban-qa-a psql -U postgres -tAc \
  "select coalesce(estado::text,'missing') from public.acciones_diarias where id='00000000-0000-4000-a000-0000000000a2';")
FLAG_FILE=$(grep -E '^AGENT_MEMORY_R3=' "$ENVF" || true)
R2_FILE=$(grep -E '^R2_EXECUTION_MODE=' "$ENVF" || true)

log "auth=$AUTH_CODE rest=$REST_CODE mig=$MIG mem=$MEM_N docs=$DOC_N email=$EMAIL_N wa=$WA_N a2=$A2"
log "flag_file=${FLAG_FILE:-(unset)} r2_file=$R2_FILE hop=wsl-loopback"

# Write preflight without secrets
AUTH_CODE="$AUTH_CODE" REST_CODE="$REST_CODE" MIG="$MIG" MEM_N="$MEM_N" DOC_N="$DOC_N" \
EMAIL_N="$EMAIL_N" WA_N="$WA_N" A2="$A2" FLAG_FILE="$FLAG_FILE" R2_FILE="$R2_FILE" \
node <<'NODE'
import { writeFileSync } from 'node:fs'
const out = {
  ranAt: new Date().toISOString(),
  auth: process.env.AUTH_CODE,
  rest: process.env.REST_CODE,
  migrationCount: process.env.MIG,
  baseline: {
    agent_memory: Number(process.env.MEM_N),
    agent_documents: Number(process.env.DOC_N),
    notification_email_logs: Number(process.env.EMAIL_N),
    whatsapp_messages: Number(process.env.WA_N),
    a2: process.env.A2,
  },
  qa: {
    local: process.env.QA_LOCAL,
    url: process.env.QA_A_SUPABASE_URL,
    ref: process.env.QA_A_LOCAL_REF,
  },
  flagFile: process.env.FLAG_FILE || '(unset)',
  r2File: process.env.R2_FILE || null,
  hop: 'wsl-loopback-only',
  harness: 'scripts/qa/run-r3-functional.mjs',
  marker: 'r3b-func-',
  schemaChangesRequired: false,
}
writeFileSync('/mnt/c/Users/alpev/scrumban-qa-local/.qa/r3-functional-preflight.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
NODE

test "$AUTH_CODE" = "200"
test "$REST_CODE" = "200" -o "$REST_CODE" = "404"
test "$MIG" = "1"
test "$QA_A_LOCAL_REF" = "qalocala000000000000"
test "$QA_A_SUPABASE_URL" = "http://127.0.0.1:54421"
test -z "${AGENT_MEMORY_R3:-}"
test -z "$FLAG_FILE"
grep -qE '^R2_EXECUTION_MODE=simulated$' "$ENVF"
log "PREFLIGHT_OK"

log "== harness =="
# Process-only flag; harness also sets/clears it. Parent stays unset.
set +e
AGENT_MEMORY_R3=1 node scripts/qa/run-r3-functional.mjs
RC=$?
set -e

# Ensure parent never leaves flag on
unset AGENT_MEMORY_R3 || true

log "== post-verify =="
LEFT_MEM=$(docker exec supabase_db_scrumban-qa-a psql -U postgres -tAc \
  "select count(*) from public.agent_memory where content_hash like 'r3b-func%';")
LEFT_DOC=$(docker exec supabase_db_scrumban-qa-a psql -U postgres -tAc \
  "select count(*) from public.agent_documents where logical_id like 'r3b-func%';")
A2_AFTER=$(docker exec supabase_db_scrumban-qa-a psql -U postgres -tAc \
  "select coalesce(estado::text,'missing') from public.acciones_diarias where id='00000000-0000-4000-a000-0000000000a2';")
EMAIL_AFTER=$(docker exec supabase_db_scrumban-qa-a psql -U postgres -tAc "select count(*) from public.notification_email_logs;")
WA_AFTER=$(docker exec supabase_db_scrumban-qa-a psql -U postgres -tAc "select count(*) from public.whatsapp_messages;")
FLAG_AFTER=$(grep -E '^AGENT_MEMORY_R3=' "$ENVF" || true)
R2_AFTER=$(grep -E '^R2_EXECUTION_MODE=' "$ENVF" || true)

log "left_mem=$LEFT_MEM left_docs=$LEFT_DOC a2=$A2_AFTER email=$EMAIL_AFTER wa=$WA_AFTER"
log "flag_file_after=${FLAG_AFTER:-(unset)} r2_after=$R2_AFTER harness_rc=$RC"

LEFT_MEM="$LEFT_MEM" LEFT_DOC="$LEFT_DOC" A2_AFTER="$A2_AFTER" EMAIL_AFTER="$EMAIL_AFTER" \
WA_AFTER="$WA_AFTER" FLAG_AFTER="$FLAG_AFTER" R2_AFTER="$R2_AFTER" RC="$RC" \
node <<'NODE'
import { writeFileSync, readdirSync } from 'node:fs'
const files = readdirSync('/mnt/c/Users/alpev/scrumban-qa-local/.qa')
  .filter((f) => f.startsWith('r3-functional-') && f.endsWith('.json') && !f.includes('preflight') && !f.includes('post'))
  .sort()
const latest = files[files.length - 1] || null
const out = {
  ranAt: new Date().toISOString(),
  harnessRc: Number(process.env.RC),
  leftoverSynthetic: {
    agent_memory: Number(process.env.LEFT_MEM),
    agent_documents: Number(process.env.LEFT_DOC),
  },
  a2: process.env.A2_AFTER,
  providers: {
    notification_email_logs: Number(process.env.EMAIL_AFTER),
    whatsapp_messages: Number(process.env.WA_AFTER),
  },
  flagFile: process.env.FLAG_AFTER || '(unset)',
  r2File: process.env.R2_AFTER || null,
  latestEvidence: latest,
}
writeFileSync('/mnt/c/Users/alpev/scrumban-qa-local/.qa/r3-functional-post.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
NODE

test "$LEFT_MEM" = "0"
test "$LEFT_DOC" = "0"
test "$A2_AFTER" = "Pendiente"
test "$EMAIL_AFTER" = "0"
test "$WA_AFTER" = "0"
test -z "$FLAG_AFTER"
grep -qE '^R2_EXECUTION_MODE=simulated$' "$ENVF"

exit "$RC"
