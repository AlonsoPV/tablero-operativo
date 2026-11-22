# R4 · pruebas de aceptación (harness local)

Relación con criterios ya definidos: AT-13, AT-14, AT-16, AT-20 en [acceptance-tests.md](acceptance-tests.md). Este archivo no modifica esos AT ni las suites R0–R3.

## Condiciones del harness

- `AGENT_VOICE_R4` ausente salvo el caso que lo enciende.
- Adaptadores simulados únicamente (cero Retell/ElevenLabs/Meta reales).
- Sin migraciones, sin escrituras QA/PROD, sin dispatcher WhatsApp.

## Casos locales (R4.1–R4.3)

| ID | Caso | Esperado |
| --- | --- | --- |
| R4-AT-01 | Flag ausente / basura | Rutas R4 inactivas; `isAgentVoiceR4Enabled` = false |
| R4-AT-02 | Flag `1` | Solo habilita selección de adaptadores; no despliega proveedores |
| R4-AT-03 | Liga expirada / revocada / grant inválido / sesión ajena / confirmación pública | Denegación con código estable (AT-13) |
| R4-AT-04 | STT/TTS timeout o permiso | Error recuperable; sin inventar transcripción/audio |
| R4-AT-05 | Retell timeout / reconexión | Error hablable; sesión no queda “exitosa” falsa |
| R4-AT-06 | Informe único (stub) | Un solo finalize simulado ante doble cierre (preparación AT-14/16) |
| R4-AT-07 | No regresión de flags R1/R3 | Encender R1/R3 no activa R4 |

## Fuera del harness (requieren autorización)

Piloto Retell real, liga pública en staging, AT-16/AT-20 con evidencia de canal, comparativa OpenAI.
