# R4 Pilot · checklist GO / NO-GO

**R4 NO-GO. GO QA NO-GO.** Ningún ítem de “piloto real” está autorizado.

Leyenda:

| Etiqueta | Significado |
| --- | --- |
| IMPLEMENTED LOCAL | Código/contrato en el worktree |
| SIMULATED PASS | Prueba local verde, sin proveedor |
| READY FOR REAL TEST | Falta solo autorización + secretos + agente |
| REAL NOT TESTED | Requiere red/proveedor/entorno; no corrido |

## Entorno

| Ítem | Estado |
| --- | --- |
| Entorno `r4-pilot` ≠ QA A/B, DEV, PROD, Preview R3 | IMPLEMENTED LOCAL (spec). REAL NOT TESTED (no provisionado) |
| Secretos server-side `RETELL_R4_*` | IMPLEMENTED LOCAL (gate). REAL NOT TESTED |
| Prohibido `VITE_RETELL*` | SIMULATED PASS |
| Kill switch por flags | IMPLEMENTED LOCAL |

## Adaptador Retell R4

| Ítem | Estado |
| --- | --- |
| Fail-closed sin `AGENT_VOICE_R4=1` | SIMULATED PASS |
| Fail-closed sin `AGENT_VOICE_R4_LIVE_OK=1` | SIMULATED PASS |
| Fail-closed sin `RETELL_R4_API_KEY` + `RETELL_R4_AGENT_ID` | SIMULATED PASS |
| Rechazo si el agentId es el de Guía | SIMULATED PASS |
| Con credenciales presentes: `connect_blocked` (cero fetch) | SIMULATED PASS |
| Inicio de sesión / eventos / interrupt / timeout / informe | SIMULATED PASS (orquestador) |
| Token 30 s, un uso, auth+consent+occupancy | SIMULATED PASS |
| Llamada real a Retell | REAL NOT TESTED — **NO-GO** |

## Seguridad

| Ítem | Estado |
| --- | --- |
| Autorización antes de emitir token | SIMULATED PASS |
| Consentimiento antes de captura | SIMULATED PASS |
| Una sesión por liga | SIMULATED PASS |
| TTL / revocación de liga | SIMULATED PASS (store en memoria) |
| Anti-reutilización de token | SIMULATED PASS |
| Confirmaciones solo dueño autenticado | SIMULATED PASS |
| Sin fallback automático | SIMULATED PASS |
| Retención local ≠ grabación Retell | IMPLEMENTED LOCAL (documentado). REAL NOT TESTED en dashboard Retell |

## Sesión supervisada

| Ítem | Estado |
| --- | --- |
| Runbook de una sesión | IMPLEMENTED LOCAL |
| Participante / tope de costo / evidencia | IMPLEMENTED LOCAL (pendiente acuerdo operador) |
| Ejecución de la sesión | REAL NOT TESTED — **NO-GO** |

## Autorizaciones exactas que faltan para READY → real

1. Dueño del producto: entorno `r4-pilot` y no contaminar QA/DEV/PROD.
2. Seguridad: alta de `RETELL_R4_API_KEY` solo en ese entorno.
3. Voice: crear agente Retell R4 y confirmar en consola **recording/transcript = off** (o el valor acordado). Esto **no** lo controla `AGENT_VOICE_R4_RETAIN_AUDIO`.
4. Operador: tope USD y ventana de 15 min.
5. Participante informado.
6. Orden explícita de **conectar** (hoy `connect` es siempre `false`).

Hasta entonces: **NO-GO piloto real**. **NO-GO QA**.
