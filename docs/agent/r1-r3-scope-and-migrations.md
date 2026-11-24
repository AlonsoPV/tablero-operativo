# Control de Alcance R1/R3 e Inventario de Migraciones (`release/r1-r3-minimal`)

**Rama selectiva:** `release/r1-r3-minimal` (base `origin/main` `4827181`)  
**Rama completa preservada como alternativa:** `release/r1-r3` (`d17170b`, sobre SHA Stage B `fe8ddf4765359de65ed708996a2e7d486481145b`)  
**Estado remoto:** SIN CAMBIOS (sin push, sin PR remoto, sin escrituras en DEV/PROD).

---

## 1. Clasificación de Dependencias Heredadas (A / B / C / D)

### A. Indispensables para R1/R3
- **R3 Core:** `api/_shared/memory/*` (`flag.ts`, `store.ts`, `types.ts`, `memory.test.ts`), `supabase/migrations/20261121150601_agent_memory_documents.sql`.
- **R1 Core & Canales:** `api/_shared/orchestrator/*`, `api/_shared/query/*`, `api/_shared/actionQueryContract.ts`, `api/gemini-chat.ts`, `api/_shared/handlers/guide-retell-tool.ts`, `api/whatsapp-assistant.ts` (únicamente gate `isAgentOrchestratorEnabled()`, conservando `can_use_ai_whatsapp_for_usuario`), `src/features/ai-support/*`, `src/lib/assistantPrompts.ts`, `src/vite-env.d.ts`, `vite.config.ts` (solo `define.__AGENT_ORCHESTRATOR_R1__`), `scripts/fixtures/r1-capability-parity.json`.
- **R1 Migraciones:** `20261119120000_assistant_op_log_read_audit.sql`, `20261119140000_r1_transversal_access.sql`, `20261119150000_inactive_users_rls.sql`.
- **Harness QA R3 + CI:** `scripts/qa/r3*.mjs`, `scripts/qa/run-r3-integrated.mjs`, `scripts/qa/qaGuard*.mjs`, `vitest.r3.config.mjs`, `package.json`/`package-lock.json`, `.github/workflows/r3-qa-validation.yml`.

### B. Dependencias compartidas necesarias
- **Módulos R2 de compilación (inertes en Production por hard-guard):** `api/_shared/actions/{contracts.ts, executionMode.ts, r2Runtime.ts, simulator.ts}` + tests, `api/_shared/assistantOpsRuntime.ts`, `api/_shared/assistantPending.ts`, `api/_shared/assistantBoardReads.ts`, `api/_shared/assistantAuth.ts`.
  - *Dependencia transitiva real:* `api/_shared/orchestrator/runAgentTurn.ts` importa `proposeAction`, `resolveR2ExecutionMode` y `proposeR2Operation`. En Production `resolveR2ExecutionMode()` fuerza `'disabled'` (`VERCEL`, `VERCEL_ENV`, `NODE_ENV=production`, `BLOCKED_PROJECT_REFS`) e `isCopilotR2GateEnabled()` retorna `false`.
- **Hotfixes de seguridad de usuarios (SQL):** `20261119135000_guard_usuarios_privileges.sql` y `20261119136000_guard_privileged_area_membership.sql`.
  - *Dependencia transitiva real:* `20261119140000_r1_transversal_access.sql` verifica `to_regprocedure('public.guard_usuarios_privileges()')` y aborta si `135000` no está aplicada.
- **Capacidades aditivas de acceso:** exportaciones aditivas en `src/features/auth/lib/permissions.ts` (`resolveAccessCapabilities`, `isSuperAdminCatalogRole`, `CAPABILITY_MODULES`, `LEGACY_OKRS_AREA_GRANTS`) y ruteo de capacidades en `src/features/auth/lib/moduleAccess.ts` (**sin** las revocaciones R0 a `Direccion` en `/admin/*`, `/settings/*`, `DIRECTION_ALLOWED_ROUTES` ni `canManageActionsByRole`).
- **Cliente Supabase lazy (`src/lib/supabase/client.ts`):** requerido por imports de tests sin env vars en Node; comportamiento runtime idéntico en navegador.

### C. Cambios independientes y separables (EXCLUIDOS en `release/r1-r3-minimal`)
- **OKR UI (`3533e15`):** `src/features/okrs/*` (7 archivos), `src/features/operations/components/AccionForm.tsx`, `src/features/team-kanban/*`, `src/features/users/pages/UserDetailPage.tsx`.
- **R0 Edge Functions, Cron, Clock & Auditoría:** `supabase/functions/whatsapp-webhook/index.ts`, `supabase/functions/whatsapp-followup-dispatcher/index.ts`, `src/lib/clock.ts` (+ `.test.ts`), `supabase/scripts/audit_r0_*.sql`, `audit_agent_r0_readonly.sql`, `fix_whatsapp_dispatcher_cron_*.sql`, `docs/agent/r0-*` (incluyendo `r0-cycle2-code.patch` de 2,028 líneas).
- **Vite WSL QA proxy (`vite.config.ts`):** 155 líneas de proxy loopback WSL QA excluidas; se conservan solo 4 líneas para `define.__AGENT_ORCHESTRATOR_R1__`.
- **Scripts QA legacy/R2:** `scripts/qa/{local/*, _r3b-*.sh, gate0-readonly.mjs, provision-qa-accounts.mjs, run-api-matrix.mjs, run-fase2c-*.mjs, run-jwt-suite.mjs, run-r2-http.mjs, run-r3-functional.mjs}`, `scripts/test-r2-action-status-database.mjs`, `supabase/scripts/qa/seed_qa_environment.sql`.

### D. Cambios de riesgo o impacto productivo NO autorizado (BLOQUEADOS Y EXCLUIDOS en `release/r1-r3-minimal`)
1. **`api/whatsapp-assistant.ts:319` (R0):** cambiaba `can_use_ai_whatsapp_for_usuario` por `can_query_ai_whatsapp_for_usuario` (que **no existe** en Production sin la migración R0 `20261118150000`). **Con la rama completa rompería WhatsApp Assistant en Production con HTTP 403 incluso con flags OFF.**
2. **`api/_shared/guideWork.ts` (`66f227b` — R2):** deshabilitaba incondicionalmente (sin flag) la creación de acciones desde la Guía (`GUIDE_WRITE_CLOSED`). **Con la rama completa causaría regresión inmediata en Production incluso con flags OFF.**
3. **`api/assistant-ops.ts` (R2):** cableaba `r2OptionsFromServerEnv()` en `confirmPendingOp`; innecesario para R1/R3 y excluido.
4. **`permissions.ts` + `moduleAccess.ts` + `src/features/challenges/*` + `AccionFormDialog.tsx` (R0):** revocaban 16 rutas y edición de acciones/academia/retos a `Direccion` **sin feature flag**, impactando Production inmediatamente en Dark Launch.
5. **Migraciones no autorizadas:** `20261118150000_direction_executive_scope.sql` (R0) y `20261120120000_agent_apply_action_status.sql` (R2) eliminadas de `release/r1-r3-minimal` para eliminar el riesgo de aplicación accidental.

---

## 2. Inventario Exacto de Migraciones (Orden y Dependencias)

| Orden | Archivo | Categoría | Dependencias | Ventana de aplicación |
|---:|---|---|---|---|
| 1 | `20261119135000_guard_usuarios_privileges.sql` | **Hotfix Seguridad (P0)** | `public.usuarios` (`origin/main`) | Verificar primero en `schema_migrations` PROD; aplicar si falta (prerrequisito de #4) |
| 2 | `20261119136000_guard_privileged_area_membership.sql` | **Hotfix Seguridad (P0)** | `public.usuario_areas` (`origin/main`) | Verificar primero en `schema_migrations` PROD (historial indica ya aplicada) |
| 3 | `20261119120000_assistant_op_log_read_audit.sql` | **Obligatoria R1** | `public.assistant_op_log` (`origin/main`) | Previo a Ventana B (`R1=1`) |
| 4 | `20261119140000_r1_transversal_access.sql` | **Obligatoria R1** | Requiere #1 (`guard_usuarios_privileges()`) + `public` sin `CREATE` para `anon`/`authenticated` | Previo a Ventana B (`R1=1`) |
| 5 | `20261119150000_inactive_users_rls.sql` | **Obligatoria R1 (RC-05)** | `public.usuarios` + tablas operativas (`origin/main`) | Previo a Ventana B (`R1=1`) |
| 6 | `20261121150601_agent_memory_documents.sql` | **Obligatoria R3** | `public.usuarios`, `public.areas`, `public.get_my_usuario_id()`, `public.okr_active_user()` (todas en `origin/main`) | Ventana A (Dark Launch) o previo a Ventana C (`R3=1`) |

### Migraciones EXCLUIDAS (NO presentes en `release/r1-r3-minimal`, NO aplicar en PROD)
- `20261118150000_direction_executive_scope.sql` (**R0** — fuera de alcance R1/R3).
- `20261120120000_agent_apply_action_status.sql` (**R2** — prohibida en DEV/PROD).

---

## 3. Consulta READ-ONLY sobre `supabase_migrations.schema_migrations` para Production (`xhpasmjzuwifmjhrsumb`)

> **NO EJECUTAR SIN AUTORIZACIÓN `AUTH-PROD-SCHEMA-AUDIT`.** Solo lectura; cero modificaciones.

```sql
-- 1. Estado de migraciones relevantes en Production
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version >= '20261117000000'
ORDER BY version ASC;

-- 2. Verificación previa de dependencias críticas (funciones, privilegios y tablas)
SELECT
  to_regprocedure('public.get_my_usuario_id()') IS NOT NULL AS has_get_my_usuario_id,
  to_regprocedure('public.okr_active_user()') IS NOT NULL AS has_okr_active_user,
  to_regprocedure('public.can_use_ai_whatsapp_for_usuario(uuid)') IS NOT NULL AS has_whatsapp_rpc_main,
  to_regprocedure('public.guard_usuarios_privileges()') IS NOT NULL AS has_hotfix_135000,
  to_regclass('public.agent_memory') IS NOT NULL AS has_agent_memory,
  to_regclass('public.agent_documents') IS NOT NULL AS has_agent_documents,
  has_schema_privilege('authenticated', 'public', 'CREATE') AS auth_has_public_create,
  has_schema_privilege('anon', 'public', 'CREATE') AS anon_has_public_create;
```

### Verificaciones posteriores a cada migración
- **Tras #1/#2 (Hotfixes):** `to_regprocedure('public.guard_usuarios_privileges()') IS NOT NULL`.
- **Tras #3 (`120000`):** `pg_get_constraintdef` de `assistant_op_log_result_check` incluye `'read'`.
- **Tras #4 (`140000`):** `areas.system_key = 'okrs'` existe y `app_modules` contiene `okrs_admin`, `whatsapp_assistant`, `whatsapp_inbox`, `whatsapp_settings`, `whatsapp_identity_link`.
- **Tras #5 (`150000`):** `to_regprocedure('public.current_usuario_is_active()') IS NOT NULL` y políticas restrictivas activas.
- **Tras #6 (`20261121150601`):** `agent_memory` y `agent_documents` con `relrowsecurity = true`, `anon` con `0` grants, políticas `agent_memory_owner_rw` y `agent_documents_read_published` activas y `0` filas iniciales.

---

## 4. Plan Mínimo de Revalidación Integrada (por cambio de SHA)

Al pasar del SHA validado `fe8ddf4765359de65ed708996a2e7d486481145b` al nuevo SHA de `release/r1-r3-minimal`, el código de `api/_shared/memory/*`, `api/_shared/orchestrator/*`, `api/_shared/query/*` y `api/gemini-chat.ts` es **byte-a-byte idéntico** al de `fe8ddf4`, pero el bundle final cambia por la exclusión de R0/R2/OKR y los ajustes en `permissions.ts`, `moduleAccess.ts`, `whatsapp-assistant.ts` y `vite.config.ts`.

Revalidación mínima requerida sobre el Preview del nuevo SHA (reutilizando exactamente el harness existente, sin reconstruir pruebas):

1. **Ventana OFF (Preview nuevo SHA, `R1=0, R3=0`):**
   - `npm run qa:r3:preflight` (`R3_EXPECTED_WINDOW="OFF"`) -> **9/9 READY**.
   - Verificación rápida de no-regresión legacy: Guía, `/api/gemini-chat` legacy, y rol `Direccion` conservando rutas de `origin/main`.
2. **Ventana ON breve (Preview nuevo SHA, `R1=1, R3=1`):**
   - `npm run qa:r3:preflight` (`R3_EXPECTED_WINDOW="ON"`) -> **9/9 READY**.
   - Una única ejecución automatizada de `npm run qa:r3:integrated -- --execute` (**R3-I0..I7**, 8/8 PASS, limpieza `r3-int-*` = 0 residuales) para ligar la evidencia integrada al nuevo SHA exacto.
3. **Rollback OFF:**
   - `npm run qa:r3:rollback -- --apply` + `npm run qa:r3:preflight` (`OFF` 9/9 READY).
