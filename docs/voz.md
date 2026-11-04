# Asistente por voz — crear acciones e instrucciones habladas

Guía para **replicar** en otro módulo (o producto) el flujo de voz del Asistente de What2Do:

1. **Entrada por voz** → dictado → interpretación con IA → borradores de acción → guardar en tablero.
2. **Salida por voz** → leer en voz alta la interpretación, siguientes pasos e instrucciones de cada acción.

No documenta el chat de Guía ni Retell; solo el Asistente operativo (`/asistente` y FAB en Dashboard/Kanban).

---

## Resumen del producto

| Capacidad | Cómo se resuelve hoy |
| --- | --- |
| Hablar para crear acciones | Micrófono → Web Speech API (`es-MX`) → texto → `POST /api/assistant-audio` → `actionDrafts` → botón «Crear» / «Crear todas» |
| Escuchar instrucciones | Botón **Leer** (`SpeechButton`) → ElevenLabs TTS → fallback `speechSynthesis` |
| Contexto automático | Entendimiento + memoria de negocio + tareas activas del Kanban se inyectan en el prompt |
| Modos | `plan_actions` (crear acciones) · `advisory` (solo asesoría, sin drafts) |

La IA **no recibe audio**: solo texto ya transcrito. El micrófono vive 100 % en el navegador.

---

## Flujo extremo a extremo

```text
Usuario habla / escribe
        |
        v
[Web Speech API]  lang=es-MX, continuous, interimResults
        |  (al detener: transcript final)
        v
requestAssistantTextAnalysis({ text, context, clarifications, intent })
        |
        v
POST /api/assistant-audio
  - Claude interpreta (JSON)
  - Devuelve validation + interpretation + nextSteps + actionDrafts
        |
        v
UI Asistente
  - Mostrar diagnóstico
  - SpeechButton: leer resumen / pasos / cada draft
  - Crear acción(es) en public.acciones_diarias + checkpoints
```

### Lectura por voz (independiente del micrófono)

```text
Clic "Leer" en SpeechButton
        |
        v
requestElevenLabsSpeech(text)
        |
        v
POST /api/elevenlabs-tts  →  audioBase64
        |
   +----+----+
   OK       Error
   |         |
   v         v
Audio.play  speechSynthesis es-MX
```

Detalle TTS: [elevenlabs-tts.md](./elevenlabs-tts.md).

---

## Archivos en este repo (implementado)

| Archivo | Rol |
| --- | --- |
| `src/features/ai-support/pages/AiAssistPage.tsx` | Superficie **Chat** / **Voz / acciones** (`page` \| `popup`). |
| `src/features/ai-support/components/AssistantVoicePanel.tsx` | UI STT + interpretación + drafts + Crear. |
| `src/features/ai-support/components/AiAssistFloatingButton.tsx` | FAB en rutas de operación. |
| `src/lib/assistantAudioClient.ts` | Cliente tipado hacia `/api/assistant-audio`. |
| `api/assistant-audio.ts` | Prompt + Gemini (o Claude si `ASSISTANT_AUDIO_PROVIDER=claude`); JSON estructurado. |
| `src/components/ui/SpeechButton.tsx` | Botón Leer/Detener (ElevenLabs + fallback). |
| `src/lib/elevenLabsTtsClient.ts` | Cliente TTS. |
| `api/elevenlabs-tts.ts` | Proxy servidor a ElevenLabs. |
| `src/features/ai-support/assistantKanbanContext.ts` | Serializa el Kanban activo al prompt. |
| `src/features/ai-support/createActionFromDraft.ts` | Draft → `acciones_diarias` + checkpoints. |
| `vite.apiPlugin.ts` / `vite.config.ts` | Monta `/api/assistant-audio` y `/api/elevenlabs-tts` en `npm run dev`. |

Adaptaciones vs What2Do: estado inicial `Pendiente` (no existe `En_Pausa`); prioridad `P1_Alta` → `P1_Critica`; IA por defecto Gemini (`GEMINI_API_KEY`); `responsable` = usuario actual (`NOT NULL` en este esquema; no hay taskpool nulo).

Servicios de persistencia usados al crear acciones:

- `accionesService.create(...)`
- `accionCheckpointsService.insertMany(...)` (actividades internas del draft)

---

## 1) Entrada por voz (dictado → acciones)

### Requisitos del navegador

- `window.SpeechRecognition` o `window.webkitSpeechRecognition`
- Permiso de micrófono
- Preferible Chrome/Edge; Safari puede ser limitado

Si no hay STT, la UI debe permitir **texto** (mismo pipeline de análisis).

### Contrato del reconocimiento (como está implementado)

```ts
recognition.lang = 'es-MX'
recognition.continuous = true
recognition.interimResults = true
```

Comportamiento:

1. **Iniciar** → `recognition.start()`, timer de segundos, limpia resultado previo.
2. **`onresult`** → acumula finals en un ref; muestra finals + interim en el textarea.
3. **Detener** → `recognition.stop()` → en `onend` toma el transcript final.
4. Si hay texto → llama análisis automáticamente.
5. Si vacío / error → mensaje amigable (permisos, sin voz detectada).

Puntos de UI:

- Micrófono grande en estado vacío.
- Barra «Escuchando…» con botón Detener.
- Micrófono pequeño en el composer cuando no hay texto escrito.

### Análisis (texto → drafts)

Cliente:

```ts
await requestAssistantTextAnalysis({
  text: transcript,
  context: assistantContext, // Entendimiento + memoria + Kanban + notas manuales
  clarifications,            // respuestas a preguntas de la IA
  intent: 'plan_actions' | 'advisory',
  signal,
})
```

Endpoint: `POST /api/assistant-audio`

Body relevante:

```json
{
  "text": "nota dictada o escrita",
  "context": "contexto automático + manual",
  "clarifications": "opcional",
  "intent": "plan_actions"
}
```

Respuesta esperada (`result`):

```json
{
  "transcript": "...",
  "validation": {
    "status": "usable | needs_more_context | not_usable",
    "summary": "...",
    "missingPoints": [],
    "clarificationQuestions": []
  },
  "interpretation": {
    "executiveSummary": "...",
    "signals": [],
    "risks": [],
    "opportunities": []
  },
  "nextSteps": [],
  "actionDrafts": [
    {
      "title": "verbo + resultado",
      "description": "...",
      "objective": "...",
      "evidenceExpected": "...",
      "priority": "P1_Alta | P2_Media | P3_Baja",
      "leanWaste": "...",
      "eosComponent": "...",
      "ownerHint": null,
      "dueDateHint": null,
      "activities": ["paso 1", "paso 2"]
    }
  ]
}
```

Reglas de producto en el prompt (`api/assistant-audio.ts`):

- En `plan_actions`: 1–3 drafts, 2–5 activities, no inventar si falta contexto.
- Cruce con Kanban: no duplicar tareas ya activas.
- En `advisory`: `actionDrafts` vacío; solo criterio y preguntas.

### Guardar acciones en el tablero

Tras un resultado usable con drafts:

1. Usuario confirma **Crear** (uno) o **Crear todas**.
2. Cada draft se mapea a `acciones_diarias`:
   - `titulo_accion` ≤ 70 chars
   - descripción / instrucciones desde draft
   - `fecha` / `fecha_inicio` = mañana
   - `estado` inicial `En_Pausa`
   - `responsable = null` (cae a taskpool hasta asignar)
   - prioridad `P1_Alta` → `P1_Critica`
3. Se insertan checkpoints: título del draft + cada `activity`.
4. Se invalidan queries `acciones` / `accion_checkpoints`.

Para replicar en otro producto: sustituye este paso por tu API de tareas, pero **mantén** el contrato JSON de `actionDrafts`.

---

## 2) Salida por voz (instrucciones habladas)

### Dónde se lee

En la UI del Asistente, `SpeechButton` aparece sobre:

| Bloque | Texto que se lee |
| --- | --- |
| Interpretación | Título del modo + `executiveSummary` |
| Qué hacer ahora | Prefijo «Qué hacer ahora.» + hasta 3 `nextSteps` |
| Cada borrador de acción | `actionDraftSpeechText(draft)`: título, descripción, objetivo, evidencia, actividades |

Helper de texto hablable por draft:

```ts
function actionDraftSpeechText(draft) {
  return [
    draft.title,
    draft.description,
    draft.objective ? `Objetivo: ${draft.objective}` : '',
    draft.evidenceExpected ? `Evidencia para cerrar: ${draft.evidenceExpected}` : '',
    draft.activities.length
      ? `Actividades: ${draft.activities.map((a, i) => `${i + 1}. ${a}`).join('. ')}`
      : '',
  ].filter(Boolean).join('. ')
}
```

### Comportamiento de `SpeechButton`

1. Clic → `loading`.
2. `POST /api/elevenlabs-tts` con el texto.
3. Reproduce MP3; botón pasa a **Detener**.
4. Si falla → `speechSynthesis` `es-MX`.
5. Solo una lectura activa global (detiene la anterior).

Variables de entorno TTS: ver [elevenlabs-tts.md](./elevenlabs-tts.md) (`ELEVENLABS_*`, sin prefijo `VITE_`).

Variables del análisis:

| Variable | Uso |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude en `/api/assistant-audio` |
| `CLAUDE_MODEL` / `CLAUDE_FALLBACK_MODEL` | Modelo principal y fallback |
| `CLAUDE_MAX_TOKENS`, `CLAUDE_TEMPERATURE`, `CLAUDE_TIMEOUT_MS` | Ajuste opcional |

---

## Contexto que recibe la IA (para no “alucinar” tareas)

Al armar `context` se concatenan (si existen):

1. **Entendimiento** — formulario + interpretación guardada.
2. **Memoria de negocio** — bloques persistidos del asistente.
3. **Kanban activo** — acciones con responsable, sin completadas (`assistantKanbanContext.ts`).
4. **Contexto manual** — textarea opcional del usuario.
5. **Aclaraciones** — respuestas a `clarificationQuestions`.

Al replicar: si no tienes Kanban/Entendimiento, pasa al menos un inventario de tareas abiertas en el mismo string `context` con un encabezado estable (ej. `Contexto del tablero Kanban actual.`) y documenta ese encabezado en el system prompt.

---

## Checklist mínimo para replicar en otro módulo

### Backend

- [ ] Endpoint de interpretación tipo `/api/assistant-audio` (texto in → JSON out).
- [ ] Prompt con modos `plan_actions` / `advisory` y schema de `actionDrafts`.
- [ ] Endpoint TTS `/api/elevenlabs-tts` (o equivalente) + secrets de servidor.
- [ ] Rutas registradas en Vite (dev) y en el host (Vercel `api/`).

### Frontend

- [ ] Wrapper STT (`SpeechRecognition` / `webkitSpeechRecognition`, `es-MX`).
- [ ] Composer: micrófono, detener, textarea, Ctrl+Enter para texto.
- [ ] Render de validation / interpretation / nextSteps / actionDrafts.
- [ ] `SpeechButton` en resumen, pasos e instrucciones de cada draft.
- [ ] Acción «Crear» que persista draft → tarea + subtareas/actividades.
- [ ] Fallback a texto si no hay micrófono.

### UX / producto

- [ ] Intent por defecto `plan_actions` si el objetivo es crear trabajo.
- [ ] No crear acciones automáticamente al terminar de hablar: el usuario confirma.
- [ ] Mostrar badge o hint de qué contexto se está enviando (Entendimiento / Kanban).
- [ ] Cancelar interpretación en curso (`AbortController`).

### Prueba manual

1. Abrir `/asistente` o el FAB en Dashboard/Kanban.
2. Elegir **Crear planes o acciones**.
3. Dictar un dolor concreto (área, qué falta, para cuándo).
4. Verificar drafts + botón **Leer** en cada uno.
5. Crear una acción y confirmarla en Kanban/Taskpool.
6. Sin micrófono: pegar el mismo texto y repetir.
7. Sin ElevenLabs: **Leer** debe caer al TTS del navegador.

---

## Piezas reutilizables (snippet mental)

```ts
// 1) Hablar → texto
const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
// start → onresult acumula → stop → transcript

// 2) Texto → drafts
const result = await requestAssistantTextAnalysis({
  text: transcript,
  context,
  intent: 'plan_actions',
})

// 3) Draft → tarea
await createActionFromDraft(result.actionDrafts[0])

// 4) Instrucciones → voz
<SpeechButton text={actionDraftSpeechText(draft)} />
```

---

## Limitaciones conocidas (al clonar, no las ignores)

- STT depende del navegador; no es Whisper ni un servicio propio.
- El audio crudo no se sube al servidor (privacidad y simplicidad); solo el transcript.
- ElevenLabs recorta texto largo en el API (~1200 chars); textos de drafts largos se truncan para TTS.
- Crear acciones deja `responsable = null` (taskpool) hasta asignación humana.
- Analistas solo aportan al contexto Kanban sus propias tareas.

---

## Relación con otras docs

| Doc | Qué aporta |
| --- | --- |
| [elevenlabs-tts.md](./elevenlabs-tts.md) | Configuración y troubleshooting de lectura por voz |
| [environment-variables.md](./environment-variables.md) | Dónde van secrets (`ANTHROPIC_*`, `ELEVENLABS_*`) vs `VITE_*` |

---

## Resultado esperado al replicar

Un operador puede:

1. **Hablar** un pendiente o dolor.
2. Recibir borradores de acción claros.
3. **Escuchar** las instrucciones de cada acción.
4. Confirmar y dejarlas guardadas en el tablero sin escribir a mano el desglose.
