# R4 · Voz y ligas — plan paralelo

Fuente de alcance (sin ampliación): [release-plan.md](release-plan.md) · [product-backlog.md](product-backlog.md) · [acceptance-tests.md](acceptance-tests.md) AT-13, AT-14, AT-16, AT-20.

## Alcance confirmado

| ID | Funcionalidad | Criterio original |
| --- | --- | --- |
| VO-01 | Voz a texto | Transcripción revisable; fallback por navegador |
| VO-02 | Texto a voz | Reproducción, interrupción y error de audio |
| VO-03 | Voz a voz (Retell) | Conversación de baja latencia; tools; primer audio |
| VO-04 | Voz por liga | Sesión compartible segura; TTL y revocación |
| VO-05 | Reporte de sesión | Transcripción, hallazgos y acuerdos; finalización única |
| VO-06 | Recuperación | Interrupciones, errores y reconexión |
| ID-04 | Acceso por liga | TTL, revocación, consentimiento, aprobación autenticada |

**Gates de salida R4:** AT-13, AT-14, AT-16, AT-20. Comparación OpenAI solo en entorno de prueba con el mismo oráculo.

**Fuera de alcance R4 (no iniciar aquí):** despliegue, WhatsApp real/dispatcher, migraciones RLS, activación de proveedores reales, GO QA, cambios de contratos R1–R3 sin impacto aprobado, R5.

## Arquitectura propuesta

```
Canal web / liga / Retell
        │
        ▼
  flag AGENT_VOICE_R4 === '1'   (apagado por defecto; independiente de R1/R3)
        │
        ├─ off → rutas actuales (Guía / STT / TTS / ligas existentes sin cambio)
        └─ on  → adaptadores R4
                 ├─ SttPort / TtsPort / RetellPort / LinkAuthPort
                 ├─ simulados en local (este incremento)
                 └─ reales solo con autorización posterior
        │
        ▼
  mismos servicios de negocio (dispatchCopilotTool, grants, finalizeGuideInterview)
```

Principios:

1. Reutilizar `guideUserLinks`, Retell Guía y reportes existentes; no duplicar negocio.
2. Flags estrictos (`=== '1'`); basura/ausente = apagado.
3. Aprobaciones sensibles siguen autenticadas (AT-13); liga pública no amplía permisos.
4. Proveedores reales detrás de puertos; el harness local solo usa simulados.

## Backlog priorizado

| Inc | Entrega | Verificable sin remoto | Autorización extra |
| --- | --- | --- | --- |
| **R4.1** | Flags + contratos + adaptadores simulados + pruebas unitarias | Sí · hecho | — |
| **R4.2** | Harness AT-13 (sesión, liga, consentimiento, ops protegidas) | Sí · hecho | — |
| **R4.3** | Harness AT-14 (timeouts, reintentos acotados, informe único) | Sí · hecho | — |
| **R4.4** | Laboratorio UI en `/asistente-ia/r4-lab` detrás de `VITE_AGENT_VOICE_R4===1` | Sí · hecho. Guía producción intacta | No sustituye Retell real |
| R4.5 | Piloto Retell / liga en staging | No | Sí: entorno, claves, piloto |
| R4.6 | Comparativa OpenAI vs Retell con mismo oráculo | No | Sí: entorno de prueba |
| R4.7 | AT-16/AT-20 voz+liga con evidencia | No | Sí: tras R4.5 y políticas de canal |

## Dependencias y riesgos

| Dependencia | Impacto |
| --- | --- |
| CV-05 / orquestador R1 | Voz debe reutilizar el mismo contrato de tools; no alterar R1 |
| ID-01 / ID-02 | Liga y grants revalidan permisos del dueño |
| QA-04 | Métricas de latencia/exactitud requieren baseline documentado |
| CM-01 (voz real) | Comunicaciones por voz esperan R4; no reabrir WhatsApp aquí |
| `GUIDE_INTERVIEW_FULL_READ` | Piloto histórico distinto; R4 no lo enciende ni lo cambia sin impacto |

| Riesgo | Mitigación |
| --- | --- |
| Mezclar R4 con cierre R3/H-05 | Worktree/rama `r4/voz-ligas-local`; sin merge a QA |
| Activar proveedores por accidente | Flag off; adaptadores reales no registrados |
| Ampliar alcance de liga | AT-13 primero; sin migraciones ni cambios RLS |
| Declarar GO QA por R4 | R4 no emite GO QA; solo GO local de harness |

## GO / NO-GO específicos de R4

**GO local (R4.1–R4.4):** flags ausentes = off; suites `api/_shared/r4` y `src/features/r4-lab` verdes; cero llamadas a Retell/ElevenLabs/Meta; cero migraciones; `GuidePanel` / `useRetellGuideCall` intactos.

**NO-GO integración / piloto / QA:** sin autorización explícita de entorno, claves, destinatario/piloto de liga y decisión de no interferir con Preview/R3.

**NO-GO liberación:** AT-13/14/16/20 con evidencia de canal; rollback por flag.

## Estado local (R4.1–R4.4)

- `AGENT_VOICE_R4` / `VITE_AGENT_VOICE_R4` apagados salvo valor estricto `1`.
- Orquestador de sesión + store de liga en memoria; ops protegidas exigen autenticación.
- Resiliencia: timeout, máx. 2 reintentos, interrupción, cancelación, finalize único.
- UI: `src/features/r4-lab` reutiliza `GuidePresence`. Ruta redirige a `/asistente-ia` si el flag está off.
- Para ver el laboratorio en local: `VITE_AGENT_VOICE_R4=1` en el worktree (no en QA).
