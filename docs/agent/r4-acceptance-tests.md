# R4 · pruebas de aceptación (harness local)

Relación con criterios ya definidos: AT-13, AT-14, AT-16, AT-20 en [acceptance-tests.md](acceptance-tests.md). Este archivo no modifica esos AT ni las suites R0–R3.

## Condiciones del harness

- `AGENT_VOICE_R4` ausente salvo el caso que lo enciende.
- Adaptadores simulados únicamente (cero Retell/ElevenLabs/Meta reales).
- Sin migraciones, sin escrituras QA/PROD, sin dispatcher WhatsApp.

## Casos locales (R4.1–R4.6)

| ID | Caso | Esperado | Resultado local |
| --- | --- | --- | --- |
| R4-AT-01 | Flag ausente / basura | Rutas R4 inactivas; `isAgentVoiceR4Enabled` = false | SIMULATED PASS |
| R4-AT-02 | Flag `1` | Solo habilita selección de adaptadores; no despliega proveedores | SIMULATED PASS |
| R4-AT-03 | Liga expirada / revocada / grant inválido / sesión ajena / confirmación pública | Denegación con código estable (AT-13) | SIMULATED PASS |
| R4-AT-04 | STT/TTS timeout o permiso | Error recuperable; sin inventar transcripción/audio | SIMULATED PASS |
| R4-AT-05 | Retell timeout / reconexión | Error hablable; sesión no queda “exitosa” falsa | SIMULATED PASS |
| R4-AT-06 | Informe único (stub) | Un solo finalize simulado ante doble cierre (preparación AT-14/16) | SIMULATED PASS |
| R4-AT-07 | No regresión de flags R1/R3 | Encender R1/R3 no activa R4 | SIMULATED PASS |
| R4-AT-08 | UI con flag OFF | Sin CTA de laboratorio; `/asistente-ia/r4-lab` redirige a Guía | SIMULATED PASS (unitario). Visual flag-off **REAL NOT TESTED** |
| R4-AT-08b | Lab visual 5174 flag UI on | Consentimiento, pausa, reanudación, cancelar, resumen, volver a Hablar | SIMULATED PASS (sesión existente; sin cuentas nuevas) |
| R4-AT-09 | Proveedor real solicitado | `selectR4VoiceProvider` → `real_provider_not_authorized` | SIMULATED PASS |
| R4-AT-10 | Eventos liga/consent/conversación/recover/cierre único | Contrato R4.5 sin red | SIMULATED PASS |
| R4-AT-11 | AT-16 sintético: PDF, procedencia, lectura dueño, idempotencia | Reusa contratos Guía; no llama finalize productivo | SIMULATED PASS |
| R4-AT-12 | AT-16 lector ajeno | Sin PDF | SIMULATED PASS |
| R4-AT-13 | AT-20 consultas web/WA/voz | QUERY + `query` + voz listening | SIMULATED PASS |
| R4-AT-14 | AT-20 followup/create (capa compartida) | Misma familia/propuesta en web, WA simulado y voz | SIMULATED PASS (gap cerrado en simulación) |
| R4-AT-14b | Router WA productivo followup/create | Sigue sin mapear; **no modificado** | SIMULATED PASS (bloqueo de producción documentado) |
| R4-AT-15 | AT-20 aprobación | Botón `aiop` → TASK_UPDATE; voz pública deniega | SIMULATED PASS |
| R4-AT-16 | Matriz R4.6 | Criterios listos; **sin métricas inventadas ni ganador** | Documento. REAL NOT TESTED |
| R4-AT-17 | Adaptador Retell R4 / OpenAI | Fail-closed / disabled, sin red, sin fallback | SIMULATED PASS |
| R4-AT-18 | Occupancy de liga | Segunda sesión → `session_occupied` | SIMULATED PASS |
| R4-AT-19 | AT-16/AT-20 reales | Evidencia definida, **no ejecutada** | REAL NOT TESTED |
| R4-AT-20 | Gate live Retell R4 | flag / LIVE_OK / secretos / reuse Guía / `connect_blocked` | SIMULATED PASS |
| R4-AT-21 | Token de sesión 30 s | Auth+consent+occupancy; reuse/expiry deny | SIMULATED PASS |
| R4-AT-22 | Entorno r4-pilot | Spec aislada; **no provisionada** | IMPLEMENTED LOCAL |

## Fuera del harness (requieren autorización) — REAL NOT TESTED

Piloto Retell real, OpenAI Realtime, liga pública en staging, PDF/`consult_log` real, WhatsApp Graph, visual autenticado del laboratorio R4, GO QA.
