# SCRUMBAN 1.0 — Release Candidate & Controlled Delivery Specification

**Rama candidata:** `feature/multichannel-release`  
**Consolidación verificada:** `ddb13143f897bb55880fe469a76b8f4c12775b4c` es ancestro directo (`0` commits faltantes); tarjetas escaneables, responsive 390px, contratos API, harnesses comerciales, autorización `ai_assist`, Lean Build y arquitectura multicanal están integrados sin pérdidas.  
**Ramas congeladas preservadas:** `feature/r2-executive-action` (`6cc67ba`), `feature/r0-whatsapp-connected` (`a504d46`), `r4/voz-ligas-local` (`4d0b14d`).

---

## 1. Inventario de Publicación vs `origin/main` (Lectura Exclusiva)

- **Alcance de cambios:** 150+ archivos (núcleo multicanal R0/R1/R2/R3/R4, pruebas, scripts QA/demo, documentación).
- **Dependencias npm nuevas en runtime:** **0** (cero peso extra en bundles serverless).
- **Funciones serverless Vercel (`api/*.ts`):** **11/12** dentro del límite Hobby (`api/whatsapp-webhook.test.ts` movido a `api/_shared/`).
- **Migraciones SQL pendientes vs `origin/main` (3 archivos, orden obligatorio):**
  1. `supabase/migrations/20261120120000_agent_apply_action_status.sql` — compuerta `agent_execution_gate` fail-closed (cerrada por defecto) + RPCs R2.
  2. `supabase/migrations/20261124120000_whatsapp_r0_checkpoint_p0001_and_reconciliation.sql` — corrección trigger `P0001` y reconciliación CAS WhatsApp R0.
  3. `supabase/migrations/20261124130000_fix_operational_okr_dashboard_evidencias_uploaded_at.sql` — corrección columna `uploaded_at` en dashboard OKR.
- **Compatibilidad con esquema actual y preservación legacy (con flags nuevos en OFF):**
  - **Guide (`guide-*.ts`):** sin cambios.
  - **OKRs UI:** sin cambios.
  - **Kanban / TeamKanban:** únicamente deep-link aditivo (`?accion=` con toast de alcance y enlace `?from=asistente`).
  - **Permisos de Dirección:** intactos (solo lectura en escritura de tablero); `api/_shared/assistantAuth.ts` añade soporte aditivo para el módulo de catálogo `ai_assist`.
  - **WhatsApp legacy:** preservado con `WHATSAPP_DISPATCHER_ENABLED=0`.
- **Riesgo operativo detectado antes de publicar:**
  - `package.json` y `vercel.json` renombraron `vercel-build` → `build:vercel`. Si el proyecto en Vercel Dashboard tiene un **Build Command Override** manual apuntando a `npm run vercel-build`, fallará el build hasta alinear ese override a `npm run build:vercel` (o dejar que tome `vercel.json`).
  - `api/gemini-chat.ts` consulta `resolveLlmProvider(process.env)`: con `AI_ZERO_COST_ONLY` apagado preserva Gemini estándar; si `GEMINI_API_KEY` falta o tiene placeholder, devuelve HTTP `503` transparente sin simular respuestas.

---

## 2. Evaluación de Alternativas Gratuitas para Preview Comercial ($0 USD)

| Opción | Infraestructura | Costo adicional | Riesgo | Estado actual |
|---|---|---|---|---|
| **A (Recomendada para Preview remoto compartido)** | Proyecto **Supabase QA dedicado** en organización corporativa autorizada (`vagzlhnotqtvkcqfviua`) con cupo Free disponible + **Vercel Preview protegido con SSO** | **$0 USD** (si existe slot gratuito en org) | Bajo (aislado de DEV/PROD/TOOL SCRUMBAN) | **Bloqueado temporalmente:** CLI local autenticada en cuenta personal sin acceso a org `vagzlhnotqtvkcqfviua`; requiere provisión autorizada |
| **B (Operativa hoy a $0 USD)** | **Demostración local `scrumban-tc-local`** (`npm run demo:start` / `demo:reset` / `demo:stop`) con `[DEMO-CORP]` | **$0 USD** | Mínimo (loopback `127.0.0.1`, cero exposición pública) | **Lista y validada hoy** (10/10 E2E, compuerta R2 automática) |

> **Regla estricta:** Prohibido reutilizar `TOOL SCRUMBAN` (`bcmeiyboqvpksjxfavfl`), `DEV` (`tgiuevzlyptzlfgxsfhj`) o `PROD` (`xhpasmjzuwifmjhrsumb`).

### Requisitos exactos para el Único Preview Comercial Protegido (Opción A)
- **Rama y SHA inmutable:** `feature/multichannel-release` @ SHA final congelado tras Fase 4.
- **Proyecto Vercel:** Preview deployment dedicado del repositorio con **Vercel Deployment Protection (SSO / Vercel Auth)** activado (acceso público deshabilitado) y Build Command = `npm run build:vercel`.
- **Base de datos Supabase QA:** Proyecto limpio en org autorizada `vagzlhnotqtvkcqfviua` (nunca DEV/PROD/TOOL SCRUMBAN).
- **Migraciones:** Esquema base + las 3 migraciones pendientes listadas en la Sección 1.
- **Identidades sintéticas (5 cuentas):** `qa-superadmin@tc-local.test` (`super_admin`), `qa-direccion@tc-local.test` (`Direccion` solo lectura intacta), `qa-lider@tc-local.test`, `qa-operativo@tc-local.test` (aislado), `qa-analista@tc-local.test`, más seed comercial `[DEMO-CORP]`.
- **Feature flags Preview QA:**
  - `AGENT_ORCHESTRATOR_R1=1`, `AGENT_MEMORY_R3=1`
  - `R2_EXECUTION_MODE=qa`, `COPILOT_R2_GATE=1`, `R2_QA_PROJECT_REFS=<ref_qa_nuevo>` (y `agent_execution_gate.enabled=true` **únicamente** durante la ventana de demo)
  - `WHATSAPP_DISPATCHER_ENABLED=0` (sin envíos reales)
  - `AI_ZERO_COST_ONLY=1` por defecto (o `0` únicamente con autorización expresa de Gemini / proveedores de voz)
- **Proveedores:** Orquestador determinístico R1/R2/R3 + Voz navegador (`es-MX`) con fallback visual/texto; Gemini / ElevenLabs / Meta Test Number únicamente bajo autorización explícita separada.
- **Criterios de aceptación Preview:** 10/10 flujo comercial, aislamiento RLS verificado para `Operativo` y `Direccion`, 0 errores en consola en 1440px y 390px, 0 llamadas externas no autorizadas.
- **Rollback (<2 min):** `DELETE FROM public.agent_execution_gate;` + `R2_EXECUTION_MODE=disabled`, `COPILOT_R2_GATE=0`, `WHATSAPP_DISPATCHER_ENABLED=0` y eliminación/pausa del deployment Preview.

---

## 3. Secuencia de Activación Controlada en Production (Independiente del Dark Launch)

El estabilizado del **Dark Launch actual en Production** corre de forma **100% independiente**. No se modifican flags de Production con esta entrega. Cada etapa posterior exige **autorización independiente** y verificación previa:

1. **R1 (`AGENT_ORCHESTRATOR_R1=1`):** Lectura determinística bajo RLS. *Dependencia:* esquema estable y Dark Launch estabilizado. *Aceptación:* 0 fugas RLS, latencia P95 aceptable, 0 regresiones en Guide/OKRs/Kanban.
2. **R3 (`AGENT_MEMORY_R3=1`):** Memoria y documentos autorizados (lectura). *Dependencia:* R1 estable + migración `agent_memory_documents` validada. *Aceptación:* 0 mezcla de cifras documentales sobre estado vivo.
3. **Executive MVP:** Diagnóstico, prioridades, riesgos y sesiones ejecutivas. *Dependencia:* R1 + R3 estables. *Aceptación:* 0 métricas inventadas, tono ejecutivo validado.
4. **R2 (`R2_EXECUTION_MODE` + `COPILOT_R2_GATE` + `agent_execution_gate`):** Escritura con aprobación humana explícita. *Dependencia:* migración `20261120120000` + piloto controlado con compuerta. *Aceptación:* 100% idempotencia, auditoría y cero bypass por modelo.
5. **R4 (Voz por turnos `es-MX`):** Interfaz por turnos con edición previa y fallback texto/visual. *Dependencia:* R1/R2 estables + validación de licencias/proveedores de voz elegidos. *Aceptación:* escritorio y móvil sin bloqueos, sin promesas de streaming en tiempo real.
6. **R0 (WhatsApp conectado):** Entrada/salida bajo webhook firmado y reconciliación CAS. *Dependencia:* migración `20261124120000` + pruebas aprobadas en Meta Test Number + verificación tarifaria Meta Business Manager. *Aceptación:* 0 envíos no autorizados, confirmaciones R2 inequívocas.
