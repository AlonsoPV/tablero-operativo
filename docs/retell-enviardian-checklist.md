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
- Migraciones pendientes de aplicar en Supabase (en este orden):
  1. `supabase/migrations/20261113130000_guide_session_consult_log.sql`
  2. `supabase/migrations/20261114160000_guide_link_access_mode.sql`
  3. `supabase/migrations/20261114170000_guide_interview_full_read.sql`
  4. `supabase/migrations/20261114180000_guide_sessions_call_id_unique.sql`

Sin `consult_log` la herramienta responde, pero el informe dira que se basa solo en la entrevista.
Sin `access_mode` el bridge asume lectura de liga vía piloto/`read` si hay `guide_link_id` y `propose` si no.

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

1. Nodo inicial **Apertura**: quitar la frase sugerida `Hola, soy Shaman...`. La apertura es Enviardian, asistente de IA empresarial de Scrumban.
2. Registrar custom function `scrumban` → `POST {APP}/api/guide-retell-tool`, firma `x-retell-signature`.
   - Parametros: `tool` + args del copiloto. No enviar `usuario_id`.
3. Dejar de usar `get_session_state` (este repo no lo expone).
4. Prompt global: copia en `docs/prompts/enviardian-voz.md` (`enviardian-voz-2026-11-13`). Guardar el markdown **no** publica Retell.
5. Publicar la version del agente Guia.

Hasta publicar, una llamada real puede seguir saludando como Shaman y no consultar el tablero.

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

Hasta completar A–J contra una URL real, la integracion de voz no esta cerrada.

## Observabilidad

Logs `guide-retell-tool` / web-call: `session`, `tool`, `status`, `ms`, `ignored_model_user`. No loguear tokens ni grants completos.

## Riesgos pendientes

- Nodo Shaman / funcion `scrumban` no publicados.
- Migraciones no aplicadas en produccion.
- Piloto de lectura global: cualquier liga activa ve el tablero completo de la org; revocar ligas o poner `GUIDE_INTERVIEW_FULL_READ=0` para restringir.
- OKR bajo service role mas amplio que RLS JWT.
- Sin OTP: quien tenga la URL actúa con el alcance del piloto mientras la liga este activa.
- Ligas `app` no pasan el gate OKRS de WhatsApp (intencional hoy).
- No hay multi-org real: “otras organizaciones” = otro proyecto Supabase.
