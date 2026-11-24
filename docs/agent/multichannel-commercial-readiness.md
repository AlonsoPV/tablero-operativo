# SCRUMBAN — Demostración Comercial (≤15 min) y Preparación de Preview Protegido

## 1. Demostración Comercial para Dirección General (máximo 15 minutos)

**Audiencia:** Dueño de empresa / Dirección General.  
**Regla de oro:** Cero jerga técnica. Todo con datos sintéticos verificados. La demostración Web es 100% autónoma y **no depende** del cierre remoto de WhatsApp ni de Voz. No presentar capacidades simuladas como activas en Producción.

### Narrativa de valor de negocio
SCRUMBAN devuelve visibilidad real sobre la operación, detecta bloqueos antes de que escalen, reduce el seguimiento manual por chat o correo, deja claras las responsabilidades, conecta objetivos estratégicos con acciones concretas y convierte decisiones de junta en compromisos trazables.

### Perfiles con permisos reales (sin elevar Dirección artificialmente)
- **Pasos 1–4 (Visibilidad ejecutiva):** `qa-direccion@tc-local.test` (`Direccion`, lectura corporativa real en `OKRS` y `Dirección`, sin privilegios artificiales de escritura en tableros operativos).
- **Pasos 5–7 (Decisiones convertidas en acciones y seguimiento):** `qa-lider@tc-local.test` (`Operativo` líder en `Operaciones`, permisos reales para proponer y aprobar compromisos R2 en su área).
- **Regla de seguridad:** Nunca se elevan permisos de `Direccion` únicamente para facilitar la demostración.

### Comandos locales reutilizables (sin SQL ni Docker manuales)
- `npm run demo:start` — Valida identidad local (`127.0.0.1:57421` / `qalocaltc20260000001`), bloquea DEV/PROD/TOOL SCRUMBAN, siembra datos sintéticos, abre `agent_execution_gate` únicamente para `project_ref = qalocaltc20260000001`, verifica `agent_execution_allowed() = true` y arranca la app con recuperación automática ante `Ctrl+C` o fallo inesperado.
- `npm run demo:reset` — Limpia operaciones de prueba y resiembra el dataset comercial sintético.
- `npm run demo:stop` — Detiene Vite, cierra la compuerta R2 específica, limpia residuales y verifica `agent_execution_allowed() = false`.

### Flujo demostrativo paso a paso (12–15 min)

| Min | Paso | Perfil real | Qué preguntar / mostrar | Valor visible para el dueño |
|---|---|---|---|---|
| 0–2 | **1. Diagnóstico ejecutivo** | `Direccion` | Abrir Asistente Web y preguntar: *«¿Qué necesita mi atención hoy?»* | Panorama inmediato de la operación sin perseguir reportes manuales. |
| 2–4 | **2. Prioridades y riesgos** | `Direccion` | Revisar tarjetas visuales Top 3 de prioridades, fechas y responsables. | Foco directivo inmediato: qué importa hoy y qué riesgo requiere atención. |
| 4–6 | **3. Análisis de un bloqueo** | `Direccion` | Preguntar: *«¿Qué está frenando a mi equipo?»* y abrir la acción bloqueada. | Detecta causa del retraso, responsable y tiempo sin avance antes de que escale. |
| 6–8 | **4. Recomendación ejecutiva** | `Direccion` | Preguntar: *«¿Qué decisiones debería tomar?»* | Separa hechos observados, diagnóstico y recomendación accionable. |
| 8–10 | **5. Decisión convertida en acción** | `Líder Operaciones` | Pedir: *«Crea una acción para revisar este problema el viernes.»* | Prepara propuesta R2 editable bajo permisos reales (nunca escribe a ciegas). |
| 10–12 | **6. Aprobación y trazabilidad** | `Líder Operaciones` | Revisar tarjeta de propuesta, ajustar fecha/prioridad y pulsar **Aprobar**. | Control humano total, auditoría completa y cero cambios no autorizados. |
| 12–13 | **7. Seguimiento de compromisos** | `Líder Operaciones` | Abrir tablero Kanban / Mis acciones y comprobar el nuevo compromiso activo. | De decisión en conversación a compromiso trazable en segundos. |
| 13–15 | **8. Continuidad multicanal** | `Líder Operaciones` | Abrir **Voz por turnos (es-MX)** (dictado, respuesta hablada, interrupción y paso a texto) y explicar arquitectura unificada con WhatsApp R0. | Dirigir la operación desde el canal más cómodo sin perder contexto ni control. |

### Distinción obligatoria: capacidades reales vs. proveedores simulados / pendientes
- **Reales y validados localmente:** Núcleo R1/R2/R3 + Executive MVP sobre PostgreSQL/Auth/RLS reales; UI Web escritorio y móvil; Voz por turnos (`SpeechRecognition` / `SpeechSynthesis` `es-MX`, $0 USD, interrupción y continuidad por texto).
- **Simulados / pendientes de provisión remota:** Motor LLM externo Gemini (bloqueado fail-closed hasta configurar clave gratuita sin facturación en `.env.gemini.local`); envíos reales de WhatsApp Cloud API (`WHATSAPP_DISPATCHER_ENABLED=0`, núcleo R0/SQL validado localmente); TTS premium de pago (`VOICE_TTS_LIVE=0`).

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

### 2.3 Matriz de flags por entorno y estrategia de activación progresiva
| Variable / Flag | Local Demo ($0) | Preview QA ($0) | Producción Dark (Inicial) |
|---|---|---|---|
| `AGENT_ORCHESTRATOR_R1` | `1` | `1` | `0` (Fase 1 -> `1` sólo lectura) |
| `AGENT_MEMORY_R3` | `1` | `1` | `0` (Fase 1 -> `1` bajo RLS) |
| `R2_EXECUTION_MODE` | `qa` | `qa` (solo durante sesión QA) | `disabled` (Fase 2 tras aprobación) |
| `COPILOT_R2_GATE` | `1` | `1` (con `project_ref` QA exacto) | `0` |
| `AI_ZERO_COST_ONLY` | `1` | `1` | `0` (cuando exista contrato/presupuesto) |
| `WHATSAPP_DISPATCHER_ENABLED` | `0` | `0` (Fase 4 Meta Test Sandbox) | `0` |
| `VOICE_TTS_LIVE` / `VOICE_STT_LIVE` | `0` / `0` (navegador `es-MX`) | `0` / `0` (navegador `es-MX`) | `0` / `0` |

**Alternativa de Preview comercial de menor costo y riesgo ($0 USD):**
- Crear 1 proyecto **Supabase Free dedicado para QA** dentro de la organización corporativa `vagzlhnotqtvkcqfviua` (sin reutilizar `TOOL SCRUMBAN`, sin tocar DEV ni PROD, sin planes de pago) + despliegue **Vercel Preview protegido** con Vercel Deployment Protection reutilizando el **Lean Build** (`11/12` funciones Hobby, 0 motores STT/TTS pesados en bundle).

**Activación progresiva recomendada:**
1. **Fase 1 (Lectura segura):** Web R1 + R3 + Executive MVP (`R2_EXECUTION_MODE=disabled`).
2. **Fase 2 (Acciones gobernadas):** Habilitar `agent_execution_gate` sólo para `project_ref` de QA y probar propuestas R2 con perfiles reales.
3. **Fase 3 (Voz $0):** Activar panel Voz por turnos (`SpeechRecognition` / `SpeechSynthesis` `es-MX`, sin costos ni dependencias serverless).
4. **Fase 4 (WhatsApp Sandbox $0):** Conectar Meta Test Phone Number con ventana entrante 24h y `WHATSAPP_DISPATCHER_ENABLED=0` hasta autorización explícita.

**Candidato final para Draft PR (sin push ni cambios remotos):**
- **Rama fuente:** `feature/multichannel-release` (preservando candidatos congelados `6cc67ba4`, `a504d46d`, `4d0b14db`).
- **Base sugerida:** `main` (Draft PR únicamente; prohibido merge o deploy automático hasta provisión de Supabase QA).
- **Verificación de compatibilidad Vercel:** `npm run build` + `node scripts/bundle-api.mjs` = `11/12` funciones serverless, 0 paquetes pesados de voz/IA.

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
1. **Apagado inmediato de escrituras R2:** Ejecutar `UPDATE public.agent_execution_gate SET enabled = false WHERE id = true AND project_ref = '<qa_project_ref>';` en Supabase QA y fijar `R2_EXECUTION_MODE=disabled`, `COPILOT_R2_GATE=0` en Vercel Preview.
2. **Desactivar envíos externos:** Verificar `WHATSAPP_DISPATCHER_ENABLED=0` y `VOICE_TTS_LIVE=0`.
3. **Rollback SQL (si aplica):** Ejecutar `supabase/scripts/rollback_agent_apply_action_status.sql` y limpiar fixtures sintéticos (`tc-qa-*`, `assistant_pending_ops`).
4. **Rollback de despliegue:** Promover/revertir el Preview al último SHA congelado validado (`6cc67ba4cf222e39f9bfc271998629979726069e`).

---

## 3. Fase 3 — Operación a Costo Cero ($0 USD), Voz Local y WhatsApp Meta Test Sandbox

### 3.1 Garantía estricta de costo cero configurable (`AI_ZERO_COST_ONLY=1`)
El registro desacoplado en `api/_shared/aiProviders.ts` mantiene `AI_ZERO_COST_ONLY` como **opción configurable** (nunca limita permanentemente el producto al modo determinista y preserva Gemini + proveedores de voz autorizados cuando el flag está apagado). Con `AI_ZERO_COST_ONLY=1`:
- **LLM (Gemini):** Solo habilita llamadas externas si existen modelo en allowlist gratuita (`gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.0-flash-lite`) y confirmación externa de facturación (`GEMINI_FREE_TIER_CONFIRMED=1`). **El prefijo de una API key (p. ej. `AIza...`) nunca acredita su modalidad de facturación.** Si no hay LLM autorizado y la consulta sale del núcleo determinístico R1/R2/R3, responde HTTP `503` transparente preservando contexto (sin degradar silenciosamente a IA falsa).
- **STT (Voz → Texto):** Usa `SpeechRecognition` del navegador en `es-MX` (nota: en navegadores como Chrome/Edge puede depender de servicios cloud del proveedor del navegador; no garantiza procesamiento 100% local) con fallback inmediato a texto. Opcionalmente admite adaptador HTTP loopback-only (`LOCAL_STT_URL=http://127.0.0.1:<puerto>/...`, p. ej. Whisper / faster-whisper).
- **TTS (Texto → Voz):** Usa `SpeechSynthesis` del navegador priorizando voces `es-MX` (nota: no garantiza que todas las voces sean locales, ya que algunos navegadores exponen voces online; el fallback visual permanece intacto). Opcionalmente admite adaptador HTTP loopback-only (`LOCAL_TTS_URL=http://127.0.0.1:<puerto>/...`, p. ej. Kokoro / Piper). **Las licencias de cada modelo y voz individual deben verificarse antes de uso comercial. Ningún adaptador local se presenta como infraestructura cloud de Producción ni se empaqueta en Vercel Serverless.**

### 3.2 Matriz comparativa de Voz a Costo Cero (Fase 3 / Fase 4)

| Capa | Alternativa | Licencia / Uso Comercial | Latencia | Privacidad / Móvil | Costo | Veredicto |
|---|---|---|---|---|---|---|
| **STT** | Browser `SpeechRecognition` (`es-MX`) | Sujeto a términos del navegador | ~200–400 ms | **Puede depender de servicios externos del navegador** (Chrome/Edge); fallback a texto en Safari/Firefox | **$0** | **Por defecto en demo $0** (0 KB serverless, edición previa al envío) |
| **STT** | `faster-whisper` / Whisper local | Verificar licencia individual del modelo/checkpoint | ~0.8–2.5 s CPU | 100% local offline; requiere Python ≤3.12 + `ffmpeg` + pesos (no compatible sin fricción en Python 3.14 Windows actual) | **$0** | **Adaptador opcional loopback (`LOCAL_STT_URL`)** sólo dev/demo local |
| **TTS** | Browser `SpeechSynthesis` (`es-MX`) | Sujeto a términos del SO/navegador | < 50 ms | **No garantiza que todas las voces sean locales** (coexisten voces OS locales y voces cloud del navegador) | **$0** | **Por defecto en demo $0** (0 KB serverless, cero dependencias) |
| **TTS** | Kokoro / Piper local | Verificar licencia individual de modelo y voz específica | ~0.3–1.2 s CPU | 100% local offline; requiere servicio separado en loopback (`127.0.0.1`) | **$0** | **Adaptador opcional loopback (`LOCAL_TTS_URL`)** sólo dev/demo local |
| **TTS** | ElevenLabs Free Tier | **No apto para uso comercial en plan Free** (requiere plan comercial autorizado) | ~400–900 ms | Nube externa | $0 (no comercial) | **Descartado para demo comercial $0** |

### 3.3 Dataset Sintético de Demostración Comercial (`[DEMO-CORP]`) y Comandos Idempotentes
- **Empresa sintética:** *Logística Norte Demo S.A. de C.V.* (100% ficticia, separada de fixtures QA `tc-qa-*`).
- **Comandos seguros locales (exclusivamente `scrumban-tc-local` / `127.0.0.1`, fail-closed contra remotos):**
  - Iniciar demo local: `npm run demo:start`
  - Reiniciar/restaurar dataset comercial: `npm run demo:reset`
  - Detener demo y cerrar compuerta R2: `npm run demo:stop`
- **Versión Web independiente (fallback sin voz):** Todo el guion de 15 minutos opera 100% desde el Asistente Web con tarjetas ejecutivas, citas documentales R3, propuestas R2 editables y tablero Kanban real en PostgreSQL local, sin requerir micrófono ni APIs externas de pago. No se modifican los permisos reales de `Dirección` para facilitar la demo.

### 3.4 Procedimiento de Validación WhatsApp (Meta Test Number — para autorización posterior)
> **Estado actual:** R0 validado localmente (`feature/r0-whatsapp-connected` + integrado en `feature/multichannel-release`). **No se han enviado mensajes reales**, `WHATSAPP_DISPATCHER_ENABLED=0`, sin seguimientos proactivos ni números de Producción.

Cuando se otorgue autorización explícita en una fase posterior para validar Meta Cloud API:
1. **Verificar aislamiento y tarifas en Meta Business Manager:** Confirmar que el número es un **Meta Test Phone Number** (no Producción), con destinatarios en lista blanca (*Test Recipient Numbers*), y **verificar explícitamente las reglas de cobro vigentes** en Meta Business Manager (**la ventana de 24 horas no garantiza gratuidad universal** en todas las regiones, categorías ni políticas futuras).
2. **Iniciar por mensaje entrante del usuario de prueba:** Evitar plantillas salientes y mantener `WHATSAPP_DISPATCHER_ENABLED=0`.
3. **Configurar webhook aislado en Preview Protegido QA:** Apuntar el webhook únicamente al endpoint QA protegido validando `X-Hub-Signature-256`.
4. **Checklist de pruebas controladas (máximo 5 mensajes sintéticos):** texto entrante Top 3, nota de voz sintética (≤15 s en memoria sin persistencia), propuesta R2 + confirmación inequívoca, rechazo ante confirmación ambigua y rechazo para rol sin permiso.
5. **Cierre obligatorio:** Apagar `agent_execution_gate`, mantener `WHATSAPP_DISPATCHER_ENABLED=0`, desconectar webhook de prueba y limpiar registros sintéticos.

