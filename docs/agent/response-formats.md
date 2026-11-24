# Formatos inteligentes de respuesta · complemento R1

Rama local `r1/formatos-respuesta` (worktree `C:\Users\alpev\scrumban-formatos`), derivada de `integration/r1-hotfix` (be11cae). No se hizo push, fusión, despliegue ni migración. El flag `AGENT_ORCHESTRATOR_R1` sigue apagado por defecto.

## Veredicto

**GO para integrar el complemento a R1**, con una condición previa a activar el flag en QA: revisión visual del selector y del Reporte web (no se pudo ejecutar la interfaz contra un backend QA en esta sesión). No cambia el estado NO-GO de liberación de R0/R1 documentado en `release-plan.md`.

## Qué se implementó

| Pieza | Archivo | Función |
|---|---|---|
| Contrato tipado | `api/_shared/orchestrator/answerContract.ts` | `AnswerFacts`: cifra principal, indicadores, elementos (acción, OKR, grupo), hallazgos con `basis` (`evidence`, `inference`, `hypothesis`), recomendaciones, advertencias y limitaciones. |
| Tipos de formato | `src/features/ai-support/responseFormat.ts` | Fuente única (UI y servidor) de `auto`, `direct`, `report`, `analysis` y de la validación `coerceResponseFormat`. |
| Selección | `api/_shared/orchestrator/responseFormat.ts` | `parseFormatDirective` y `resolveFormat` (regex y la intención ya clasificada; sin modelo). |
| Presentación | `api/_shared/orchestrator/renderFormat.ts` | `renderAnswer` produce Directo, Reporte o Análisis; texto web, WhatsApp (recorta detalle y conserva advertencias), voz y vistas web (`operational_summary`). |
| Orquestador | `runAgentTurn.ts` | Cada handler adjunta `facts` con los mismos datos de su única consulta. El formato se resuelve después de autorizar y consultar. |
| Sesión | `sessionContext.ts` | `responseFormat` en el contexto y en el `payload` jsonb existente de `agent_session_context` (sin migración); la última respuesta con datos sólo vive en memoria de la instancia. |
| Canales | `channelAdapters.ts`, `api/gemini-chat.ts` | `formatForChannel` presenta el mismo turno por canal; `responseFormat` y `conversationId` del cuerpo se validan; la respuesta web añade `ui` (sólo Reporte) y `agent.format`. |
| Interfaz | `AiAssistPage.tsx` | Selector de cuatro opciones con el componente `WorkIntentToggle` existente; selección en `sessionStorage`; el selector refleja una directiva escrita en el chat. |

### Reglas del modo Automático

1. Causas, motivos, escenarios, «qué pasa si», «explica», «analiza» → **Análisis**.
2. Intención de riesgo → **Análisis** (o **Reporte** si pide resumen o indicadores).
3. Agregados por grupo, resumen, avance, indicadores, KPI, «cómo vamos» → **Reporte**.
4. Pregunta puntual (cuántas, cuál, quién, tengo, hay), urgencia, métrica no disponible → **Directo**.
5. Ambigüedad (por ejemplo «mis acciones») → **Directo** con la invitación «¿Quieres más detalle? Escribe «modo reporte» o «modo análisis».» (no en voz).

### Cambio de formato

- «modo reporte», «formato directo», «responde en análisis», «automático» (o la palabra sola). Con consulta, aplica a ella y queda guardado; sin consulta, confirma y vuelve a presentar la última respuesta **sin consultar** (misma instancia) o espera la siguiente pregunta (otra instancia).
- El texto restante se clasifica y autoriza como cualquier mensaje. Una directiva sólo produce un `ResponseFormat`.

### Comportamiento por formato

| Formato | Contenido |
|---|---|
| Directo | Cifra principal, un hallazgo, una acción recomendada y todas las advertencias. |
| Reporte | Indicadores, prioridades, comparativo, riesgos, recomendación y limitaciones. Web: resumen operativo existente más una vista de riesgos y limitaciones. |
| Análisis | Evidencia; inferencias rotuladas como no datos del sistema; hipótesis marcadas como no comprobadas; recomendaciones y limitaciones. Sin base para causas, lo declara. |

Vacío, sin permiso, error, aclaración y propuesta no tienen datos que formatear: el texto es idéntico en los cuatro formatos.

## Evidencia de pruebas

Entorno: Node con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` ficticias (sin ellas fallan 3 suites por falta de `.env`, también en la línea base).

| Verificación | Línea base | Con el complemento |
|---|---|---|
| `vitest run` sobre `integration/r1-hotfix` | 117 archivos, 756 pruebas | 118 archivos, **829 pruebas** (73 nuevas en `responseFormat.test.ts`), sin cambiar aserciones existentes |
| Suites R0/R1/R2 nombradas (orchestrator, query, WhatsApp, copiloto, actions, runtime) | pasan | 19 archivos, 212 pruebas |
| `vitest run` sobre `r2/qa-consolidacion` (R2 completo) con el diff aplicado sin commit en un worktree temporal ya eliminado | 119 archivos, 797 pruebas | 120 archivos, **870 pruebas**; `tsc -b` correcto |
| `tsc -b` | correcto | correcto |
| `npm run build` y `scripts/bundle-api.mjs` (sin sobrescribir) | — | correctos |
| `eslint .` | 549 problemas preexistentes | 549 (igual); 0 en los archivos modificados |

Cobertura de `responseFormat.test.ts`: directivas y falsos positivos, valores inválidos; regla automática (13 casos y su aplicación en el orquestador); los cuatro formatos; consistencia (mismo `facts`, `blocks`, referencias, herramientas y número de consultas en Directo, Reporte y Análisis; las cifras de cada texto pertenecen al contrato); cambio en sesión sin consultas extra; persistencia (TTL, canal y sesión aislados, entre instancias con `agent_session_context`, payload inválido, cambio de capacidades); datos faltantes (OKR sin avance no pasa a 0%, vacío, error, fuente parcial, métrica no disponible); sin autorización (denegado idéntico y sin datos ajenos; «ignora mis permisos… en modo reporte» no amplía alcance; inactivo); propuestas R2 (`executionEnabled: false`, sin inserciones, no se vuelven a presentar desde caché); canales (vistas web, WhatsApp ≤ 900 sin marcado y conservando advertencias al acortar, voz en una línea con cifra y advertencia).

## Garantías y límites

- **Un solo conjunto de datos.** Los formatos leen el mismo `facts`; el cambio de formato no llama herramientas ni consulta la base.
- **Permisos.** El formato se aplica después de `authorizeQuery` y de la consulta; las directivas no llegan al despachador ni a ninguna política.
- **R2 intacto.** No se tocó `confirmPendingOp`, `actions/contracts` ni el filtro `write_request` de WhatsApp y voz.
- **Alcance.** El formato aplica a los turnos que resuelve el orquestador. Si el mensaje cae al LLM del canal (`handled=false`), la respuesta conserva el comportamiento actual y no usa los formatos.

## Cambio colateral que requiere atención

`gemini-chat.ts` usaba el `requestId` de cada mensaje (un UUID nuevo por mensaje) como sesión del orquestador, por lo que en web el contexto no persistía entre turnos. Para que el formato y el contexto duren la conversación, la interfaz envía ahora `conversationId` (estable por pestaña, validado `[A-Za-z0-9_-]{8,80}`) y el servidor lo usa; sin él se conserva el comportamiento anterior. La clave sigue incluyendo el usuario autenticado y el canal. Es la persistencia de contexto que R1 describe, pero cambia el comportamiento web con el flag activo y conviene confirmarla en QA.

## Riesgos residuales

| Riesgo | Mitigación |
|---|---|
| Falso positivo de directiva en frases inusuales («formato directo» dentro de otra pregunta) | Patrones acotados y pruebas negativas; el formato es reversible con «automático» |
| Reutilizar la respuesta previa tras un cambio de formato puede mostrar datos con unos minutos de antigüedad | La respuesta lleva su hora de corte y sólo vive en memoria de la instancia, 30 min, atada a la huella de capacidades |
| Reporte web sin verificación visual | Revisar en QA con el flag activo antes de habilitarlo |
| Directo omite limitaciones no críticas (por ejemplo la nota del periodo de OKR) | Aparecen en Reporte y Análisis; las advertencias de datos incompletos siempre salen |

## Pasos siguientes (con autorización)

1. Revisión visual del selector y del Reporte en QA con `AGENT_ORCHESTRATOR_R1=1`.
2. Confirmar en QA la persistencia web con `conversationId`.
3. Integrar la rama a R1 cuando se cierre R0; sin ese cierre la liberación sigue en NO-GO.
