# R1–R3 · progreso paralelo local · 2026-11-21

**Repo de trabajo:** `C:\Users\alpev\scrumban-qa-local`  
**Rama:** `work/r1-r2-r3-local`  
**R0:** permanece **NO-GO**. E1 no firmada ni ejecutada. Sin escrituras PROD, sin cron, sin WhatsApp real, sin Vault.

Gates (no se infieren entre sí):

| Gate | Estado |
| --- | --- |
| GO LOCAL | Sí — Vitest **136/136 archivos, 944/944 PASS** (Fase 1: suites supabaseUrl cerradas) |
| READY FOR QA AUTHORIZATION | Sí — [`qa-go-nogo-matrix.md`](qa-go-nogo-matrix.md); **H-01…H-10 no ejecutados** |
| GO QA | **NO-GO** (Fase 2 sujeta a autorización) |
| GO PROD | **NO-GO** (R0 NO-GO; R1–R3 no liberados) |

## Matriz MVP A1–A5 + UX (clasificación de pruebas)

Ningún caso de esta tabla es QA remoto.

| Flujo | Tipo de prueba | Evidencia | Estado |
| --- | --- | --- | --- |
| A1 consulta/priorización | Integración orquestador | `mvpFlows.integration.test.ts`: Carlos → atrasados → «cuál es el más urgente» (`a9`) → `recommend_next`; `asOf`/Corte; analista sin Plan privado | GO LOCAL |
| A2 acciones simulated | Integración orquestador | propose → `confirmPendingOp` simulated → 1 fila Kanban; retry `request_key`; cancel sin mutar; Verificado forbidden; Dirección no confirma ops ajenas | GO LOCAL simulated |
| A2 UI | Unitario | `proposalExecutionBadge` Simulado/Ejecutado; copy «Aprobar (simulación)» | GO LOCAL |
| A3 seguimiento | Integración orquestador | «Prepara un seguimiento» → 1 propuesta por responsable; >3 aclara; 0 outbox | GO LOCAL simulated |
| A4 memoria | Integración orquestador | `looksLikeMemoryAsk` verificación; `runChannelTurn` inyecta store si `AGENT_MEMORY_R3===1`; v2 published / v1 withdrawn; org B opaca; fallo de store + tablero | GO LOCAL harness |
| A5 paridad | Simulación Vitest | mismas frases A1/A3 web vs WA, mismos `references.id`, 0 Graph | GO LOCAL harness |
| UX entrada/chat | Unitario | LaneChooser Consultar / Sesión guiada, `grid-cols-1 min-[380px]:grid-cols-2`; Welcome ≤3 stats | GO LOCAL |
| Conversación e2e | e2e Vitest (no Playwright) | `conversation.e2e.test.ts` (suite existente) | GO LOCAL previo |
| Regresión | Vitest | 136 archivos, **944/944 PASS**. Las 3 suites de export/draft eran init (`createClient('')`), no entorno QA | GO LOCAL |

## READY FOR QA AUTHORIZATION (no GO QA)

Reutiliza H-01…H-10 de [`qa-r1-r2.md`](qa-r1-r2.md). **No ejecutar** JWT/API remoto, Preview ni seed hasta autorización humana.

| Ítem | Condición para autorizar QA | Prohibido |
| --- | --- | --- |
| Destino | Instancia QA aislada; JWT sintéticos; RLS de esa instancia | DEV `tgiuevzlyptzlfgxsfhj`, PROD `xhpasmjzuwifmjhrsumb` |
| Migración R3 | `20261121150601_agent_memory_documents.sql` **sólo** en QA autorizado | `db push` / repair a DEV/PROD |
| Flags Preview | `AGENT_ORCHESTRATOR_R1=1`; `R2_EXECUTION_MODE` unset; `AGENT_MEMORY_R3` unset salvo harness | Flags en Production; `R2_EXECUTION_MODE=qa` sin allowlist QA |
| R2 | Confirmación en Preview debe quedar `EXECUTION_DISABLED` (H-08) | Execute real, Graph, SMTP |
| Rollback | Quitar `AGENT_ORCHESTRATOR_R1` de Preview y redesplegar (H-10) | Apagar Production por error |
| RD-06 | Revisión humana **antes de 2026-11-27** | Auto-repair / `db push` |
| GO QA / GO PROD | Requieren firma aparte | Inferirlos de este documento |

## Completadas / integradas / pendientes

1. **Completadas (GO LOCAL):** A1 intents `who_most_urgent` sin exigir «quién» + `recommend_next`; A2 cadena simulated; A3 seguimiento; A4 wiring `memoryStore`; A5 paridad; UX Consultar/Sesión guiada.
2. **Integradas:** orquestador real (`runAgentTurn` / `runChannelTurn`); badge Simulado en `AssistantProposalCard`.
3. **Pendientes:** JWT/RLS QA, Preview R1, apply migraciones remotas, execute R2 real, AC-04, ingest documental admin, E1.
4. **Bloqueos reales:** R0 NO-GO; RD-06 hasta 2026-11-27; sin tercer proyecto Supabase Free.

## Riesgos de seguridad

- `AGENT_MEMORY_R3` y `R2_EXECUTION_MODE=simulated` sólo en local; no en PROD.
- Recall revalida acceso; denegación opaca sin títulos ajenos.
- Execute R2 sigue disabled por defecto; refs DEV/PROD bloqueadas en modo qa.
- Pack R0 untracked **no** se mezcla en commits de producto.

## Archivos principales tocados (este ciclo)

- `api/_shared/orchestrator/intent.ts`, `runAgentTurn.ts`, `channelAdapters.ts`, `responseFormat.ts`
- `api/_shared/orchestrator/mvpFlows.integration.test.ts`
- `api/_shared/actions/r2OrchestratorBridge.test.ts`
- `api/_shared/orchestrator/whatsappSimulator.r3.test.ts`
- `src/features/ai-support/components/AssistantLaneChooser.tsx`, `AssistantWelcome.tsx`, `AssistantProposalCard.tsx`
- `src/features/ai-support/copilot/types.ts`, `actionLifecycle.ts`
- este archivo y `product-backlog.md`

## Próximas cinco prioridades

1. Firma humana **E1** (fuera de este ciclo).
2. Autorización de QA (JWT/RLS) en instancia aislada — **no ejecutar** hasta entonces.
3. Preview R1 (`AGENT_ORCHESTRATOR_R1=1` solo Preview; R2 unset).
4. Aplicar migraciones R1/R3 **sólo** en instancia QA autorizada, nunca PROD.
5. RD-06 revisión humana pre-2026-11-27.
