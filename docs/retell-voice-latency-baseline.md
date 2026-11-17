# Baseline latencia voz Enviardian

Comparar `before` (logs `guide-retell-tool` previos / smoke) vs `after` (`scripts/e2e-guia-voice-latency.mjs` contra preview tras deploy del código).

No publica Retell ni despliega producción.

## Cómo medir

```bash
# Preview (código nuevo desplegado en branch)
GUIDE_E2E_ROUNDS=3 node scripts/e2e-guia-voice-latency.mjs

# Smoke corto con ms + payload_bytes
node scripts/e2e-guia-bridge-smoke.mjs
```

## Matriz

| Id | Caso | Tool |
| --- | --- | --- |
| A | Conceptual sin tool | — |
| B | Conteo / vencidas | `get_dashboard_summary` |
| C | Acciones por responsable | `get_my_actions` |
| D | OKRs | `get_okr_progress` |
| E | Dashboard breve | `get_dashboard_summary` |
| G | Seguimiento sin reconsultar de más | `get_my_actions` ×2 |
| H | Tool lenta / timeout tipado | `get_module_data`/`reports` |
| L | Sesión autenticada | `get_okr_progress` |
| N | Colgar → informe | `call_analyzed` intacto (no bloquea turno) |

## Tabla before / after (rellenar con harness)

| Caso | before p50 ms | before p95 ms | after p50 ms | after p95 ms | payload_bytes after | exactitud |
| --- | --- | --- | --- | --- | --- | --- |
| B | (baseline logs) | | | | | |
| C | | | | | | |
| D | | | | | | |
| E | | | | | | |
| G | | | | | | |
| H | | | | | | |

Criterios: spoken anclado a hechos; `voice_slim: true` en ok; timeout tipado hablable en H; N no escribe informe en el turno de tool.
