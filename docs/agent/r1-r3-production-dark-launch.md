# R1/R3 Production — Runbook de Dark Launch, Migración SQL y Activación en 3 Ventanas

**Estado:** PREPARADO (sin ejecuciones remotas realizadas).  
**SHA funcional validado (Stage B):** `fe8ddf4765359de65ed708996a2e7d486481145b` (`runId: mwtwtvj3`, 8/8 PASS).  
**Target Supabase Production:** `xhpasmjzuwifmjhrsumb` (NO MODIFICADO).  
**Target Vercel Production:** `prj_k71rhUH9uTFEEPWofF3NyyhcKEDn` (`target=["production"]`, NO MODIFICADO).

---

## 1. Confirmación de matriz de flags y compatibilidad hacia atrás

Verificado directamente en el código del SHA `fe8ddf4765359de65ed708996a2e7d486481145b`:

| `AGENT_ORCHESTRATOR_R1` | `AGENT_MEMORY_R3` | Comportamiento verificado | Evidencia en código |
|---|---|---|---|
| `0` (o ausente) | `0` (o ausente) | **100% Legacy.** `api/gemini-chat.ts` salta completamente `runChannelTurn()` y ejecuta `runGeminiToolLoop` tradicional. Ninguna lectura ni escritura sobre `agent_memory`/`agent_documents`. | `api/gemini-chat.ts:167`, `api/_shared/orchestrator/channelAdapters.ts:31-33`, `api/_shared/memory/flag.ts:5-7` |
| `1` | `0` | **Combinación soportada (Ventana B).** El orquestador R1 atiende turnos web/WhatsApp/voz; `channelAdapters.ts` pasa `memoryStore: undefined` y `runAgentTurn.ts` omite cualquier recall/cita de memoria o documentos. | `api/_shared/orchestrator/channelAdapters.ts:125`, `api/_shared/orchestrator/runAgentTurn.ts:1108,1194`, test `api/_shared/orchestrator/mvpFlows.integration.test.ts:280` (PASS) |
| `1` | `1` | **Combinación R1+R3 completa (Ventana C).** Orquestador R1 + memoria R3 bajo RLS por usuario autenticado y documentos publicados. Validada E2E en Stage B (`mwtwtvj3`, 8/8 PASS). | `docs/agent/evidence/r3-stage-b-mwtwtvj3.json` |
| `0` | `1` | **Fail-closed a Legacy.** Si `AGENT_ORCHESTRATOR_R1 !== '1'`, el orquestador no corre y `AGENT_MEMORY_R3` queda inerte. | `api/gemini-chat.ts:167` |

**Aislamiento de R2 en Production:**  
`resolveR2ExecutionMode()` (`api/_shared/actions/executionMode.ts:76-80`) devuelve obligatoriamente `'disabled'` cuando `VERCEL`, `VERCEL_ENV` o `NODE_ENV === 'production'` están presentes, y `BLOCKED_PROJECT_REFS` bloquea `xhpasmjzuwifmjhrsumb`. `isCopilotR2GateEnabled()` (`api/_shared/actions/executionMode.ts:86-88`) devuelve siempre `false` en Production.

---

## 2. Procedimiento exacto para crear flags Production en `0` (Previo al Dark Launch)

> **No ejecutar sin autorización formal `AUTH-PROD-DARK-LAUNCH`.**

Crear ambas variables **exclusivamente en `target=["production"]`** con valor `"0"` (antes de mergear el PR a `main`):

```bash
# Opción A — Vercel CLI (requiere sesión autenticada y confirmación de equipo alonsopvs-projects)
printf '0' | vercel env add AGENT_ORCHESTRATOR_R1 production
printf '0' | vercel env add AGENT_MEMORY_R3 production
```

O vía Vercel API / MCP (`create_project_env`) con:
- `projectId`: `prj_k71rhUH9uTFEEPWofF3NyyhcKEDn`
- `teamId`: `alonsopvs-projects`
- Variables:
  1. `key: "AGENT_ORCHESTRATOR_R1"`, `value: "0"`, `target: ["production"]`, `type: "plain"`
  2. `key: "AGENT_MEMORY_R3"`, `value: "0"`, `target: ["production"]`, `type: "plain"`

Verificación previa al deploy (read-only): confirmar que `AGENT_ORCHESTRATOR_R1=0`, `AGENT_MEMORY_R3=0`, y que `R2_EXECUTION_MODE` / `COPILOT_R2_GATE` siguen ausentes en `target=["production"]`.

---

## 3. Migración SQL R3 para Production (`xhpasmjzuwifmjhrsumb`)

### Archivo exacto a aplicar

- **R3 (obligatoria para Ventana A / C):** `supabase/migrations/20261121150601_agent_memory_documents.sql`

> **ADVERTENCIA CRÍTICA — NO EJECUTAR `supabase db push` MASIVO EN PRODUCTION.**  
> La rama contiene otras migraciones en `supabase/migrations/` que **NO** deben aplicarse automáticamente juntas:
> - **EXCLUIDA (R2 — PROHIBIDO en PROD):** `20261120120000_agent_apply_action_status.sql`
> - **EXCLUIDA (R0 — fuera de alcance R1/R3):** `20261118150000_direction_executive_scope.sql`
> - **REVISAR ESTADO EN PROD ANTES DE VENTANA B (R1):**
>   - `20261119120000_assistant_op_log_read_audit.sql` (amplía `CHECK` de `assistant_op_log.result` para incluir `'read'`)
>   - `20261119135000_guard_usuarios_privileges.sql` y `20261119136000_guard_privileged_area_membership.sql` (hotfix usuarios; confirmar en `supabase_migrations.schema_migrations` si ya están aplicadas en PROD)
>   - `20261119140000_r1_transversal_access.sql` y `20261119150000_inactive_users_rls.sql` (capacidades transversales R1 y bloqueo RC-05 de usuarios inactivos; evaluar aplicación selectiva previa a Ventana B)

### Revisión técnica de `20261121150601_agent_memory_documents.sql`

- **Compatibilidad hacia atrás:** 100% aditiva. Crea dos tablas nuevas (`public.agent_memory`, `public.agent_documents`) sin alterar ni migrar ninguna tabla existente.
- **Dependencias en Production (`origin/main`):**
  - Tablas `public.usuarios (id)` y `public.areas (id)`.
  - Funciones `public.get_my_usuario_id()` y `public.okr_active_user()` (ambas ya existentes en `origin/main` desde `20260924120000_okr_management.sql`).
- **Impacto de locks:**
  - `CREATE TABLE IF NOT EXISTS` e índices (`btree` / `gin` en tablas vacías) no bloquean consultas existentes.
  - Las FKs hacia `public.usuarios (id)` y `public.areas (id)` adquieren un `SHARE ROW EXCLUSIVE` instantáneo sobre la definición de esas tablas; ejecutar precedido de `SET LOCAL lock_timeout = '3s';` dentro de la transacción para abortar limpiamente si hubiera un DDL concurrente.
- **Permisos y RLS:**
  - `agent_memory`: `ENABLE ROW LEVEL SECURITY`, `REVOKE ALL FROM anon, authenticated`, `GRANT SELECT, INSERT, UPDATE TO authenticated` (sin `DELETE` directo desde cliente). Política `agent_memory_owner_rw` exige `usuario_id = (select public.get_my_usuario_id()) AND (select public.okr_active_user())` en `USING` y `WITH CHECK`.
  - `agent_documents`: `ENABLE ROW LEVEL SECURITY`, `REVOKE ALL FROM anon, authenticated`, `GRANT SELECT TO authenticated` (solo lectura; escrituras solo `service_role`/administración controlada). Política `agent_documents_read_published` exige `status = 'published' AND (select public.okr_active_user())`.

### Verificación SQL posterior a la migración (solo lectura)

```sql
-- 1. Tablas y RLS habilitado
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('agent_memory', 'agent_documents')
ORDER BY c.relname;

-- 2. Políticas RLS activas
SELECT tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('agent_memory', 'agent_documents')
ORDER BY tablename, policyname;

-- 3. Grants efectivos (confirmar anon = 0 privilegios)
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('agent_memory', 'agent_documents')
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

-- 4. Conteo inicial en 0
SELECT
  (SELECT count(*)::int FROM public.agent_memory) AS memory_rows,
  (SELECT count(*)::int FROM public.agent_documents) AS document_rows;
```

---

## 4. Estrategia de Activación en 3 Ventanas

### Ventana A — Dark Launch (`AGENT_ORCHESTRATOR_R1=0`, `AGENT_MEMORY_R3=0`)

- **Acciones:**
  1. Crear `AGENT_ORCHESTRATOR_R1=0` y `AGENT_MEMORY_R3=0` en Vercel `target=["production"]`.
  2. Aplicar selectivamente `20261121150601_agent_memory_documents.sql` (y las migraciones R1 aprobadas tras auditar `schema_migrations` en PROD) con `lock_timeout = '3s'`.
  3. Ejecutar verificaciones SQL post-migración.
  4. Mergear PR aprobado a `main` y esperar deployment Production `READY`.
- **Criterios de aceptación:**
  - HTTP `200` en `tablero-operativo.vercel.app` y `scrumbanemx.vercel.app`.
  - Flujo legacy del copiloto (`/api/gemini-chat`) idéntico al baseline, `0` errores `5xx` atribuibles al release.
  - `agent_memory` y `agent_documents` presentes con RLS activo y `0` filas.
- **Condiciones de aborto:**
  - Cualquier incremento en `5xx` en `/api/gemini-chat`, fallo de login/SSO o error de carga de módulos.
- **Rollback independiente:**
  - Vercel `Instant Rollback` al deployment previo de `main`. Las tablas `agent_memory`/`agent_documents` vacías no interfieren con el código anterior.

### Ventana B — Activación R1 (`AGENT_ORCHESTRATOR_R1=1`, `AGENT_MEMORY_R3=0`)

- **Precondición:** Ventana A estable ≥ 24h y verificación de migraciones R1 en PROD (`assistant_op_log_read_audit`, `r1_transversal_access`, `inactive_users_rls`).
- **Acciones:**
  1. Cambiar únicamente `AGENT_ORCHESTRATOR_R1=1` en `target=["production"]` (mantener `AGENT_MEMORY_R3=0`).
  2. Ejecutar un único redeploy de Production.
  3. Ejecutar smoke controlado en Production con usuario autorizado (consulta operativa + formato reporte/directo) y confirmar `agent_memory` permanece en `0` escrituras.
- **Monitoreo (24h):**
  - Vercel Runtime Errors/Logs: tasa `5xx` en `/api/gemini-chat`, latencia p95, `502` del orquestador.
  - Supabase Logs: errores en `assistant_op_log` o RLS (`42501` inesperados).
- **Criterios de aceptación:**
  - Smoke PASS, `0` escrituras en `agent_memory`, tasa de error `5xx` < 1%, sin regresiones en permisos de área/rol.
- **Condiciones de aborto:**
  - Error `502`/`500` recurrente en `/api/gemini-chat`, fuga de datos entre áreas/roles o latencia p95 > 15s sostenida.
- **Rollback independiente:**
  - Cambiar `AGENT_ORCHESTRATOR_R1=0` en `target=["production"]` y redeploy (o `Instant Rollback` al deployment de Ventana A). Sin tocar BD ni revertir PR.

### Ventana C — Activación R3 (`AGENT_ORCHESTRATOR_R1=1`, `AGENT_MEMORY_R3=1`)

- **Precondición:** Ventana B estable ≥ 24h y verificación de RLS en `agent_memory` / `agent_documents` en PROD.
- **Acciones:**
  1. Cambiar `AGENT_MEMORY_R3=1` en `target=["production"]` (manteniendo `AGENT_ORCHESTRATOR_R1=1`).
  2. Ejecutar un único redeploy de Production.
  3. Ejecutar smoke controlado:
     - Confirmación de no-alucinación cuando no hay memoria.
     - Verificación de RLS en `agent_memory` y visibilidad de `agent_documents` publicados únicamente.
- **Monitoreo (24–48h):**
  - Vercel Runtime Logs: `5xx` / `502` en `/api/gemini-chat`, errores `memory_store_error`.
  - Supabase Logs & tablas: tasa de crecimiento de `agent_memory`, ausencia de errores `42501` en usuarios activos autorizados.
- **Criterios de aceptación:**
  - Smoke PASS, aislamiento RLS intacto, sin impacto en latencia p95 ni en flujos operativos Kanban/OKR.
- **Condiciones de aborto:**
  - Cualquier fallo de aislamiento de usuario/organización, error RLS en usuarios válidos, memoria inventada o `5xx` recurrente.
- **Rollback independiente:**
  - Cambiar `AGENT_MEMORY_R3=0` en `target=["production"]` y redeploy inmediato (retorna a Ventana B estable en minutos; si se requiere regreso total a legacy, apagar también `AGENT_ORCHESTRATOR_R1=0`). Sin pérdida ni alteración de tablas operativas.
