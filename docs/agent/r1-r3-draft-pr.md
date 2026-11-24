# Draft PR: `release/r1-r3-minimal` -> `main` (Release Selectivo R1/R3 — Dark Launch OFF)

> **Estado:** DRAFT LOCAL — **NO hacer push, NO abrir PR remoto y NO mergear sin autorización explícita.**  
> **Base:** `origin/main` (`4827181`)  
> **Head recomendado:** `release/r1-r3-minimal` (rama completa alternativa preservada en `release/r1-r3` `d17170b`)

---

## 1. Resumen Ejecutivo y Por Qué Se Recomienda `release/r1-r3-minimal`

Esta rama incorpora **exclusivamente R1, R3, sus dependencias compartidas indispensables, hotfixes de seguridad P0, el harness QA R3 y CI local**, con **ambos flags apagados por defecto (`AGENT_ORCHESTRATOR_R1=0`, `AGENT_MEMORY_R3=0`)**.

Frente a la rama heredada completa (`release/r1-r3`, 220 archivos), `release/r1-r3-minimal` elimina **cinco riesgos reales de impacto productivo no autorizado** que afectaban a Production incluso con flags OFF:
1. Evita romper `/api/whatsapp-assistant` en Production (`can_query_ai_whatsapp_for_usuario` de R0 no existe en `origin/main`; se conserva `can_use_ai_whatsapp_for_usuario`).
2. Evita deshabilitar la creación de acciones desde la Guía (`GUIDE_WRITE_CLOSED` de R2/commit `66f227b`).
3. Evita revocar 16 rutas y edición de acciones/academia/retos a `Direccion` sin feature flag (cambios R0 en `permissions.ts`, `moduleAccess.ts`, `challenges/*`, `AccionFormDialog.tsx`).
4. Elimina las migraciones no autorizadas de R0 (`20261118150000`) y R2 (`20261120120000`) del árbol `supabase/migrations/`.
5. Excluye código no relacionado (Edge Functions R0, UI OKR `3533e15`, proxy WSL de `vite.config.ts`, scripts QA legacy/R2).

---

## 2. Alcance, Dependencias, Migraciones y Documentos de Soporte

- Clasificación completa A/B/C/D, inventario ordenado de migraciones (6 incluidas / 2 excluidas), consulta READ-ONLY sobre `supabase_migrations.schema_migrations` para Production y plan mínimo de revalidación integrada: [`docs/agent/r1-r3-scope-and-migrations.md`](./r1-r3-scope-and-migrations.md).
- Runbook de Dark Launch (flags Production en `0`, migración SQL R3, verificación de locks/RLS, y activación en 3 ventanas A/B/C con rollback independiente): [`docs/agent/r1-r3-production-dark-launch.md`](./r1-r3-production-dark-launch.md).
- Guía del harness QA R3 y guardrails anti-Production: [`docs/agent/r3-qa-harness.md`](./r3-qa-harness.md).
- Evidencia sanitizada Stage B (`fe8ddf4` / `mwtwtvj3`, 8/8 PASS): [`docs/agent/evidence/r3-stage-b-mwtwtvj3.json`](./evidence/r3-stage-b-mwtwtvj3.json).

---

## 3. Validaciones Locales en `release/r1-r3-minimal`

- `npm run qa:r3:test`: **PASS (2 archivos, 15/15)** — contrato R3 + bloqueo Production fail-closed.
- `node --test scripts/qa/qaGuard.test.mjs`: **PASS (6/6)** — aislamiento QA.
- `npm test` (suite Vitest completa): **PASS (134 archivos, 919/919)** — incluye R1, R3, legacy OFF, `R1=1 / R3=0`, `R2` desactivado en Production, `permissions` y `moduleAccess`.
- `npm run build` (`tsc -b && vite build`): **PASS** (exit 0).
- `node scripts/bundle-api.mjs`: **PASS** (11/11 handlers serverless empaquetados sin errores).

---

## 4. Criterios GO / NO-GO para Production

- [x] R3 Stage B CLOSED / VALIDATED (`fe8ddf4` / `mwtwtvj3`, 8/8 PASS, 0 residuales).
- [x] Rama selectiva `release/r1-r3-minimal` compilando y pasando 919/919 tests + 15/15 harness R3 + 11/11 API bundles.
- [x] Cero cambios no autorizados de R0, R2 SQL/Guía ni OKR UI.
- [ ] Revalidación mínima integrada en Preview sobre el nuevo SHA de `release/r1-r3-minimal` (`qa:r3:preflight` + `qa:r3:integrated` + `qa:r3:rollback`).
- [ ] Ejecución autorizada de consulta READ-ONLY sobre `supabase_migrations.schema_migrations` en Production (`xhpasmjzuwifmjhrsumb`).
- [ ] Alta de `AGENT_ORCHESTRATOR_R1=0` y `AGENT_MEMORY_R3=0` en Vercel `target=["production"]`.
- [ ] Aplicación selectiva de migraciones aprobadas según ventana (A: R3 `20261121150601`; previo a B: R1 + hotfixes faltantes).
- [ ] Autorizaciones formales firmadas para push, PR y cada ventana (A, B, C).
