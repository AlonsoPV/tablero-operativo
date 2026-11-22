# R4 Pilot · preflight final (no conectar)

**R4 NO-GO. GO QA NO-GO.** Worktree limpio al emitir este preflight. Última suite local: **60/60 PASS** (no se reejecutó: sin cambios relevantes pendientes).

`connect` en el adaptador Retell R4 sigue **siempre `false`**. Aunque se den de alta secretos y `LIVE_OK`, este código **no abre red**.

## A. Preparación local (ya hecha)

| Acción | Responsable | Evidencia | Estado | Riesgo si falta |
| --- | --- | --- | --- | --- |
| Suite `api/_shared/r4` + lab | Ingeniería | 60 tests verdes | SIMULATED PASS | Regresión silenciosa antes del piloto |
| Aislamiento `r4-pilot` ≠ QA A/B, DEV, PROD, Preview R3 | Release | `R4_PILOT_FORBIDDEN_TARGETS`, `provisioned: false` | IMPLEMENTED LOCAL | Contaminar entornos de producto |
| Fail-closed sin flag / sin `LIVE_OK` / sin `RETELL_R4_*` | Seguridad | `resolveRetellR4LiveGate` | SIMULATED PASS | Llamada accidental a Retell |
| Rechazo si `RETELL_R4_AGENT_ID` = Guía o entrevistas | Voice | `guide_agent_reuse_denied` | SIMULATED PASS | Hablar con el agente de Guía |
| Secretos `VITE_RETELL*` bloqueados | Seguridad | `secret_on_client` | SIMULATED PASS | API key en el bundle |
| Consentimiento, 1 sesión/liga, token 30 s un uso, confirmación autenticada, sin fallback | Seguridad | orquestador + `sessionCredentials` | SIMULATED PASS | Sesión pública o token reutilizado |
| Kill switch documentado | Release | Quitar `AGENT_VOICE_R4`, `LIVE_OK`, `VITE_AGENT_VOICE_R4` | IMPLEMENTED LOCAL | No hay rollback de flags |
| Techo 15 min / 1 concurrente | Release | `R4_PILOT_MAX_SESSION_MS` | IMPLEMENTED LOCAL | Costo o sesión colgada (en real: REAL NOT TESTED) |
| AT-16/AT-20 sintéticos | QA | `at16Evidence`, `sharedIntent` | SIMULATED PASS | Oráculo inexistente |

## B. Validación real (pendiente — no ejecutar)

### Recursos externos a provisionar (aún no)

1. Entorno Vercel **`r4-pilot`** (preview dedicado, sin promote a PROD).
2. Agente Retell **nuevo** (no clonar IDs de Guía ni entrevistas).
3. API key **R4** distinta de `RETELL_API_KEY` de Guía.
4. Observador + participante con sesión **ya existente**.
5. Tope USD acordado (Retell cobra por minuto; sin cifra inventada).

### Pasos de creación del agente (cuando se autorice; **no hacer ahora**)

1. En consola Retell: **Create agent** con nombre explícito `scrumban-r4-pilot`.
2. Copiar el `agent_id` nuevo → irá a `RETELL_R4_AGENT_ID`. Comprobar que **≠** `RETELL_GUIDE_AGENT_ID` y **≠** `RETELL_AGENT_ID`.
3. No publicar tools hacia `/api/guide-retell-tool` ni el webhook de Guía.
4. Webhook/tools R4: **vacío** en la primera sesión (solo conversación + oráculo de intención). Sin Graph, sin OpenAI.
5. Guardar captura del agent id y de la fecha de creación.

### Grabación / transcripción / retención en el proveedor

`AGENT_VOICE_R4_RETAIN_AUDIO` **no** controla Retell. Verificar en consola del **agente nuevo**, con captura:

| Control Retell | Esperado en piloto mínimo | Cómo evidenciar |
| --- | --- | --- |
| Call recording / audio storage | Off (o el valor acordado por escrito) | Screenshot del agente R4, no del de Guía |
| Transcript stored by provider | Off o retención mínima documentada | Mismo screenshot + política de cuenta |
| Data retention / PII | Plazo explícito; no “indefinido” | Política de cuenta Retell |
| Post-sesión | Ningún audio nuevo en el dashboard | Lista de calls del agente R4 vacía o 1 call al cierre |

Hasta ver esas pantallas: **REAL NOT TESTED**.

### Secretos server-side (cuando se autorice; **no configurar ahora**)

1. Solo en entorno `r4-pilot`: `RETELL_R4_API_KEY`, `RETELL_R4_AGENT_ID`.
2. Nunca `VITE_`. Nunca rellenar `RETELL_API_KEY` / `RETELL_GUIDE_AGENT_ID` para R4.
3. `AGENT_VOICE_R4` y `LIVE_OK` **siguen apagados** hasta la orden de conectar. Hoy, aun con ambos en `1` y claves presentes, el código responde `connect_blocked`.
4. Evidencia: listado de env vars **sin valores** (nombres + target `r4-pilot`).

### Controles de consumo, timeout, revocación, kill switch (real)

| Control | Valor local | Pendiente en real |
| --- | --- | --- |
| Duración | 15 min | Cronómetro del observador + corte manual |
| Concurrencia | 1 | Segunda pestaña → `session_occupied` |
| Token | 30 s, un uso | No reutilizar access token de Retell |
| Timeout de turno | orquestador simulado | Confirmar hang de red → error, no “éxito” |
| Revocación de liga | store en memoria | Revocar y ver `revoked` |
| Kill switch | quitar flags | Quitar env en Vercel `r4-pilot` y no promote |

### Protocolo de la sesión (máx. 15 min) — no ejecutar

1. Observador + dueño autenticado (cuenta existente).
2. Consentimiento mic + alcance **antes** de conectar.
3. Una sola pestaña / una liga.
4. Oráculo: pendiente, vencidas, una propuesta **sin** confirmar en voz pública, deny de confirmación pública.
5. End único; segundo end → duplicate.
6. Corte inmediato si: agent id de Guía, grabación inesperada, segunda sesión, fallback a OpenAI/Guía, PII de terceros.
7. Kill switch y no merge/push/deploy.

### Evidencia AT-16 / AT-20 (real, no recogida)

**AT-16:** un PDF/informe de esa sesión; `sessionId` + `finalizedAt`; `evidenceLabel`; dueño lee / otro no; segundo cierre duplicate; sin blob de audio local; códigos de error si se corta.

**AT-20:** mismo corpus en web vs voz R4 (familias de `interpretSharedIntent`). WhatsApp Graph **fuera**. OpenAI **fuera**. Confirmación pública deny.

## C. Autorizaciones GO/NO-GO

| # | Acción | Quién autoriza | Evidencia | Estado | Riesgo si se salta |
| --- | --- | --- | --- | --- | --- |
| 1 | Crear entorno Vercel `r4-pilot` (no QA/DEV/PROD/Preview R3) | Release + Producto | Project/env name + “Promote to production = no” | NO-GO / REAL NOT TESTED | Secretos o tráfico en producto |
| 2 | Crear agente Retell `scrumban-r4-pilot` | Voice + Seguridad | Agent id ≠ Guía/entrevistas | NO-GO | Voz R4 entra a Guía |
| 3 | Alta `RETELL_R4_API_KEY` solo server-side en `r4-pilot` | Seguridad | Lista de env **sin valores** | NO-GO | Key de Guía o key en cliente |
| 4 | Verificar recording/transcript/retención en consola Retell | Seguridad + Voice | Screenshots del agente R4 | NO-GO | Audio/PII en Retell sin acuerdo |
| 5 | Tope USD + ventana 15 min | Operador / Producto | Número escrito **antes** de la llamada | NO-GO | Costo abierto |
| 6 | Participante informado (audio, proveedor, retención) | Producto | Consentimiento firmado/oral registrado | NO-GO | Incumplimiento de consentimiento |
| 7 | Encender `AGENT_VOICE_R4` / `LIVE_OK` **solo** en `r4-pilot` | Release | Diff de env del target; QA/DEV/PROD intactos | NO-GO | Lab o prod con LIVE |
| 8 | Orden explícita de **conectar** (hoy `connect=false` en código) | Ingeniería + Release | Cambio de código **futuro** + este GO | NO-GO | Nadie puede “conectar” solo con flags |
| 9 | Ejecutar la sesión de 15 min | Voice + observador | Grabación de evidencia AT-16/20 | NO-GO / REAL NOT TESTED | Piloto fantasma |
| 10 | Merge, push, deploy, GO QA | Release | N/A | **NO-GO** | R3/Guía/QA contaminados |

**Preparación local:** lista para un GO de *papeles*.  
**Validación real:** ninguna fila 1–10 está GO.

Siguiente paso autorizado **después** de 1–8: un incremento de código que habilite `connect` de forma explícita. Ese incremento **no** forma parte de este preflight.
