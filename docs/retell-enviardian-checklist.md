# Checklist Retell — Enviardian por URL

Este archivo no publica el agente ni despliega la app. Hay que hacerlo a mano, en este orden.

## Codigo ya en el repositorio

- `POST /api/guide-retell-tool` llama al copiloto de la sesion. La identidad sale de `guide_sessions`, no de un `usuario_id` que mande el modelo.
- La web call ya no manda el volcado del tablero. Manda `prompt_version` = `enviardian-voz-2026-11-13`, `channel` y `consult_instruction`.
- El informe de cierre solo puede citar consultas guardadas en `guide_sessions.consult_log`.
- Migracion pendiente de aplicar en Supabase: `supabase/migrations/20261113130000_guide_session_consult_log.sql`. Sin esa columna la herramienta responde, pero el informe dira que se basa solo en la entrevista.

## En el dashboard de Retell (agente Guia, `RETELL_GUIDE_AGENT_ID`)

No editar el agente de entrevistas (`RETELL_AGENT_ID`).

1. Nodo inicial: quitar el guion que se presenta como Shaman. La apertura es Enviardian, asistente de IA empresarial de Scrumban. No usar el nodo de pilares como ruta principal.
2. Registrar una custom function `scrumban` hacia `POST {APP}/api/guide-retell-tool`, con firma `x-retell-signature`.
   - Parametros: `tool` (nombre de la herramienta del copiloto) y los argumentos de esa herramienta.
   - No enviar `usuario_id`. La sesion ya va en `call.metadata.guide_session_id`.
3. Dejar de usar `get_session_state`. Este repositorio no lo expone.
4. En el prompt global, confirmar que un ejemplo del propio prompt no es un dato del tablero y que un fallo de herramienta se dice en voz. La copia vigente esta en `docs/prompts/enviardian-voz.md`.
5. Publicar la version. Hasta entonces una llamada real sigue saludando como Shaman y no consulta el tablero, aunque el codigo del puente ya este desplegado.

## Prueba real, despues de publicar

En la URL de invitacion:

1. La primera frase es de Enviardian, no de Shaman.
2. Una pregunta de pendientes coincide con lo que ve ese usuario en Scrumban.
3. Si la consulta falla, no inventa cifras.
4. Al colgar, `/asistente-ia/historial` muestra el informe. Una propuesta queda como pendiente, no como accion creada.
5. El PDF sale del mismo texto que el historial.

Hasta completar esa llamada, la integracion de voz no esta cerrada.
