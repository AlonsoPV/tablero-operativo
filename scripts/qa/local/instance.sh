#!/usr/bin/env bash
# Opera una instancia QA local dentro de WSL Ubuntu (Docker Engine + Supabase CLI).
# Uso: bash instance.sh <dir-instancia> start|reset|stop|status|env
set -euo pipefail
DIR="${1:?dir de la instancia}"
CMD="${2:?start|reset|stop|status|env}"
cd "$DIR"
grep -q '^project_id = "scrumban-qa-' supabase/config.toml || { echo "QA GUARD: $DIR no es una instancia QA local" >&2; exit 2; }
EXCLUDE="realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor"
case "$CMD" in
  start)
    if [ ! -s supabase/signing_keys.json ]; then
      # Fuera del proyecto: dentro, la CLI intenta leer el signing_keys_path que aún no existe.
      KEY=$(cd / && supabase gen signing-key --algorithm ES256 2>/dev/null)
      printf '[%s]\n' "$KEY" > supabase/signing_keys.json
    fi
    supabase start -x "$EXCLUDE"
    ;;
  reset) supabase db reset --local ;;
  stop) supabase stop --no-backup ;;
  status) supabase status ;;
  env) supabase status -o env ;;
  *) echo "comando desconocido: $CMD" >&2; exit 2 ;;
esac
