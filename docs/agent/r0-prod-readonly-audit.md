# Cierre R0 · auditoría de solo lectura en PROD

Congelación R1 de referencia: `640fa52` en `qa/supabase-local`. Este procedimiento **no** forma parte de R1. No se ha ejecutado contra PROD desde el agente. El operador revisa el SQL y lo pega en el SQL Editor de **Scrumban PROD** (`xhpasmjzuwifmjhrsumb`).

SQL a revisar: [`supabase/scripts/audit_r0_prod_readonly.sql`](../../supabase/scripts/audit_r0_prod_readonly.sql) (`BEGIN READ ONLY`).

401 activo: [`r0-401-rca.md`](r0-401-rca.md). Correlación extra (solo lectura): [`audit_r0_401_correlate_readonly.sql`](../../supabase/scripts/audit_r0_401_correlate_readonly.sql). No aplicar el cron de Vault sin autorización.

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

### Checklist en SQL Editor

1. Proyecto `xhpasmjzuwifmjhrsumb`, no DEV.
2. Rol `postgres` (no `anon`).
3. Pegar `audit_r0_prod_readonly.sql` completo (`BEGIN READ ONLY` … `COMMIT`). Si el editor rechaza el lote, cada `SELECT` por separado, en orden 0 → C3.
4. Confirmar bloque 0: todos los `has_*` de cron, net, jobs, recibos y `schema_migrations` en true. Si net es false, A3 no aplica.
5. Exportar resultados (CSV). No copiar `cron.command` ni abrir `content`.
6. Si A3 o B1 fallan por permiso/objeto, anotarlo; no reintentar con otra función ni con PostgREST.
7. No Run a medias: si aborta a mitad, `ROLLBACK` implícito; volver a pegar entero.

| Incidente | Filtro | Evidencia mínima |
| --- | --- | --- |
| 401 dispatcher | Función `whatsapp-followup-dispatcher`, POST, status 401, desde 2026-11-17 | Timestamp, execution/request ID, revisión de la función, `sb-error-code` si existe |
| Job `2e1aa063-aad8-42cc-8b74-b79cb3147afd` | `whatsapp-webhook`, 2026-11-18 16:17–16:21 UTC | MESSAGE/STATEMENT PostgreSQL si el log lo conserva |
| Job `b5188f3f-020e-4f6e-b21f-df3fd053993e` | `whatsapp-webhook`, 2026-11-18 06:00–06:04 UTC | Igual |

Si la retención expiró, anotarlo: eso habilita **excepción de atribución**, no una causa inventada.

## Cómo leer los bloques

### 0 · Catálogo

Si `has_cron_job`, `has_net_http_response` o `has_inbound_jobs` es false, no interpretar los bloques siguientes: falta el objeto o el rol no lo ve. El SQL Editor con rol `postgres` ignora RLS; `anon`/`authenticated` tienen `REVOKE ALL` en jobs y recibos y **no** sirven para esta auditoría.

### A · HTTP 401 del dispatcher

Causa probable (código, no hecho de PROD hasta correlacionar): el Gateway exige `Authorization`/`apikey` aunque `verify_jwt=false`; el cron de `20261103121000` mandaba solo `x-dispatcher-secret`. A1 usa `~*` para cabeceras.

| Resultado | Lectura |
| --- | --- |
| `has_authorization_header` y `has_apikey_header` = true, vault en minúsculas, sin placeholder | Cron actual parece el de `20261104140000`. El 401 histórico puede ser pre-fix |
| Falta Authorization/apikey, o `has_unreplaced_placeholder`, o vault en MAYÚSCULAS | Causa vigente; no cambiar el cron en esta auditoría |
| A3 con `gateway_error_code` | Capa Gateway (`sb-error-code`). Esta pasada **no** lee `content` |
| A3 vacío | Retención de `net._http_response` agotada |

La sonda GET 405 (`eb855033-fa3b-4917-bcce-c336650cd777`) no atribuye el POST.

### B · Dos P0001

IDs fijos. Última lectura (2026-11-18): `review` / `provider_request` / `database_P0001` / `attempts=1` / `effect_started=true`; aviso de fallo entregado. **No es un falso éxito.**

`receipts.event_key` no es un FK al `id` del job en el esquema: es el `p_event` de `whatsapp_apply_action` / `whatsapp_apply_team`. El worker **actual** pasa `job.id`. `jobs.event_key` es la clave Meta. Un solo cruce **no es concluyente** (revisión Edge del 18-nov desconocida). Ambos false refuerza «sin recibo visto». Un true en `*_by_job_id` encaja con el worker actual, no prueba por sí solo el efecto sobre la acción.

| Si hoy… | Cierre propuesto (no ejecutar aquí) |
| --- | --- |
| Sigue `review` + `database_P0001` | Excepción de no-replay, o CAS `failed` + `reconciled_no_replay` con autorización aparte. Nunca `done` ni `pending` |
| Recibo true y hace falta conciliar efecto | Detener. No es el escenario documentado del 18-nov |
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
