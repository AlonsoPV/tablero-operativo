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
| R4-AT-08 | UI con flag OFF | Sin CTA de laboratorio; `/asistente-ia/r4-lab` redirige a Guía | SIMULATED PASS (unitario). Visual autenticado **BLOCKED** |
| R4-AT-09 | Proveedor real solicitado | `selectR4VoiceProvider` → `real_provider_not_authorized` | SIMULATED PASS |
| R4-AT-10 | Eventos liga/consent/conversación/recover/cierre único | Contrato R4.5 sin red | SIMULATED PASS |
| R4-AT-11 | AT-16 sintético: PDF, procedencia, lectura dueño, idempotencia | Reusa contratos Guía; no llama finalize productivo | SIMULATED PASS |
| R4-AT-12 | AT-16 lector ajeno | Sin PDF | SIMULATED PASS |
| R4-AT-13 | AT-20 consultas web/WA/voz | QUERY + `query` + voz listening | SIMULATED PASS |
| R4-AT-14 | AT-20 followup/create en WA texto libre | CHANNEL_GAP vs web (documentado; no se “arregló” el router WA) | SIMULATED PASS (gap) |
| R4-AT-15 | AT-20 aprobación | Botón `aiop` → TASK_UPDATE; voz pública deniega | SIMULATED PASS |
| R4-AT-16 | Matriz R4.6 | Criterios listos; **sin métricas inventadas ni ganador** | Documento. REAL NOT TESTED |

## Fuera del harness (requieren autorización) — REAL NOT TESTED

Piloto Retell real, OpenAI Realtime, liga pública en staging, PDF/`consult_log` real, WhatsApp Graph, visual autenticado del laboratorio R4, GO QA.
