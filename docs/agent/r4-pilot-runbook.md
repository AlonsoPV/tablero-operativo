# R4 Pilot · una sesión supervisada (no ejecutar)

Estado: procedimiento listo. **Sesión real: NO EJECUTADA.** R4 **NO-GO**. GO QA **NO-GO**.

## Participante autorizado

- Dueño de tablero con sesión ya existente.
- No crear cuentas ni resetear contraseñas.
- Observador técnico presente (este runbook).

## Objetivo de la conversación

Validar **una** llamada Retell R4 independiente de Guía:

1. Consentimiento antes de audio.
2. Token de acceso de corta duración (un uso).
3. Consulta operativa (`Que tengo pendiente?` / vencidas).
4. Una propuesta (`Crea una accion…` o followup) **sin** confirmar en voz pública.
5. Cierre idempotente + borrador de informe.

Fuera: WhatsApp Graph, OpenAI Realtime, confirmaciones por liga pública, PDF productivo.

## Casos de prueba (oráculo)

| # | Caso | Esperado |
| --- | --- | --- |
| 1 | Start sin consentimiento | `consent_required` |
| 2 | Segunda pestaña misma liga | `session_occupied` |
| 3 | Token reutilizado / caducado | `reused` / `expired` |
| 4 | Consulta pendiente/vencida | Misma familia que web |
| 5 | Confirmación pública | deny |
| 6 | Doble end | un informe; segundo `duplicate` |
| 7 | Revocar liga a mitad | `revoked`; no “éxito” falso |

## Duración y costo

- Máximo **15 minutos** o corte manual.
- Tope de costo: **acordar USD antes** (Retell cobra por minuto). Sin cifra inventada aquí.
- Interrumpir si hay fallback a Guía/OpenAI, audio inesperado grabado, o PII de terceros.

## Evidencia a recoger (si se autoriza después)

Ver `r4-real-evidence.md`. Mínimo: `sessionId`, timestamps, gate codes, que **no** se usó `RETELL_GUIDE_AGENT_ID`, pantallas de consentimiento, resultado del informe, log de occupancy.

## Criterios de interrupción inmediata

- El agente ID no es el R4.
- Se abre red contra Retell sin `LIVE_OK` (no debería ocurrir).
- Confirmación protegida pasa sin login.
- Segunda sesión en la misma liga.
- El dashboard de Retell graba audio cuando el piloto pidió retención mínima y **no** se verificó la config del proveedor.

## Rollback

Apagar flags (`r4-pilot-env.md`). No merge. No push. No tocar Guía.
