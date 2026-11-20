# Cierre R0 · auditoría de solo lectura en PROD

Congelación R1 de referencia: `640fa52` en `qa/supabase-local`. Este procedimiento **no** forma parte de R1. No se ha ejecutado contra PROD desde el agente. El operador revisa el SQL y lo pega en el SQL Editor de **Scrumban PROD** (`xhpasmjzuwifmjhrsumb`).

SQL a revisar: [`supabase/scripts/audit_r0_prod_readonly.sql`](../../supabase/scripts/audit_r0_prod_readonly.sql) (`BEGIN READ ONLY`).

ACL/políticas (opcional, no necesario para 401/P0001/RD-06): [`audit_agent_r0_readonly.sql`](../../supabase/scripts/audit_agent_r0_readonly.sql).

## Qué no hacer

- No `INSERT`/`UPDATE`/`DELETE`, no `db push`, no `migration repair`.
- No POST a `whatsapp-followup-dispatcher` (ni anónimo ni con secreto).
- No reencolar ni marcar `done`/`pending` los jobs P0001.
- No exportar `cron.command`, Vault, tokens, `payload`, `content` HTTP, teléfonos, correos ni cuerpos de mensaje.
- No apuntar Preview R1 a este proyecto.

## Dónde y cómo

1. Dashboard Supabase → proyecto **Scrumban PROD** → SQL Editor.
2. Pegar el archivo revisado entero. Una sola transacción de lectura.
3. Guardar cada result set (CSV o captura de tabla) sin las columnas prohibidas.
4. Logs Edge (solo lectura, Dashboard → Edge Functions → Logs), sin reenviar:

| Incidente | Filtro | Evidencia mínima |
| --- | --- | --- |
| 401 dispatcher | Función `whatsapp-followup-dispatcher`, POST, status 401, desde 2026-11-17 | Timestamp, execution/request ID, revisión de la función, `sb-error-code` si existe |
| Job `2e1aa063-aad8-42cc-8b74-b79cb3147afd` | `whatsapp-webhook`, 2026-11-18 16:17–16:21 UTC | MESSAGE/STATEMENT PostgreSQL si el log lo conserva |
| Job `b5188f3f-020e-4f6e-b21f-df3fd053993e` | `whatsapp-webhook`, 2026-11-18 06:00–06:04 UTC | Igual |

Si la retención expiró, anotarlo: eso habilita **excepción de atribución**, no una causa inventada.

## Cómo leer los bloques

### A · HTTP 401 del dispatcher

Causa probable (código, no hecho de PROD hasta correlacionar): el Gateway exige `Authorization`/`apikey` aunque `verify_jwt=false`; el cron de `20261103121000` mandaba solo `x-dispatcher-secret`.

| Resultado | Lectura |
| --- | --- |
| `has_authorization_header` y `has_apikey_header` = true, vault en minúsculas, sin `PASTE_ANON_KEY` | Cron actual parece el de `20261104140000`. El 401 histórico puede ser pre-fix |
| Falta Authorization/apikey, o `PASTE_ANON_KEY`, o vault en MAYÚSCULAS | Causa vigente; no cambiar el cron en esta auditoría |
| Filas A3 con `has_gateway_jwt_message` | Capa Gateway |
| Filas A3 con `has_function_unauthorized_body` o `declared_auth_layer=edge_function` | Capa Edge |
| A3 vacío | Retención de `net._http_response` agotada |

La sonda GET 405 (`eb855033-fa3b-4917-bcce-c336650cd777`) no atribuye el POST.

### B · Dos P0001

IDs fijos. Última lectura (2026-11-18): `review` / `provider_request` / `database_P0001` / `attempts=1` / `effect_started=true`; aviso de fallo entregado; cero recibos de mutación. **No es un falso éxito.**

| Si hoy… | Cierre propuesto (no ejecutar aquí) |
| --- | --- |
| Sigue `review` + `database_P0001` + sin recibos | Excepción de no-replay, o CAS `failed` + `reconciled_no_replay` con autorización productiva aparte. Nunca `done` ni `pending` |
| Hay recibo de mutación o la acción cerrada | Detener. No es el escenario documentado |
| El job ya no existe | Documentar; no reconstruir |

### C · RD-06

| Esperable | Lectura |
| --- | --- |
| Pocas filas vs 228 archivos locales | Desfase pre-noviembre; **no** `db push` |
| `last_version` de noviembre y `has_repair_17181000` | Repair del 19-nov visible (como en DEV) |
| `has_repo_17180000` ≠ `has_repair_17181000` | El CLI aplicaría `20261117180000` como pendiente |
| `has_r2_20120000` / `has_agent_execution_gate` / `has_claimed_at` = true | R2 llegó a PROD; fuera de este procedimiento, detener y reportar |

## Autorizaciones R0 (ninguna ejecutada)

- [ ] Revisar `audit_r0_prod_readonly.sql` y autorizar pegarlo en PROD.
- [ ] Autorizar lectura de logs Edge (sin POST).
- [ ] Tras el export: excepción de atribución del 401 **o** causa correlacionada. No implica cambiar cron.
- [ ] Tras el export: no-replay de los dos P0001 **o** transacción CAS aparte. No en esta sesión.
- [ ] Inventario de `db push`: prohibido hasta listar el desfase pre-noviembre. No `migration repair` aquí.

## GO / NO-GO R0

| Criterio | GO | NO-GO |
| --- | --- | --- |
| 401 | Capa atribuida (Gateway vs Edge vs cron) **o** retención expirada + excepción firmada | Sigue sin export ni excepción |
| P0001 | Estado igual al 18-nov + no-replay aprobado, **o** conciliación CAS autorizada aparte | Replay, `done` artificial, o estado distinto sin análisis |
| RD-06 | Historial leído; `20261120120000` ausente; compromiso de no usar CLI hasta inventario | `db push` o repair no autorizado |
| Liberación R0 | Los tres anteriores en GO **y** matriz Dirección remota | Cualquiera abierto |

Hasta el export, R0 permanece **NO-GO**.
