# R2 Executive Action — activación (local)

R2 permanece **OFF por omisión**. Ausencia de `R2_EXECUTION_MODE` y `COPILOT_R2_GATE` = disabled. Production/Vercel fuerza `disabled` aunque las variables existan.

## Qué hay en el árbol

- Runtime TypeScript: `proposeR2Operation` → `assistant_pending_ops` → confirmación humana → ejecutor `simulated` (tests) o `qa` (proyecto QA allowlisted).
- Migración **no aplicada** en DEV/PROD: `supabase/migrations/20261120120000_agent_apply_action_status.sql`.
- Rollback: desactivar flags (seguro). Si llegó a QA local, `supabase/scripts/rollback_agent_apply_action_status.sql` DROP de RPCs `agent_*`.
- Auditoría de lectura (documentación, no harness remoto): `scripts/qa/sql/r2-audit.sql`.

## Dependencias

Ya presentes en R1: `assistant_pending_ops`, `request_key`, `can_edit_accion_general_as`, `can_manage_accion_full_as`, `try_set_accion_hecho`, `is_explicit_privilege_admin`, `is_business_analyst`. **No** requiere R0 Direction (`20261118150000`).

## Cómo activar en local

1. Tests: `vi.stubEnv('R2_EXECUTION_MODE', 'simulated')` + fixture in-memory. Cero writes a DEV (`tgiuevzlyptzlfgxsfhj`) o PROD.
2. QA autorizada: `R2_EXECUTION_MODE=qa`, `R2_QA_PROJECT_REFS` con el ref allowlisted, seed de `agent_execution_gate`. Nunca DEV/PROD.
3. No fusionar ni pushear esta rama a Production.

## Fuera de alcance

WhatsApp autónomo, dispatchers, R0/R4, merge/push/deploy, flags remotos.
