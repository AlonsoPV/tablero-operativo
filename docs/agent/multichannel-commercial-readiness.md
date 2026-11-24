# SCRUMBAN — Demostración Comercial (≤15 min) y Preparación de Preview Protegido

## 1. Demostración Comercial para Dirección General (máximo 15 minutos)

**Audiencia:** Dueño de empresa / Dirección General.  
**Regla de oro:** Cero jerga técnica. Todo con datos sintéticos verificados. La demostración Web es 100% autónoma y **no depende** del cierre remoto de WhatsApp ni de Voz. No presentar capacidades simuladas como activas en Producción.

### Narrativa de valor de negocio
SCRUMBAN devuelve visibilidad real sobre la operación, detecta bloqueos antes de que escalen, reduce el seguimiento manual por chat o correo, deja claras las responsabilidades, conecta objetivos estratégicos con acciones concretas y convierte decisiones de junta en compromisos trazables.

### Flujo demostrativo paso a paso (12–15 min)

| Min | Paso | Qué preguntar / mostrar | Valor visible para el dueño |
|---|---|---|---|
| 0–2 | **1. Diagnóstico ejecutivo** | Abrir Asistente Web y preguntar: *«¿Qué necesita mi atención hoy?»* | Panorama inmediato del estado operativo sin perseguir reportes manuales. |
| 2–4 | **2. Identificación de prioridades** | Mostrar tarjetas visuales con el Top 3 de prioridades y evidencia navegable. | Foco directivo inmediato: qué importa hoy y por qué. |
| 4–6 | **3. Análisis de un bloqueo** | Preguntar: *«¿Qué está frenando a mi equipo?»* y abrir el detalle de la acción bloqueada. | Detecta responsables, causa del retraso y tiempo sin avance antes de que escale. |
| 6–8 | **4. Recomendación del asistente** | Preguntar: *«¿Qué decisiones debería tomar?»* | Distingue claramente hechos observados, análisis y recomendación accionable. |
| 8–10 | **5. Creación de un compromiso** | Pedir: *«Crea una acción para revisar este problema el viernes.»* | El asistente prepara una propuesta editable (no escribe a ciegas). |
| 10–12 | **6. Aprobación y ejecución segura** | Revisar tarjeta de propuesta, ajustar prioridad o fecha si conviene y pulsar **Aprobar**. | Control humano total, trazabilidad y cero cambios no autorizados. |
| 12–13 | **7. Consulta del resultado** | Abrir el tablero Kanban / Mis acciones y mostrar la nueva acción registrada con responsable y fecha. | De decisión en conversación a compromiso real en el tablero en segundos. |
| 13–15 | **8. Continuidad multicanal (opcional si está validado en Preview)** | Abrir **Voz por turnos (es-MX)** para hacer un seguimiento rápido o mostrar continuidad en **WhatsApp** con el mismo contexto autorizado y resumen escrito de acuerdos. | Dirigir la empresa desde el canal más cómodo sin perder contexto ni control. |

### Transparencia comercial obligatoria
- **Web (R1 + R2 + R3 + Executive MVP):** Funcional y validado localmente sobre PostgreSQL real con Auth/JWT/RLS.
- **Voz por turnos (R4):** Conversación por turnos en español de México con dictado, edición de transcripción, respuesta hablada, interrupción de audio, continuidad a texto, propuestas R2 seguras y resumen escrito de acuerdos. **No** se presenta como llamada en streaming en tiempo real.
- **WhatsApp (R0):** Adaptador conectado al mismo núcleo R1/R2/R3, formato breve (≤3 prioridades), notas de voz y confirmaciones inequívocas; envíos reales permanecen desactivados hasta autorización y aprovisionamiento de número/webhook en Preview QA.

---

## 2. Preparación de Preview Comercial Protegido

### 2.1 Infraestructura QA necesaria
- **Base de datos Supabase QA dedicada:** Crear proyecto nuevo dentro de la organización corporativa `vagzlhnotqtvkcqfviua` (donde viven DEV y PROD).
  - **Restricción crítica:** No reutilizar `TOOL SCRUMBAN` (`bcmeiyboqvpksjxfavfl`), no tocar DEV (`tgiuevzlyptzlfgxsfhj`) ni PROD (`xhpasmjzuwifmjhrsumb`).
  - **Bloqueo actual para provisión remota:** La sesión CLI local está autenticada en una cuenta Free personal sin acceso a la org `vagzlhnotqtvkcqfviua`. Requiere login/token autorizado de la organización corporativa.
- **Despliegue Vercel Preview protegido:**
  - Reutilizar la optimización **Lean Build** ya integrada (`build:vercel`, `tsconfig.api.json` incremental, 11/12 funciones Hobby sin `*.test.ts` en `api/`).
  - Activar **Vercel Deployment Protection** (Password / Vercel Auth) para impedir acceso público.

### 2.2 Migraciones SQL pendientes para Preview QA
Aplicar en orden sobre el proyecto Supabase QA limpio (nunca sobre DEV/PROD):
1. Esquema base + hotfixes R0/R1 (`20261118150000` .. `20261119150000`).
2. Motor R2 y compuerta fail-closed (`20261120120000_agent_apply_action_status.sql`).
3. Memoria y documentos R3 (`20261121150601_agent_memory_documents.sql`).
4. WhatsApp R0 P0001 y reconciliación CAS (`20261124120000_whatsapp_r0_checkpoint_p0001_and_reconciliation.sql`).
5. Corrección columna `uploaded_at` en dashboard OKR (`20261124130000_fix_operational_okr_dashboard_evidencias_uploaded_at.sql`).
6. Seed sintético controlado (`supabase/scripts/qa/seed_qa_environment.sql`).

### 2.3 Variables de entorno y feature flags (Preview Protegido)
| Variable / Flag | Valor recomendado en Preview QA | Propósito |
|---|---|---|
| `AGENT_ORCHESTRATOR_R1` | `1` | Habilita orquestador unificado R1 para Web, WhatsApp y Voz |
| `AGENT_MEMORY_R3` | `1` | Habilita recuperación documental/memoria R3 bajo RLS |
| `R2_EXECUTION_MODE` | `qa` (solo durante demo/QA; `disabled` al cerrar) | Habilita escrituras R2 con aprobación explícita |
| `COPILOT_R2_GATE` | `1` (junto con `agent_execution_gate.enabled = true` en QA) | Compuerta doble de ejecución R2 |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Secret QA + `gemini-2.5-flash` | Inteligencia conversacional natural en fallback |
| `WHATSAPP_DISPATCHER_ENABLED` | `0` (mantener apagado hasta autorización explícita) | Evita envíos salientes no autorizados |
| `VOICE_TTS_LIVE` / `ELEVENLABS_API_KEY` | `0` por defecto (`1` sólo si se autoriza TTS ElevenLabs) | Voz natural `es-MX` (fallback local navegador sin costo) |

### 2.4 Proveedores y presupuesto estimado de validación controlada
- **Gemini API (corrida controlada Frente C — 20 escenarios + 1 demo):** Cap configurado en `scripts/qa/run-gemini-real-validation.mjs` de `24 llamadas` / **`$0.25 USD`** (costo real estimado por corrida completa: `~$0.014 USD`).
- **ElevenLabs TTS (opcional para demo comercial con voz premium es-MX):** ~$1–$3 USD (plan Starter / créditos existentes; $0 USD usando voz es-MX del navegador).
- **WhatsApp Cloud API (opcional, sólo sandbox autorizado):** $0 USD en ventana de servicio de 24h con número de prueba autorizado.
- **Supabase QA + Vercel Preview:** Dentro de planes existentes de la organización.
- **Presupuesto total estimado de validación controlada:** **< $5 USD** (con tope duro programático en Gemini de `$0.25 USD`).

### 2.5 Identidades sintéticas de prueba (5 perfiles)
- `qa-superadmin@tc-local.test` (`super_admin`, áreas `OKRS`, `Dirección`)
- `qa-direccion@tc-local.test` (`Direccion`, áreas `OKRS`, `Dirección`)
- `qa-lider@tc-local.test` (`Operativo`, líder `Operaciones`)
- `qa-operativo@tc-local.test` (`Operativo`, área `Operaciones`, estrictamente aislado)
- `qa-analista@tc-local.test` (`Analista`, áreas `OKRS`, `Operaciones`)

### 2.6 Criterios objetivos de aceptación (Preview Comercial)
1. **Seguridad y permisos:** 0 fugas entre identidades/áreas; `Operativo` aislado bloqueado en lectura/escritura ajena; 0 bypass de R2 por el modelo.
2. **Calidad conversacional (Frente C):** ≥95% acierto en los 12 escenarios naturales + 10 casos borde; 0 métricas inventadas; latencia P95 ≤ 6.5 s.
3. **Integridad transaccional:** 100% propuestas con aprobación explícita, idempotencia cross-channel y 0 ejecuciones duplicadas bajo concurrencia.
4. **UX Escritorio y Móvil:** 0 solapamientos en 1440px y 390px; flujo demo completo ≤ 15 minutos.

### 2.7 Procedimiento de Rollback (< 2 minutos)
1. **Apagado inmediato de escrituras R2:** Ejecutar `UPDATE public.agent_execution_gate SET enabled = false;` en Supabase QA y fijar `R2_EXECUTION_MODE=disabled`, `COPILOT_R2_GATE=0` en Vercel Preview.
2. **Desactivar envíos externos:** Verificar `WHATSAPP_DISPATCHER_ENABLED=0` y `VOICE_TTS_LIVE=0`.
3. **Rollback SQL (si aplica):** Ejecutar `supabase/scripts/rollback_agent_apply_action_status.sql` y limpiar fixtures sintéticos (`tc-qa-*`, `assistant_pending_ops`).
4. **Rollback de despliegue:** Promover/revertir el Preview al último SHA congelado validado (`6cc67ba4cf222e39f9bfc271998629979726069e`).
