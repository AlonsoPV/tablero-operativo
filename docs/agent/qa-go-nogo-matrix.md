# Matriz GO / NO-GO QA · 2026-11-21

**Rama:** `work/r1-r2-r3-local` · freeze tip registrado en `.qa/freeze-r1-r2-r3-manifest.json`  
**Gate 0 / JWT 16/16 / H-03…H-08 / H-05 API:** **reutilizados** (no reejecutados)  
**Cierre plan R1–R3 (H-05 Auth + preflights):** 2026-11-21 ~18:09 UTC  
**Ciclo CORS Vite proxy (único, no destructivo):** 2026-11-21 ~18:32 UTC · **BLOCKED**  
**Fase 2D R2 persistente (WSL):** **PASS 7/7** · **Fase 3A R3 QA A:** **PASS** (migración + RLS) · **Fase 3B R3 funcional QA A:** **PASS 21/21** · `AGENT_MEMORY_R3` **unset**  
**Cierre QA H-05 WSL:** 2026-11-22 ~20:24 UTC · selector/4 escenarios **PASS**  
**Preview hosted (inspect):** 2026-11-22 ~23:40 UTC · H-09 **PASS** · H-02 **BLOCKED** · H-10 no ejecutado  
**Prep cierre Preview H-02/H-10:** 2026-11-22 ~23:50 UTC · plan listo · **sin** deploy/env/push · `.qa/preview-h02-h10-prep.json`  
**Freeze local A0:** 2026-11-22 · `dbe28721…` · **sin push** · residual R0 WIP fuera del freeze · `.qa/freeze-r1-r2-r3-manifest.json`

| Gate | Estado | Evidencia |
| --- | --- | --- |
| GO LOCAL | GO | Vitest 944/944 |
| Gate 0 | **PASS** | VERIFIED |
| JWT/RLS 2B | **PASS 16/16** | `.qa/jwt-report-1795277224097.json` |
| H-03 / H-04 / H-06 / H-07 / H-08 | **PASS** | 17/17 + H-06 11/11 |
| H-05 API | **PASS** | mismos 4 formatos / cifra 3 |
| H-05 selector UI 320/390/768 | **PASS** | `.qa/h05-wsl-close.json` · `.qa/h05-wsl-ui.json` |
| H-09 local | **PASS** | loopback QA A |
| H-09 hosted | **PASS** | Preview JS → DEV `tgiuevzlyptzlfgxsfhj` ≠ PROD · `.qa/preview-h02-h09-h10.json` |
| H-02 hosted | **BLOCKED** | `AGENT_ORCHESTRATOR_R1` ausente en Preview |
| H-10 hosted | **NOT_EXECUTED** | sin edit env / redeploy |
| Node.js WSL | **PASS** | nvm · v24.22.3 ELF |
| R2 preflight WSL | **PASS** | `.qa/r2-wsl-runtime-preflight-pass.json` |
| R2 persistente (H1–H7) | **PASS 7/7** | `.qa/r2-http-1795375621266.json` |
| R3 migración QA A | **PASS** | `.qa/r3-qa-a-apply.json` · `.qa/r3-qa-a-validate.json` |
| R3 funcional QA A | **PASS 21/21** | `.qa/r3-functional-1795377126060.json` |
| Prep H-02/H-10 | **READY_FOR_AUTH** | `.qa/preview-h02-h10-prep.json` · sin ejecución remota |
| Freeze local A0 | **PASS** | tip freeze · 85 files · vitest 145/145 focalizado |
| GO QA | **NO-GO** | H-02/H-10 no ejecutados · sin push · residual R0 WIP excluido |
| GO PROD / R0 | **NO-GO** | RD-06 hasta **2026-11-27** |

---

## 1. H-05 UI

**PASS** (WSL 2026-11-22 ~20:24 UTC) — selector Auto/Directo/Reporte/Análisis usable en 320/390/768; cuatro escenarios conversacionales con respuesta; sin AppErrorBoundary; pending_ops 27→27. API de formatos **reutilizada**.

### 1a. Ciclo CORS Windows (2026-11-21) — agotado

Hop Windows↔WSL a Kong `:54421` no determinista. Evidencia histórica: `.qa/fase2c-h05-cors-cycle.json`. **No repetido.**

### 1b. Ciclo WSL Linux (2026-11-22) — hop Windows superado; crash `.map` luego **PASS**

Vite QA + Playwright Chromium **dentro de WSL** → `127.0.0.1:5180` → Kong QA A `:54421`. Same-origin. Sin puente Windows.

| Control | Estado |
| --- | --- |
| Node WSL v24.22.3 | **PASS** |
| Chromium Playwright (fallback ubuntu24.04-x64) | **PASS** |
| Vite QA `:5180` proxy Auth/REST | **PASS** · health 200 · OPTIONS 204 · token 200 |
| Login Dirección sintético | **PASS** |
| AppErrorBoundary | **PASS** (corregido) |
| Selector 320/390/768 | **PASS** · Auto/Directo/Reporte/Análisis visibles |
| Formatos UI (misma cifra 3) | **PASS** |
| s1 Qué es un OKR | **PASS** |
| s2 Mejorar el cierre | **PASS** |
| s3 Cumplimiento / atrasos | **PASS** |
| s4 Cuáles tiene Jorge | **PASS** |
| Escrituras | **PASS** · pending_ops 27→27 |
| R2 simulated / R3 unset | **PASS** |

**Causa raíz (corregida):** `AiAssistPage` llamaba `buildAssistantQuickActions({ snapshot, canSeeOkrs })`; el contrato exige `audience`. `AUDIENCE_ACTIONS[undefined].map` disparaba AppErrorBoundary. Fix: `resolveAssistantAudience` desde rol + `seesAllBoard`; throw explícito si falta audience. Tests: `assistantBriefing.test.ts` + `WorkIntentToggle.format.test.tsx`.

Evidencia: `.qa/h05-wsl-ui.json` · `.qa/h05-wsl-close.json` · `.qa/h05-wsl-320.png`.

**Instalación de navegador (ejecutada, user-cache + 3 libs):**  
`PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 npx playwright install chromium`  
`apt-get install -y --no-install-recommends libnspr4 libnss3 libasound2t64`  
(`playwright install-deps` no soporta ubuntu26.04-x64 en Playwright 1.56.1.)

## 2. Auth / CORS — causa raíz (ciclo proxy)

| Capa | Hallazgo |
| --- | --- |
| Proxy Vite QA | Fail-closed a `http://127.0.0.1:54421`; rutas `/auth/v1` `/rest/v1` `/storage/v1`; no destinos arbitrarios; no log de valores de headers |
| Cliente browser | `VITE_SUPABASE_URL=http://127.0.0.1:5180` (sin `:54421`, sin `example.supabase.co`) |
| OPTIONS vía proxy | 204 · `ACAO=http://127.0.0.1:5180` · `ACAH=authorization,apikey` |
| Token vía proxy (hop up) | 200 · `hasAccessToken` · host `127.0.0.1:5180` |
| WSL Kong QA A | Auth 200 / REST 200 **estable** |
| Windows `:54421` | Hop no determinista: `wslrelay` zombie (reset) o puente IPv4→WSL `qa-bridge-upstream` 502/503 |
| JWT / RLS | No es signing key ni RLS (JWT 16/16 reutilizado) |
| `config.toml` / CORS global / Docker / migraciones | **no modificados** |

**Resultado del ciclo:** proxy correcto; el fallo es el hop Windows↔WSL a Kong REST. Selector UI y conversacional **BLOCKED**. No más workarounds.

## 3. R2 persistente QA A — **PASS 7/7**

Ejecución WSL 2026-11-22 ~19:27 UTC · API `http://127.0.0.1:5180` · ref `qalocala000000000000`.

| Control | Estado | Evidencia |
| --- | --- | --- |
| Propose (R2-H1) | **PASS** | pending_op `e624cffe-…` · tool `agent_set_action_status` |
| Confirm + execute + receipt (R2-H2) | **PASS** | A2 `Pendiente`→`En_Ejecucion` · receipt OK |
| Idempotencia (R2-H3) | **PASS** | re-confirm mismo result |
| Concurrencia (R2-H4) | **PASS** | una sola ejecución |
| Permisos (R2-H5) | **PASS** | Dirección no confirma op de Super Admin |
| Sin proveedores reales (R2-H6) | **PASS** | niega / outbox sintético |
| Logs email/wa = 0 (R2-H7) | **PASS** | counts 0 |
| Rollback A1/A2 | **PASS** | ambos `Pendiente` post-suite + trap |
| Modo final | **`simulated`** | `.env.qa.local` verificado |

Baseline: pending_ops **25** → post **27** (ops sintéticas residuales; A1/A2 restauradas). email/wa logs siguen **0**.  
Evidencia: `.qa/r2-http-1795375621266.json` · baseline `.qa/r2-http-fase2d-baseline.json` · resumen `.qa/r2-http-fase2d-exec.json`.

**Declaración:** **R2 PERSISTENTE QA A — PASS.**

## 4. R3 QA A — **PASS** (migración + aislamiento)

Archivo: `supabase/migrations/20261121150601_agent_memory_documents.sql`  
Destino: contenedor **`supabase_db_scrumban-qa-a`** · método: `psql -f` del archivo único (sin `db push` / `db reset`).  
SHA256: `6b4004b746e44eecd445d224b0a847276ccd661a7f833727492543df0fb60b02`

| Control | Estado |
| --- | --- |
| Aplicación única | **PASS** · `schema_migrations` version `20261121150601` count=1 |
| Tablas | **PASS** · `agent_memory`, `agent_documents` |
| Índices | **PASS** · owner/status/FTS memory; published/FTS/unique docs |
| RLS | **PASS** · ambas tablas `relrowsecurity=true` · policies owner_rw + read_published |
| Aislamiento | **PASS** · insert propio OK; insert/select cruzado denegado; anon vacío; docs insert auth denegado; published legible |
| QA B | **PASS** · 0 tablas R3 |
| Compat R1/R2 | **PASS** · `AGENT_ORCHESTRATOR_R1=1` · `R2_EXECUTION_MODE=simulated` · A2 `Pendiente` · pending_ops intactos |
| Feature flag | **`AGENT_MEMORY_R3` unset** (sin procesamiento automático) |
| Providers | **PASS** · email/wa logs = 0 |

Evidencia: `.qa/r3-qa-a-preflight.json` · `.qa/r3-qa-a-apply.json` · `.qa/r3-qa-a-validate.json`.  
Probes de aislamiento eliminados (tablas vacías post-cleanup).

## 4b. R3 funcional QA A — **PASS 21/21** (Fase 3B)

Ejecución WSL 2026-11-22 ~19:52 UTC · destino `qalocala000000000000` · `http://127.0.0.1:54421` · hop **WSL loopback only** (sin Windows→WSL).  
`AGENT_MEMORY_R3=1` **solo en process.env del harness**; `.env.qa.local` **sin** flag. Sin migraciones/RLS nuevas. Marker `r3b-func-`.

| Control | Estado | Evidencia |
| --- | --- | --- |
| Preflight (migración, baseline 0/0, flag unset, R2 simulated) | **PASS** | `.qa/r3-functional-preflight.json` |
| Flag exact `'1'` (basura apaga) | **PASS** | R3-F0 |
| Creación memoria autorizada | **PASS** | R3-F1 · id `8709edd0-…` |
| Persistencia entre sesiones | **PASS** | R3-F2 · re-login Dirección |
| Aislamiento usuario | **PASS** | R3-F3 · Líder 0 filas |
| Bloqueo escritura cruzada | **PASS** | R3-F4 · RLS 42501 |
| Vacío / inválido | **PASS** | R3-F5 / R3-F6 |
| Docs published vs withdrawn | **PASS** | R3-F7…F9 · v2 visible, v1 oculto |
| Insert auth documentos denegado | **PASS** | R3-F10 |
| Recuperación contextual / sin fuga | **PASS** | R3-F11…F14 |
| R1/R2 intactos (A2 Pendiente, simulated) | **PASS** | R3-F15 / R3-F16 |
| Sin proveedores reales | **PASS** | R3-F17 · email/wa = 0 |
| Destino QA A único | **PASS** | R3-F18 |
| Limpieza `r3b-func-*` | **PASS** | R3-F19 · left 0/0 |
| Flag final unset | **PASS** | R3-F20 · post `.qa/r3-functional-post.json` |

**Declaración:** **R3 FUNCIONAL QA A — PASS.**

### Próxima autorización requerida

Prep H-02/H-10 **READY_FOR_AUTH** (ver §5b). **No** auto-iniciar freeze/push/env/deploy. GO QA permanece **NO-GO**.

## 5. Preview hosted

Grant de equipo **ok**. Proyecto `tablero-operativo` (`prj_k71rhUH9uTFEEPWofF3NyyhcKEDn`). Sin decrypt, sin deploy, sin edit env.

| Control | Local | Hosted |
| --- | --- | --- |
| H-02 flags | N/A | **BLOCKED** · `AGENT_ORCHESTRATOR_R1` y `R2_EXECUTION_MODE` **ausentes** (Production también sin flag; R2 no es `qa`) |
| H-09 aislamiento | **PASS** loopback | **PASS** · Preview `dev` JS → `tgiuevzlyptzlfgxsfhj` · PROD `scrumbanemx.vercel.app` → `xhpasmjzuwifmjhrsumb` |
| H-10 rollback Preview | procedimiento en `qa-r1-r2.md` | **NOT_EXECUTED** · flag ya ausente; no se editó ni redesplegó |

**Preview inspectada:** `dpl_5xURLqppmYrA4458RqDWrAMraAtZ` · rama **`dev`** @ `7dcdf71` · alias `dev-tablero-operativo.vercel.app` (HTML 200).  
**Production:** `dpl_4KH68ShB5GH3NWeSwjynLQr15MZM` · `main` @ `4827181` · `scrumbanemx.vercel.app`.  
**Rama QA `work/r1-r2-r3-local`:** 0 deployments Preview · **sin upstream** en `origin`. Evidencia inspect: `.qa/preview-h02-h09-h10.json`.

## 5b. Prep cierre Preview H-02 / H-10 (solo plan)

**Estado:** inspección + plan · **sin** commit / push / env remoto / deploy.  
**Evidencia:** `.qa/preview-h02-h10-prep.json`.

| Tema | Hallazgo |
| --- | --- |
| HEAD actual | `5f881d0` · 29 commits sobre `origin/main` (`4827181`) · **no** es el candidato de cierre |
| Working tree | **Sucio** · incluye fix H-05 (`resolveAssistantAudience`), R3 memory + migración `20261121150601`, matriz — **ausentes en HEAD** |
| R4 | Sin cambios de producto R4 · solo backlog futuro en docs |
| Aislamiento Vercel | `gitBranch` en env Preview **soportado** · custom environments **0** (Hobby) · **no** hace falta proyecto aparte |
| Destino datos Preview | Hereda `VITE_*` Preview → DEV `tgiuevzlyptzlfgxsfhj` ≠ PROD (H-09) · H-01 exige auth lectura DEV |
| Alias DEV | `dev-tablero-operativo.vercel.app` fijado a rama `dev` · deploy de la rama QA **no** lo reconstruye |
| Flag propuesto | `AGENT_ORCHESTRATOR_R1=1` · target `preview` · **`gitBranch=work/r1-r2-r3-local`** (nunca Production; nunca Preview global) |
| Apagados | `AGENT_MEMORY_R3` unset · `R2_EXECUTION_MODE` unset (nunca `qa`) · sin providers/dispatcher/migraciones remotas |

**Freeze local A0 hecho:** tip en manifiesto `.qa` (85 files). **No** push. Residual R0 (docs/evidence/scripts apply) **excluido** a propósito. Migración R3 en árbol **no** se aplica en `vercel-build`.

**Cambios remotos pendientes (auth):** (1) **A0-push** de `dbe28721…`, (2) **A1** env branch-scoped, (3) **A2** Preview de ese SHA, (4) H-02 verify, (5) **H-10** quitar flag + redeploy, (6) **H-01** lectura DEV, (7) evidencia.

## 6. Riesgos críticos

1. Hop Windows↔WSL a Kong `:54421` **ya no bloquea** H-05 cuando Vite+browser corren en WSL. Crash `.map` de `/asistente-ia` **corregido**. JWT REST proxy puede ser lento (~0.1–15 s).  
2. Residuo sintético QA A: ~25 `assistant_pending_ops`; 3 acciones; 8+2 cuentas — sin purge.  
3. R0 **NO-GO** liberación independiente; RD-06 vence **2026-11-27** (decisión humana; no auto-repair).  
4. Instancia QA A se reinicia con frecuencia (SIGQUIT histórico) — desincroniza keys/password.

## 7. Próximo paso mínimo hacia GO QA

Prep H-02/H-10 lista. Bloqueo: autorizaciones A0–A2 (freeze+push, env branch-scoped, deploy Preview SHA). Sin auto-ejecución. **GO QA = NO-GO.** **R0 = NO-GO.**

---

## Histórico conservado (no reejecutado)

### H-06 PASS

ops 24→25; acciones `Pendiente`; sin confirm. `.qa/fase2c-h06-1795280056838.json`

### H-05 viewports (ciclo 17:12)

Nav/errores PASS; selector BLOCKED. `.qa/fase2c-h05-viewports.json`

### Inteligencia conversacional R1 · ~18:01 UTC

Cuatro escenarios UI **BLOCKED** por sesión/perfil (misma causa). Código local 21/21. No se reabrió.

### Inteligencia conversacional R1 · ciclo CORS ~18:32 UTC

Cuatro escenarios UI **BLOCKED** (misma causa: hop REST Windows). No se reabrió. Código local 21/21 intacto.

### Fase 2D R2 WSL · 2026-11-22

1. **BLOCKED** inicial · `node_missing_in_wsl` · `.qa/r2-http-fase2d-wsl-blocked.json`
2. **PASS** runtime+preflight · `.qa/r2-wsl-runtime-preflight-pass.json`
3. **PASS 7/7** writes · `.qa/r2-http-1795375621266.json` · modo final **`simulated`** · A1/A2 `Pendiente` · pending_ops 25→27 residual

### Fase 3A R3 QA A · 2026-11-22

**PASS** migración `20261121150601` en `supabase_db_scrumban-qa-a` · RLS/aislamiento OK · flag off · QA B sin tocar.

### Fase 3B R3 funcional QA A · 2026-11-22

**PASS 21/21** · harness `scripts/qa/run-r3-functional.mjs` · process flag on→off · sintéticos `r3b-func-` limpiados · A2 `Pendiente` · email/wa 0 · `.qa/r3-functional-1795377126060.json`.

### Cierre QA H-05 WSL + Preview · 2026-11-22

**H-05 UI:** **PASS** · crash `.map` corregido (`audience` en `buildAssistantQuickActions`) · selector 320/390/768 · 4 escenarios · pending_ops 27. `.qa/h05-wsl-close.json`  
**Preview inspect 23:40 UTC:** H-09 **PASS** (DEV ≠ PROD) · H-02 **BLOCKED** (flag R1 ausente) · H-10 no ejecutado · 0 Preview de `work/r1-r2-r3-local`. `.qa/preview-h02-h09-h10.json`  
**Prep H-02/H-10 23:50 UTC:** READY_FOR_AUTH · candidato ≠ HEAD · aislamiento por `gitBranch` · sin deploy/env/push. `.qa/preview-h02-h10-prep.json`  
Sin deploys, sin env remotos, sin R2 qa, sin R4.

**GO QA = NO-GO.** **R0 liberación = NO-GO.** `AGENT_MEMORY_R3` unset. Sin siguiente fase automática.
