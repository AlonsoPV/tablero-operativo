# R4 Pilot · entorno aislado

Estado: **diseñado, no provisionado**. `R4_PILOT_ENV_SPEC.provisioned = false`.

No usar QA A/B, DEV, PROD ni Preview R3.

## Recursos necesarios (aún no crear)

| Recurso | Para qué | Este incremento |
| --- | --- | --- |
| Entorno Vercel `r4-pilot` (preview dedicado, no promoción a prod) | Flags y secretos server-side | No provisionado |
| Agente Retell **nuevo** (`RETELL_R4_AGENT_ID`) | Voz R4, distinto de Guía y de entrevistas | No creado |
| Secreto `RETELL_R4_API_KEY` | Solo servidor, distinto de `RETELL_API_KEY` de Guía | No definido |
| Observabilidad (logs de `R4PilotConnectionEvent`) | Trazas sin audio | Contrato local |
| Almacén de occupancy/tokens | Una sesión por liga; token 30 s | **In-memory local** |

## Variables

| Variable | Dónde | Efecto |
| --- | --- | --- |
| `VITE_AGENT_VOICE_R4=1` | Cliente | Solo UI del lab |
| `AGENT_VOICE_R4=1` | Servidor | Habilita el gate R4 |
| `AGENT_VOICE_R4_LIVE_OK=1` | Servidor | Autoriza *preparar* credenciales R4 |
| `RETELL_R4_AGENT_ID` | Servidor | Agente R4; no puede igualar Guía |
| `RETELL_R4_API_KEY` | Servidor | Nunca `VITE_` |
| `AGENT_VOICE_R4_RETAIN_AUDIO` | Servidor | Solo blobs **locales**. No apaga grabaciones de Retell |

Conexión HTTP a Retell: **bloqueada** (`connect_blocked`) aunque existan las variables.

## Secretos

- Server-side exclusively.
- Fail-closed si aparece `VITE_RETELL*` / `VITE_OPENAI*`.
- No reutilizar `RETELL_API_KEY` ni `RETELL_GUIDE_AGENT_ID`.
- No commitear `.env`. Kill switch: quitar `AGENT_VOICE_R4`, `AGENT_VOICE_R4_LIVE_OK`, `VITE_AGENT_VOICE_R4`.

## Datos y autenticación

- Aislamiento: occupancy y tokens en memoria; **sin migraciones ni RLS**.
- Auth: sesión existente del dueño. Liga pública no confirma.
- Una sesión viva por `linkId`. Token de acceso 30 s, un solo uso.

## Observabilidad y consumo

- Eventos: consentimiento, connecting, connected, denied, disconnected, informe duplicado.
- Máximo 1 sesión concurrente; techo 15 min (`R4_PILOT_MAX_SESSION_MS`).
- Tope de costo USD: lo fija el operador en el runbook; este código no llama billing.

## Apagado y rollback

1. Quitar `AGENT_VOICE_R4` y `AGENT_VOICE_R4_LIVE_OK`.
2. Quitar `VITE_AGENT_VOICE_R4` y recargar el lab.
3. Revocar liga / invalidar occupancy.
4. No promover el entorno `r4-pilot` a PROD.
5. Guía, R1–R3 y WhatsApp Graph no se tocan: rollback no los afecta.
