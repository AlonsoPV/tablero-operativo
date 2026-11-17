# DICCIONARIO OPERATIVO DE SCRUMBAN

**Versión:** `ops-dict-2026-11-17-mvp`  
**Fuente de verdad:** [`src/features/ai-support/operationalSemantics/operationalDictionary.ts`](../src/features/ai-support/operationalSemantics/operationalDictionary.ts)  
**Motor:** [`api/_shared/operationalInterpret.ts`](../api/_shared/operationalInterpret.ts)  
**Prompt voz alineado:** `enviardian-voz-2026-11-17-dict`

Este documento refleja el código. Si hay discrepancia, gana el TypeScript.

## Matriz término → entidad → esquema → tool

| Término de negocio | Entidad | Tabla / campo | Tool |
| --- | --- | --- | --- |
| acción / tarea / incidencia | `kanban_action` | `acciones_diarias` | `get_my_actions` / `create_action` |
| iniciativa | `okr_initiative` | módulo OKRs | `get_okr_progress` (no `create_action`) |
| objetivo / OKR | `okr_objective` | módulo OKRs | `get_okr_progress` |
| KR | `okr_key_result` | módulo OKRs | `get_okr_progress` |
| responsable | `role_responsable` | `acciones_diarias.responsable` | `scope=assigned_to_me` |
| creador | `role_creador` | `acciones_diarias.created_by` | `scope=created_by_me` |
| verificador | `role_verificador` | `verificador_dato` / `verificador_gobierno` | `status_group=verification` |
| asignador / solicitante | `role_asignador_unmapped` | *(sin columna)* | aclarar / aproximar con `created_by` |
| rojo (tablero) | `visual_board_red` | prioridad roja ∨ Retraso/overdue | `visual=board_red` |
| prioridad roja | `visual_priority_red` | `priorities.color` | `visual=priority_red` |
| vencida | `visual_overdue` | `isCorporateOverdue` | `visual=overdue` |
| BAU / dashboard | `bau_dashboard` | dashboard | `get_dashboard_summary` (alcance explícito) |
| WhatsApp / correo | `comms_draft` | `assistant_pending_ops` | `queue_workspace_draft` |

## Kanban vs OKRs

- **Kanban:** ejecución operativa (tareas, estados, responsables).
- **OKRs:** objetivos, KRs, iniciativas y avance.
- Una acción Kanban puede relacionarse a un OKR si el modelo lo permite; **no** se convierte automáticamente en iniciativa.
- «Crea una tarea» → `propose_create_kanban` / `create_action`.
- «Registra una iniciativa» → `propose_create_initiative` (no `create_action`).
- Ambiguo («acción al objetivo») → **una** aclaración.

## Roles humanos

| Lenguaje | Campo real |
| --- | --- |
| Yo / mío / me asignaron / responsable | `responsable` = sesión |
| Creé / solicité | `created_by` = sesión |
| Verifico | `verificador_*` o Hecho relacionado |
| Asigné | sin columna asignador → tratar como creador o aclarar |
| Mi equipo | `team_authorized` / `get_team_actions` (permisos) |

Identidad siempre desde sesión autenticada / dueño de liga. No inventar IDs por nombre.

## Estados y colores

- Estado de flujo: Pendiente, Hoy, En_Ejecucion, Bloqueado, Retraso, Hecho, Verificado.
- «Rojo» coloquial = `board_red` (prioridad roja **o** vencida), no solo vencido.
- «Prioridad roja / P1» = `priority_red`.
- Bloqueado ≠ vencido ≠ stale.

## Intenciones del motor

`query` | `propose_create_kanban` | `propose_create_initiative` | `prepare_comms` | `recommend` | `clarify`

El clasificador **no** ejecuta escrituras.

## Canales

| Canal | Consumo |
| --- | --- |
| Voz Retell | `guide-retell-tool` + interpret + `active_query` |
| Chat web | `detectAssistantIntent` + `classifyCreateWorkKind` |
| WhatsApp | proyección Deno [`operationalAliases.ts`](../supabase/functions/_shared/operationalAliases.ts) |

Misma semántica; distinto formato de respuesta.

## Casos ambiguos (preguntar una vez)

1. Tarea Kanban vs iniciativa OKR.
2. Destinatario de comunicación sin canal.
3. «Asignador» si el usuario exige un rol distinto de creador.

## Pruebas

Ver `api/_shared/operationalInterpret.test.ts` y `src/features/ai-support/writeIntent.test.ts`.
