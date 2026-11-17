# Checklist Retell — Enviardian por URL

Este archivo no publica el agente ni despliega la app. Hay que hacerlo a mano, en este orden.

## Arquitectura

```text
URL token → validate-guide-user-link
         → consent-guide-user-link (grant HMAC ~15 min)
         → guide-retell-web-call (exige grant; falla si falta user_id)
         → guide_sessions (access_mode stamp)
         → Retell web call
         → guide-retell-tool firmado (identidad de la sesion)
         → dispatchCopilotTool (filtro por usuario.rol)
         → finalizeGuideInterview / historial / PDF / WhatsApp
```

- Retell **nunca** habla con Supabase desde el navegador.
- La identidad **no** sale de un `usuario_id` que mande el modelo.
- **Piloto** `GUIDE_INTERVIEW_FULL_READ=1` (default): toda liga valida usa `interview_full_read` = lectura de toda la organizacion (modulos/herramientas), **sin escritura**. Apagar con `0` para volver a lectura segun rol.
- Voz autenticada en app sigue en `propose`.
- El producto es single-tenant: aislamiento por proyecto/DB (no hay `organization_id` multi-tenant).
- OTP ejecutivo: fuera de alcance (riesgo residual si alguien reenvia la URL).

## Codigo ya en el repositorio

- `POST /api/guide-retell-tool` → copiloto de la sesion.
- `POST /api/consent-guide-user-link` → grant firmado; `/voz` no arranca solo con `consent: true`.
- Web call exige grant + `usuarios.user_id` activo.
- Informe: `consult_log` groundea lo verificado; el evento `client` espera al webhook.
- Informe post-llamada: el webhook (`call_analyzed`) escribe el informe; `call_ended` y el navegador esperan. El cierre autenticado de voz Retell usa el mismo `finalizeGuideInterview` (no el prompt de reflexion de texto). PDF e historial leen el mismo `executive_report` (v2).
- Migraciones aplicadas en Supabase PROD (`xhpasmjzuwifmjhrsumb`), en este orden:
  1. `supabase/migrations/20261113130000_guide_session_consult_log.sql`
  2. `supabase/migrations/20261114160000_guide_link_access_mode.sql`
  3. `supabase/migrations/20261114170000_guide_interview_full_read.sql`
  4. `supabase/migrations/20261114180000_guide_sessions_call_id_unique.sql`

## Matriz de herramientas (voz / URL)

| Herramienta | Tipo | Filtro efectivo |
| --- | --- | --- |
| `get_my_actions` | read | Responsable = usuario de la sesion |
| `get_action_details` | read | Analista: solo propias; otros: tablero abierto |
| `get_team_actions` | read | Denegado a Analista; otros: abiertas ajenas calientes |
| `get_pending_verifications` | read | Roles del usuario en la accion |
| `get_dashboard_summary` | read | Analista: propias; otros: organizacion abierta |
| `search_board` / `get_module_data` / `get_org_chart` | read | Gate de modulo + rol |
| `get_okr_progress` | read | Gate OKR; con service role puede ser mas amplio que RLS JWT (riesgo documentado) |
| `search_people` | read | Usuarios activos (matching por nombre) |
| `create_action` / `update_*` / `mark_action_done` / `verify_action` | write | Solo si `access_mode=propose`; denegado en `read` e `interview_full_read` |
| `queue_workspace_draft` | write | Identidad de sesion; denegado fuera de `propose` |

Con `interview_full_read`, las lecturas usan `boardScope=organization` (sin filtro por area/equipo del participante).

## En el dashboard de Retell (agente Guia, `RETELL_GUIDE_AGENT_ID`)

No editar el agente de entrevistas (`RETELL_AGENT_ID`).

**No publicar ni desplegar producción** hasta autorización explícita. El script `scripts/publish-guia-retell-tools.mjs` hace dry-run por defecto; remoto solo con `GUIDE_RETELL_PUBLISH_OK=1`.

### Custom tools — before / after (latencia voz)

| Campo | Before (publicado previo) | After (listo en script; pendiente publish) |
| --- | --- | --- |
| `scrumban.speak_during_execution` | `false` | `true` |
| `scrumban.execution_message_type` | (ausente) | `static_text` |
| `scrumban.execution_message_description` | (ausente) | `Un momento, consulto el tablero.` |
| `scrumban.speak_after_execution` | `true` | `true` (sin cambio) |
| `scrumban.timeout_ms` | `30000` | `30000` (backend tipa ~3s con `GUIDE_RETELL_TOOL_TIMEOUT_MS`) |
| `scrumban` descripción | lista plana de tools | prefer `get_my_actions` / `get_okr_progress` / `get_dashboard_summary`; evitar `search_board` / `get_module_data` amplios |
| `get_session_state.speak_during_execution` | según draft | `true` + mensaje `Un segundo.` |
| Prompt version | `enviardian-voz-2026-11-13` | `enviardian-voz-2026-11-16-actions` (confirm/cancel verbal + Acciones informe) |
| `confirm_pending_op` / `cancel_pending_op` | ausente | en `RETELL_WRITE_TOOLS` + steering `scrumban` (solo `access_mode=propose`) |

Estado en repo (código + script listos; remoto solo tras OK):

1. Custom function `scrumban` → `POST https://scrumbanemx.vercel.app/api/guide-retell-tool` (firma `x-retell-signature`).
2. `get_session_state` → `POST https://scrumbanemx.vercel.app/api/guide-session-state` (`x-guide-tool-secret`).
3. `webhook_url` → `https://scrumbanemx.vercel.app/api/guide-retell-webhook` (`call_ended`, `call_analyzed`).
4. Prompt: `docs/prompts/enviardian-voz.md` (`enviardian-voz-2026-11-16-actions`). Publicar el texto en el flow solo con autorización.
5. Revisar en dashboard (no adivinar): modelo LLM, turn-taking, STT/TTS, timeouts publicados vs Vercel `maxDuration: 60`.
6. Follow-up separado: `docs/guia.md` menciona `end_call_after_silence_ms` / `interruption_sensitivity` en web-call; `guide-retell-web-call` hoy no los manda — documentar o implementar aparte.

## Pruebas E2E manuales (despues de migraciones + publish)

| Caso | Accion | Resultado esperado |
| --- | --- | --- |
| A | Abrir URL valida sin login | Landing → consent → voz inicia |
| B | Preguntar una accion real | Retell llama `scrumban`; respuesta coincide con Scrumban |
| C | Consultar OKRs | Solo lo permitido por el rol del dueno |
| D | Pedir datos de otro tenant / org ajena | N/A single-tenant; denegar si no hay permiso de rol |
| E | Liga vencida o revocada | Acceso denegado en validate/web-call |
| F | Forzar otro `usuario_id` en args | Se ignora; no amplía permisos |
| G | `create_action` con liga piloto | Denied (`interview_full_read` no escribe) |
| H | Fallo de herramienta | Agente no inventa cifras |
| I | Colgar | Informe en historial; PDF = mismo texto |
| J | Repetir webhook | No duplica informe (`return_existing`) |
| K | `create_action` autenticado + «sí» verbal | Propuesta → `confirm_pending_op` → «Listo» solo tras ok |
| L | Cancelar propuesta / confirmar duplicado | `cancel_pending_op` no escribe; confirm idempotente |
| M | Email preview en ActionCard | Destinatario/asunto/cuerpo; envío solo tras confirm |
| N | Informe sección Acciones | Ejecutadas / pendientes / recomendaciones no ejecutadas |

Hasta completar A–N contra una URL real, la integracion de voz no esta cerrada.

## Informe ejecutivo v3 (web + PDF)

- Persistencia: `executive_report` como JSON `enviardian-informe-v3` (texto ALL-CAPS v2 sigue adaptándose).
- UI: overview ejecutivo en [`GuideReportBody`](../src/features/guide/components/GuideReportBody.tsx); badges de evidencia; métricas solo si hay `consult_log`.
- Look BI semántico: paleta en [`reportVisualTheme.ts`](../src/features/guide/reportVisualTheme.ts) (navy/azul/turquesa/verde/ámbar/coral/rojo/violeta). Rojo solo con riesgo verificado + criticidad. Violeta solo recomendaciones IA. Generación v3 intacta.
- PDF/WhatsApp: misma capa [`guideReportPresentation`](../src/features/guide/guideReportPresentation.ts) + acentos PDF por `sectionKind`.
- Sin deploy producción ni publish Retell en este cambio: validar en preview.

## Observabilidad

Logs `guide-retell-tool`: `call_id`, `session`, `tool`, `status`, `auth_ms`, `session_ms`, `user_ms`, `dispatch_ms`, `consult_log_ms`, `payload_bytes`, `ms`, `ignored_model_user`. No loguear tokens ni grants completos.

Harness local/preview: `node scripts/e2e-guia-voice-latency.mjs` (matriz A–N, p50/p95 por herramienta). Smoke corto: `scripts/e2e-guia-bridge-smoke.mjs`. Detalle: `docs/retell-voice-latency-baseline.md`.

Migración consult_log atómico: `supabase/migrations/20261116120000_append_guide_consult_log.sql` (aplicar en DEV/PROD cuando se autorice).

### Pendientes solo UI remota (tras autorización)

- Publicar tools + prompt `enviardian-voz-2026-11-16-actions` en Retell (`GUIDE_RETELL_PUBLISH_OK=1`).
- Revisar modelo / STT / TTS / turn-taking en dashboard.
- Deploy producción del backend (timeout tipado, voice-slim, métricas por fase).

## Riesgos pendientes

- Piloto de lectura global: cualquier liga activa ve el tablero completo de la org; revocar ligas o poner `GUIDE_INTERVIEW_FULL_READ=0` para restringir.
- OKR bajo service role mas amplio que RLS JWT.
- Sin OTP: quien tenga la URL actúa con el alcance del piloto mientras la liga este activa.
- Ligas `app` no pasan el gate OKRS de WhatsApp (intencional hoy).
- No hay multi-org real: “otras organizaciones” = otro proyecto Supabase.
