# R4.6 · Matriz Retell vs OpenAI Realtime

Preparación de evaluación. **No hay ganador.** Ninguna celda de medición es un resultado de laboratorio real.

Oráculo común (cuando exista entorno de prueba autorizado): mismos prompts, mismas tools (`dispatchCopilotTool`), mismo informe AT-16, mismos casos AT-20.

## Estado de esta matriz

| Dato | Estado |
| --- | --- |
| Contratos / puertos R4 | SIMULATED PASS (`selectR4VoiceProvider` bloquea `retell` y `openai_realtime`) |
| Guía producción (`GuidePanel`, `useRetellGuideCall`) | REAL NOT TESTED en este incremento; no se modificó |
| Latencia, MOS, barge-in, reconexión, costo | REAL NOT TESTED |
| Seguridad de canal real (WebRTC / API keys / PII) | REAL NOT TESTED |

`firstAudioMs: 180` en adaptadores simulados es un **stub determinista**, no una medición de Retell.

## Criterios (mismo oráculo)

| Criterio | Cómo se mediría | Retell (Guía actual) | OpenAI Realtime | Simulated lab |
| --- | --- | --- | --- | --- |
| Latencia primer audio | p50/p95 `firstAudioMs` en  N turnos del oráculo | Integrado hoy vía `retell-client-js-sdk` en Guía. **Sin baseline R4 medido.** | No hay adaptador. **REAL NOT TESTED.** | Stub; no comparable |
| Latencia turno (barge-in → respuesta) | tiempo interrupt → primer audio | SDK expone `agent_start_talking` / stop. **No medido en R4.** | API Realtime soporta interrupciones; **no medido.** | Evento `interrupted` / `recovered` sintético |
| Calidad conversacional | acuerdo humano + exactitud de tools en AT-20 | Tools de Guía existentes. **Sin score R4.** | Dependería de function calling Realtime. **Sin score.** | Eco `Recibido: {utterance}` |
| Interrupciones | % barge-in correcto; no duplicar turno | `tts.interrupt` + `interruptSpeech` en orquestador. **SIMULATED PASS.** | Requiere adaptador. **REAL NOT TESTED.** | SIMULATED PASS |
| Recuperación | reconexión ≤ 1 intento; sesión no “ended” falsa | AT-14 harness. **SIMULATED PASS.** | Desconocido hasta piloto. | SIMULATED PASS |
| Costos estimados | USD / minuto + tools, mismo corpus | No cotizado aquí (tarifas de proveedor cambian). | No cotizado aquí. | $0 (sin red) |
| Seguridad | claves, PII, TTL liga, confirmación autenticada | Liga Guía + grants existentes. R4 no lee claves. | Audio/PII hacia OpenAI. Sin diseño de retención aprobado. | Liga en memoria, revocable, TTL |
| Integración asistente operativo | mismas intenciones AT-20 y tools R1 | Reutilizar `dispatchCopilotTool` / interpretador. **No cableado en este incremento.** | Mismo requisito de puerto. **No cableado.** | Clasifica texto; no ejecuta tools |

## Decisión técnica pendiente (no resuelta)

1. ¿El piloto de voz R4 reutiliza el agente Retell de Guía o un agente R4 aparte?
2. ¿OpenAI Realtime entra solo como oráculo de comparación o como fallback?
3. ¿Quién paga y registra el uso (cuenta, región, retención de audio)?
4. ¿La liga pública puede abrir WebRTC o solo el laboratorio simulado?

Hasta esas respuestas y un entorno de prueba autorizado, **R4.6 permanece en preparación**. No hay GO de proveedor.

## Dependencias para medir de verdad

- Flag y claves solo en entorno de prueba (no QA A/B / DEV / PROD de este worktree).
- Consentimiento y TTL de liga reales.
- Corpus AT-20 + informe AT-16 con el mismo oráculo.
- Registro de `firstAudioMs`, errores de reconexión y costo por sesión.
