# Guía — guía completa para replicar la funcionalidad

Documento operativo para **clonar Guía** en otro proyecto o entorno. Describe lo que está implementado hoy en What2Do (texto + voz Retell + diario + ligas personales + pilares), no solo la propuesta inicial.

> **No confundir con el Asistente operativo**: Chat / Voz-acciones crean trabajo de negocio. **Guía** es acompañamiento reflexivo privado.

## Estado en este repo (Tablero Operativo)

MVP **texto + diario** integrado en el agente IA (`AiAssistPage` → pestaña **Guia**):

| Pieza | Ubicación |
| --- | --- |
| UI | `src/features/guide/components/GuidePanel.tsx` (FAB y `/asistente-ia`) |
| Cliente | `src/features/guide/services/guide.service.ts` |
| API | `api/guide-chat.ts` (Gemini por defecto; Claude opcional) |
| Migración | `supabase/migrations/20261101120000_create_guide_companion.sql` |

Pendiente respecto a What2Do: Retell (voz), webhook, pilares, ligas públicas, rutas `/guia*`.

Docs relacionadas (detalle fino):

- [retell-guide-setup.md](./retell-guide-setup.md) — dashboard Retell, webhook, custom function, post-call fields  
- [guia-agente-arquitectura-prompt.md](./guia-agente-arquitectura-prompt.md) — prompt global y diseño original  
- [guide-reflection-close.md](./guide-reflection-close.md) — cierre y reflexión de diario  
- [environment-variables.md](./environment-variables.md) — dónde van secrets vs `VITE_*`

---

## 1. Qué es Guía (producto)

Guía es un **acompañante conversacional reflexivo** de 15 minutos, privado por usuario:

| Canal | Tecnología | Persistencia |
| --- | --- | --- |
| Texto | Claude vía `POST /api/guide-chat` | `guide_sessions` (`provider=text`) + `guide_messages` |
| Voz | Retell Web Call (`retell-client-js-sdk`) | `guide_sessions` (`provider=retell`) + transcript + webhook |
| Diario | Reflexión generada al cerrar | `guide_journal_entries` (+ `guide_pillar_observations`) |
| Acceso sin login | Liga personal (hash SHA-256) | `guide_user_links` |

**No es** terapia, médico ni coach clínico. En riesgo: 911 / Línea de la Vida `800 911 2000` (MX).

**Gate de acceso:** el usuario debe tener Entendimiento en `submitted` o `approved` antes de iniciar voz (validado en `create-guide-retell-web-call`).

---

## 2. Rutas de la app

| Ruta | Archivo | Quién |
| --- | --- | --- |
| `/guia` | `src/pages/guia/GuidePage.tsx` | Autenticado — hub texto / CTA a voz |
| `/guia/voz` | `src/pages/guia/GuideVoicePage.tsx` | Autenticado — llamada Retell |
| `/guia/diario` | `src/pages/guia/GuideJournalPage.tsx` | Autenticado — historial + pilares |
| `/guia/invitacion/:token` | `src/pages/guia/PublicGuideInvitationPage.tsx` | Público — valida liga |
| `/guia/invitacion/:token/voz` | `GuideVoicePage` (mismo componente con `token`) | Público — voz por liga |

Constantes: `ROUTES.GUIA*` en `src/constants/index.ts`.  
Registro lazy en `src/routes/index.tsx` (invitaciones fuera del layout autenticado).

---

## 3. Mapa de archivos (copiar / adaptar)

### Frontend

| Archivo | Rol |
| --- | --- |
| `src/features/guide/types.ts` | Tipos de sesión, mensaje, diario, pilares |
| `src/features/guide/services/guide.service.ts` | Cliente: Retell call, chat, close, journal, ligas |
| `src/features/guide/hooks/useGuide.ts` | React Query keys + hooks |
| `src/features/guide/components/GuidePersonalLinkButton.tsx` | Admin crea liga desde UI |
| `src/features/guide/pillar-progress.ts` | Diff de pilares entre sesiones |
| `src/pages/guia/GuidePage.tsx` | Chat texto 15 min |
| `src/pages/guia/GuideVoicePage.tsx` | UI llamada + `RetellWebClient` |
| `src/pages/guia/GuideJournalPage.tsx` | Diario + mapa de pilares |
| `src/pages/guia/PublicGuideInvitationPage.tsx` | Landing de liga |
| `api/guide-chat.ts` | Turno Claude + cierre texto + reflexión |

### Edge Functions (Supabase, `--no-verify-jwt`)

| Función | Rol |
| --- | --- |
| `create-guide-retell-web-call` | Crea sesión + web call Retell (JWT o `guide_token`) |
| `guide-retell-webhook` | Firma Retell → transcript, cierre, diario, pilares |
| `guide-session-state` | Custom Function Reloj (`x-guide-tool-secret`) |
| `create-guide-user-link` | Admin genera liga (solo hash en DB) |
| `validate-guide-user-link` | Valida token público |
| `reprocess-guide-map` | Reprocesa pilares de una sesión |

Shared:

- `supabase/functions/_shared/guide-reflection.ts`
- `supabase/functions/_shared/guide-continuity.ts`
- `supabase/functions/_shared/guide-pillar-analysis.ts`

### Migraciones

| Migración | Contenido |
| --- | --- |
| `20260824120000_create_guide_companion.sql` | profiles, sessions, messages, transcripts, events, journal, memories, knowledge + RLS |
| `20260827235701_create_guide_user_links.sql` | Ligas bearer (hash only) |
| `20260902070744_add_guide_wellbeing_pillar_history.sql` | `guide_pillar_observations` |

### Scripts

```bash
npm run supabase:deploy:guide:what2do
# o, si el CLI falla en Windows:
npm run supabase:deploy:guide:what2do:api
# → scripts/deploy-guide-functions-what2do.ps1 (requiere SUPABASE_ACCESS_TOKEN)
```

Dependencia npm: `retell-client-js-sdk`.

---

## 4. Modelo de datos (resumen)

### `guide_sessions`

- `provider`: `text` \| `retell`
- `status`: `active` \| `closing` \| `completed` \| `abandoned` \| `safety_ended`
- Reloj inmutable: `started_at` + `expires_at` ≤ 15 min (CHECK + trigger `guide_protect_session_clock`)
- Índice único parcial: **una sola** sesión `active/closing` por usuario
- Voz: `provider_session_id` = `call_id` de Retell

### `guide_messages`

Solo sesiones de **texto**. `sequence` único por sesión; roles `user` \| `assistant`.

### `guide_session_transcripts`

Una fila por sesión de voz; `provider_call_id` único; `transcript_object` jsonb array.

### `guide_provider_events`

Idempotencia webhook: `UNIQUE (provider, provider_event_id)`.

### `guide_journal_entries`

Una por sesión (`session_id` UNIQUE). Campos: `topic`, `summary`, `learning`, `intention`, `reflection_question`, más `user_words` / `agent_inferences`.

### `guide_pillar_observations`

Seis pilares: `presence`, `relationships`, `purpose`, `stability`, `health`, `congruence`.  
Score 1–5; ausencia = sin información (nunca cero). UI filtra `confidence >= 0.45`.

### `guide_memories` / `guide_profiles` / knowledge

Diseñados para continuidad y preferencias. El arranque de voz compacta preferencias + memorias activas + diario reciente + historial de pilares en variables dinámicas Retell.

### `guide_user_links`

Token plano **solo en la URL**; DB guarda `token_hash` SHA-256. Sin acceso Data API para `anon`/`authenticated` (solo service role).

**RLS:** datos personales filtrados por `usuario_id = get_my_usuario_id()`. Nunca compartir filas entre usuarios de la misma empresa.

---

## 5. Variables de entorno

### Supabase Edge Secrets (sin `VITE_`)

| Secret | Uso |
| --- | --- |
| `RETELL_API_KEY` | API Retell + verificación firma webhook |
| `RETELL_GUIDE_AGENT_ID` | Agente Guía (**no** reutilizar `RETELL_AGENT_ID` de entrevistas) |
| `GUIDE_RETELL_TOOL_SECRET` | Header `x-guide-tool-secret` en `guide-session-state` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Admin client |
| `ANTHROPIC_API_KEY` | Reflexión en webhook (y reprocess) |
| `GUIDE_REFLECTION_MODEL` | Opcional; fallback `GUIDE_CLAUDE_MODEL` / `CLAUDE_MODEL` / Haiku |
| `APP_PUBLIC_URL` | Base para armar ligas (`https://whatwedo.vercel.app`) |

### Vercel / API local (`api/guide-chat.ts`)

| Variable | Uso |
| --- | --- |
| `ANTHROPIC_API_KEY` | Turnos de chat texto + reflexión al cerrar |
| `GUIDE_CLAUDE_MODEL` | Modelo preferido Guía |
| `CLAUDE_MODEL` / `CLAUDE_FALLBACK_MODEL` | Fallback |
| `GUIDE_CLAUDE_MAX_TOKENS` | Default ~300 (respuestas cortas) |
| `GUIDE_CLAUDE_TEMPERATURE` | Default ~0.65 |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Rest con JWT del usuario (RLS) |

---

## 6. Flujo A — Chat por texto

```text
GuidePage
  → guideService.startSession(usuarioId)
      INSERT guide_sessions provider=text, expires_at=+15m
  → usuario escribe
  → INSERT guide_messages (role=user)
  → POST /api/guide-chat { session_id }
      - lee sesión + últimos 14 mensajes (JWT)
      - Claude con SYSTEM_PROMPT + remaining_seconds
      - INSERT guide_messages (role=assistant)
  → al terminar / timer 0
  → POST /api/guide-chat { session_id, action: 'close', reason }
      - generateReflection(todos los mensajes)
      - upsert guide_journal_entries
      - UPDATE session status=completed
```

### Contrato `POST /api/guide-chat`

**Turno**

```json
{ "session_id": "<uuid>" }
```

Respuesta OK: `{ "answer": "...", "remaining_seconds": 842, "sequence": 4 }`

**Cierre**

```json
{ "session_id": "<uuid>", "action": "close", "reason": "user_requested" | "time_limit" }
```

- Solo `provider=text`. Voz responde `409` (la reflexión la hace el webhook).
- Genera reflexión leyendo **todos** los mensajes de la sesión (no el array de la UI).

### Reglas de prompt texto (resumen)

- Español cálido, 2–5 frases, &lt;120 palabras, una pregunta principal.
- No terapia / no diagnósticos / no dependencia.
- Seguridad: pregunta directa; 911 / Línea de la Vida.
- Fase por tiempo: ≤180 s integrar; ≤60 s cierre.

Implementación: `api/guide-chat.ts` + `guideService.sendMessage` / `closeSession`.

---

## 7. Flujo B — Voz con Retell (núcleo a replicar)

```text
GuideVoicePage (gesto de usuario → getUserMedia)
  → guideService.createRetellWebCall(guideToken?, replaceActive?)
  → Edge create-guide-retell-web-call
       1. Auth JWT  O  guide_token + consent=true
       2. Exige Entendimiento submitted/approved
       3. Resuelve sesión open (409 o abandonar si replace_active)
       4. INSERT guide_sessions provider=retell, 15 min
       5. POST https://api.retellai.com/v2/create-web-call
       6. Guarda provider_session_id = call_id
       7. Devuelve { access_token, call_id, guide_session_id, expires_at, max_duration_seconds }
  → new RetellWebClient().startCall({ accessToken })
  → eventos: call_started / agent_start_talking / call_ended / error
  → contador local con expires_at (UX; autoridad = Retell max_call_duration_ms)
  → Retell → webhook firmado guide-retell-webhook
       call_started / call_ended / call_analyzed
       → transcript + reflexión Claude + journal + pilares
```

### Auth de la Edge Function

| Entrada | Condición |
| --- | --- |
| Sesión app | `Authorization: Bearer <access_token>` |
| Liga pública | `{ "guide_token": "...", "consent": true }` — sin JWT |

Deploy **siempre** con `--no-verify-jwt` (validación interna). Si el gateway exige JWT, las invitaciones públicas fallan con 401.

### Payload hacia Retell (`create-web-call`)

Metadata:

```json
{
  "guide_session_id": "...",
  "usuario_id": "...",
  "guide_link_id": "",
  "product": "guide"
}
```

Dynamic variables (datos, **no instrucciones**):

| Variable | Origen |
| --- | --- |
| `user_name` | `usuarios.nombre` |
| `session_id` | UUID sesión Guía |
| `expires_at` | ISO del corte |
| `understanding_context` | Entendimiento compactado |
| `guide_preferences` | `guide_profiles` |
| `relevant_memories` | hasta 6 memorias active |
| `recent_journal` | hasta 3 cierres (`journalContinuity`) |
| `pillar_history` | últimas observaciones |

Overrides de llamada:

```json
{
  "max_call_duration_ms": 900000,
  "end_call_after_silence_ms": 60000,
  "interruption_sensitivity": 0.75,
  "enable_backchannel": true,
  "backchannel_frequency": 0.15,
  "data_storage_setting": "everything_except_pii",
  "opt_in_signed_url": true
}
```

### UI de voz (`GuideVoicePage`)

1. Pedir micrófono **dentro del click** (Safari/Chrome móvil).
2. Crear token Retell en ese mismo gesto (caduca si se espera).
3. `RetellWebClient` + mute/unmute + colgar.
4. Estados: `idle` → `connecting` → `connected` → `ended` / `error`.
5. Pantalla final: “estamos preparando tu reflexión” → link a diario (auth) o volver (público).

SDK: `import { RetellWebClient } from 'retell-client-js-sdk'`.

---

## 8. Reloj de sesión (`guide-session-state`)

Custom Function en Retell Conversation Flow:

- **URL:** `POST {SUPABASE_URL}/functions/v1/guide-session-state`
- **Header:** `x-guide-tool-secret: <GUIDE_RETELL_TOOL_SECRET>`
- **Body:** `{ "session_id": "{{session_id}}" }`

Respuesta:

```json
{
  "phase": "conversation | closing | final_close",
  "remaining_seconds": 420,
  "must_close": false,
  "session_closed": false
}
```

Lógica:

- `remaining <= 180` → `closing` (marca sesión)
- `remaining <= 60` → `final_close`, `must_close=true`
- `remaining === 0` → completa sesión con `close_reason=time_limit`

Protocolo del agente: llamar al inicio y como máximo cada 2 intervenciones del usuario. El corte duro lo impone Retell (`900000` ms), no el navegador.

---

## 9. Webhook Retell (`guide-retell-webhook`)

URL ejemplo:

```text
https://<PROJECT_REF>.supabase.co/functions/v1/guide-retell-webhook
```

Eventos: `call_started`, `call_ended`, `call_analyzed`.

1. Validar `x-retell-signature` con `RETELL_API_KEY` (SDK Retell).
2. Guardar evento idempotente en `guide_provider_events`.
3. Asociar por `call_id` / metadata `guide_session_id`.
4. Persistir transcripción en `guide_session_transcripts`.
5. Si no hay transcript en `call_ended`, esperar `call_analyzed`.
6. Generar reflexión con Claude (`_shared/guide-reflection` / prompt embebido).
7. Upsert `guide_journal_entries` (una por sesión).
8. Extraer pilares desde `custom_analysis_data` (campos escalares `pillar_<key>_*` o JSON legacy).
9. Completar sesión (`completed` / razones).

Post-call fields recomendados: ver [retell-guide-setup.md](./retell-guide-setup.md) (`topic`, `summary`, `learning`, `intention`, `reflection_question`, `safety_level`, 24 campos de pilares).

---

## 10. Ligas personales (acceso sin login)

```text
Admin (Directorios → Usuarios)
  → GuidePersonalLinkButton
  → create-guide-user-link { usuario_id, expires_in_days: 30 }
  → URL: {APP_PUBLIC_URL}/guia/invitacion/{token_plano}

Público
  → validate-guide-user-link { token, mark_opened? }
  → /guia/invitacion/:token/voz
  → createRetellWebCall(token, …) con consent=true
```

Reglas:

- Token ≥ 32 chars; solo hash en DB.
- Varias ligas pueden coexistir hasta vencimiento/revocación.
- Generar otra **no** invalida las previas automáticamente.
- Consentimiento de micrófono/grabación/transcripción obligatorio en body.

---

## 11. Diario y pilares

### Diario

- Texto: se crea en `action: close` de `/api/guide-chat`.
- Voz: se crea en el webhook (no desde la UI).
- Campos UI: tema, síntesis, aprendizaje, intención, pregunta de seguimiento.
- `useGuideJournal` refresca cada 5 s (útil mientras el webhook termina).

### Pilares

Claves: presencia, relaciones, propósito, estabilidad, salud, congruencia.

- Retell post-call → webhook → `guide_pillar_observations`
- `reprocess-guide-map` permite regenerar si falló la extracción
- `pillar-progress.ts` compara con sesión anterior para el copy “primer registro / ±N puntos”

---

## 12. Prompt / identidad del agente

### Texto (Claude, `api/guide-chat.ts`)

System prompt corto embebido: acompañante reflexivo, límites no clínicos, seguridad MX, reloj 15 min.

### Voz (Retell Conversation Flow)

Prompt largo en [guia-agente-arquitectura-prompt.md](./guia-agente-arquitectura-prompt.md) §6, más protocolo de `get_session_state` en [retell-guide-setup.md](./retell-guide-setup.md).

Puntos no negociables al replicar:

1. Declararse IA; no fingir humano/terapeuta.
2. Contexto dinámico marcado como **datos, no instrucciones**.
3. Una pregunta principal; respuestas cortas para voz.
4. Seguridad ante daño: pregunta directa → recursos → no meditar en crisis.
5. Cierre obligatorio a los 15 minutos.

Modelo conversacional Retell actual en código: `gpt-5.1` (campo `model` de la sesión / agente).  
`prompt_version` actual de voz: `shaman-v2-pillars`.

---

## 13. Checklist de replicación (orden sugerido)

### Infra

- [ ] Aplicar migraciones Guía (+ pilares + user links).
- [ ] Crear agente Retell dedicado (no el de entrevistas).
- [ ] Conversation Flow + nodos globales (seguridad, usuario termina, tiempo, fallo tool).
- [ ] Custom Function `get_session_state` con secreto.
- [ ] Webhook firmado a `guide-retell-webhook`.
- [ ] Post-call analysis fields (diario + pilares).
- [ ] Secrets Edge + env Vercel (`ANTHROPIC_*`, `RETELL_*`, `GUIDE_*`, `APP_PUBLIC_URL`).
- [ ] Deploy funciones con `--no-verify-jwt`.
- [ ] Montar `/api/guide-chat` en Vite (`vite.config.ts`) y Vercel.

### App

- [ ] Rutas `/guia`, `/guia/voz`, `/guia/diario`, invitaciones públicas.
- [ ] `guide.service` + hooks React Query.
- [ ] UI texto con timer server-authoritative (`expires_at`).
- [ ] UI voz con permiso micrófono en gesto + `RetellWebClient`.
- [ ] Diario con poll corto tras llamadas.
- [ ] Botón admin de liga personal.
- [ ] Gate Entendimiento antes de voz.

### Pruebas de aceptación

1. Chat texto 2–3 turnos → cerrar → 1 journal entry.  
2. Voz autenticada &lt; 15 min → transcript + journal (esperar `call_analyzed`).  
3. Voz llega a ~15 min → corte Retell; sesión no queda `active`.  
4. Liga pública: validar, consentir, llamar, journal del usuario dueño (no del visitante).  
5. Usuario B no ve mensajes/diario de A (RLS).  
6. `get_session_state` con secreto malo → 401.  
7. Sin Entendimiento → error al crear web call.  
8. Segunda sesión open sin `replace_active` → 409.  
9. Pilares: solo pilares discutidos; ausentes ≠ 0.  
10. Tests locales:  
    `vitest` `guide-reflection`, `guide-continuity`, `guide-pillar-analysis`, `pillar-progress`.

---

## 14. Contratos TypeScript (referencia rápida)

```ts
type GuideSession = {
  id: string
  usuario_id: string
  provider: 'text' | 'retell'
  provider_session_id: string | null
  status: 'active' | 'closing' | 'completed' | 'abandoned' | 'safety_ended'
  started_at: string
  expires_at: string
  // ...
}

// create-guide-retell-web-call response
type CreateGuideCallResult = {
  access_token: string
  call_id: string
  guide_session_id: string
  expires_at: string
  max_duration_seconds: number // 900
}
```

Cliente voz mínimo:

```ts
const session = await guideService.createRetellWebCall()
const client = new RetellWebClient()
client.on('call_ended', () => { /* UI ended */ })
await client.startCall({ accessToken: session.access_token })
```

---

## 15. Diferencias críticas vs Asistente

| | **Guía** | **Asistente** |
| --- | --- | --- |
| Objetivo | Acompañamiento personal / diario | Acciones operativas Lean |
| Voz entrada | Retell (agente conversacional) | Web Speech API (dictado → texto) |
| Voz salida | Voz del agente Retell | ElevenLabs `SpeechButton` (lectura) |
| Backend IA turno | Retell LLM / Claude texto | Claude `/api/assistant-audio` |
| Persistencia | Sesiones + journal privados | Acciones Kanban/taskpool |
| Duración | 15 min duros | Sesión libre hasta reset |

Si alguien pide “replicar la voz de Guía”, el camino es **Retell Web Call + webhook + session-state**, no ElevenLabs ni `SpeechRecognition`.

---

## 16. Fallas frecuentes

| Síntoma | Causa probable |
| --- | --- |
| Invitación 401 | Función con Verify JWT ON |
| “Agente no configurado” | Falta `RETELL_GUIDE_AGENT_ID` o key |
| Diario vacío tras voz | Webhook no recibe `call_analyzed` / falta `ANTHROPIC_API_KEY` en Edge |
| Audio no arranca en móvil | Token creado fuera del gesto / sin `getUserMedia` previo |
| Sesión duplicada 409 | Ya hay `active/closing`; usar `replace_active` o cerrar |
| Pilares en 0 | Confundir ausencia con score; no forzar seis pilares |
| Chat texto sin respuesta | Falta `ANTHROPIC_API_KEY` en Vercel / API local |

---

## 17. Orden mínimo de entrega (MVP clon)

1. Migraciones + RLS.  
2. `guide-chat` texto + UI `/guia`.  
3. Agente Retell + `create-guide-retell-web-call` + `GuideVoicePage`.  
4. `guide-session-state` + prompt de tiempo.  
5. `guide-retell-webhook` + diario.  
6. Pilares post-call.  
7. Ligas públicas.  
8. Diario UI + reprocess.

Con eso se replica la funcionalidad de Guía end-to-end sin depender del Asistente empresarial.
