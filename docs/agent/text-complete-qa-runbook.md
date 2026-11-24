# Scrumban — Text Complete | Runbook de Ventana QA Integrada

Validación única e integrada del asistente por texto (**R1 + R3 + Executive MVP + DEMO FIX `a078a4f` + R2 + Lean Build**, sin R0 ni R4) sobre un **Preview protegido único** conectado a un **proyecto Supabase QA dedicado y aislado** de DEV (`tgiuevzlyptzlfgxsfhj`) y PROD (`xhpasmjzuwifmjhrsumb`).

## 1. Provisión mínima del entorno Supabase QA dedicado (requiere autorización explícita)

Actualmente **no existe** un proyecto Supabase QA dedicado y autorizado. DEV (`tgiuevzlyptzlfgxsfhj`) y PROD (`xhpasmjzuwifmjhrsumb`) están bloqueados a nivel de código (`BLOCKED_PROJECT_REFS`) y SQL (`seed_qa_environment.sql`).

Pasos mínimos tras recibir autorización:
1. Crear un proyecto Supabase Free dedicado (`scrumban-qa-text`, nunca DEV/PROD) y anotar su `project_ref` de 20 caracteres.
2. Deshabilitar registro público, SMTP propio, cron jobs externos (`cron.schedule`) y no desplegar Edge Functions ni secretos de proveedores externos (WhatsApp/correo/Retell).
3. Aplicar las migraciones base + R1 + R3 + R2 (`20261120120000_agent_apply_action_status.sql`) neutralizando únicamente los `cron.schedule` productivos y el UUID fijo histórico. **No aplicar `20261118150000_direction_executive_scope.sql` (R0).**
4. Ejecutar auditoría de solo lectura `scripts/qa/sql/r2-audit.sql` (6/6 RPCs `agent_*`, `agent_execution_gate` sin grants, `agent_action_receipts` RLS solo lectura dueño, trigger guard activo).
5. Ejecutar `supabase/scripts/qa/seed_qa_environment.sql` sustituyendo `__QA_PROJECT_REF__` por el `project_ref` QA autorizado (habilita `agent_execution_gate`, crea `qa_outbox` y `qa_whatsapp_linked`).
6. Crear 4 identidades sintéticas `@example.invalid` distintas y activas: `super_admin` (Ejecutivo con escritura), `direccion` (Dirección lectura), `lider` (Líder), `operativo` (Operativo), más opcional `analista`.

## 2. Seguridad de notificaciones (`agent_notify_responsable`)

- `agent_notify_responsable` en `R2_EXECUTION_MODE=qa` utiliza `createQaActionExecutor` (`api/_shared/actions/r2Runtime.ts`), que escribe **exclusivamente en `public.qa_outbox`** y nunca invoca `send-notification-email`, WhatsApp Graph ni dispatchers.
- Las herramientas heredadas de comunicación (`notify_action_email`, `notify_user_email`, `whatsapp_prepare_send`, `gmail_*`) son rechazadas por `confirmPendingOp` en modo `qa` (`EXECUTION_DISABLED`).
- `textCompleteGuard.mjs` aborta antes de correr si detecta credenciales de proveedores reales (`WHATSAPP_ACCESS_TOKEN`, `RETELL_API_KEY`, etc.) en el entorno.
- El escenario `E13` verifica `delta === 0` en `notification_email_logs` y `whatsapp_messages`, y fila creada únicamente en `qa_outbox`.

## 3. Ventana Preview única (variables solo en `target=preview`, rama candidata)

- `VITE_SUPABASE_URL` / `SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` -> proyecto QA dedicado
- `AGENT_ORCHESTRATOR_R1=1`
- `AGENT_MEMORY_R3=1`
- `R2_EXECUTION_MODE=qa`
- `R2_QA_PROJECT_REFS=<qa_project_ref>`
- `COPILOT_R2_GATE=0` (o `1` si se evalúa gate copiloto), `R0`/`R4` ausentes/OFF, Vercel SSO activo, sin secretos WhatsApp/SMTP/Retell.

## 4. Comandos locales y ventana autorizada

```powershell
# Validación local del harness (sin red ni secretos)
npm run qa:text:test

# Preflight solo lectura (0 escrituras; requiere READY para continuar)
$env:NODE_OPTIONS = "--use-system-ca"
$env:TC_ENV_FILE = ".env.tc.qa.local"
npm run qa:text:preflight

# Ejecución integrada (Bloques A + B E1-E13 + C 1-3, limpieza automática tc-qa-*)
$env:TC_QA_AUTH = "AUTH-TEXT-COMPLETE-QA"
npm run qa:text:run -- --execute

# Rollback Preview OFF (dry-run sin --apply; real con autorización)
npm run qa:text:rollback
$env:TC_ROLLBACK_AUTH = "AUTH-TEXT-COMPLETE-ROLLBACK"
npm run qa:text:rollback -- --apply
```

## 5. Reconciliación, limpieza y rollback DB

- **Ejecución incierta (503/504/timeout):** `reconcileUncertainOp` consulta `assistant_pending_ops`, `agent_action_receipts` y `acciones_diarias` antes de reintentar; nunca repite escrituras ciegamente.
- **Limpieza:** el bloque final de `textCompleteSuite.mjs` elimina únicamente IDs rastreados (`tc-qa-<runId>-`) incluso ante fallo crítico y exige `remainingTotal === 0`.
- **Rollback DB QA:** `DELETE FROM public.agent_execution_gate;` cierra inmediatamente la puerta R2; opcionalmente `supabase/scripts/rollback_agent_apply_action_status.sql` revierte RPCs, trigger guard, `claimed_at`, gate y recibos.
