# Auditoría de métricas — fuente única

Dashboard OKR, Dashboard BAU, OKRs, Kanban, Kanban por equipos y el agente leen las mismas funciones. No se crearon tablas ni se modificaron filas de producción.

## Decisiones

- Zona horaria de acciones corporativas: `America/Mexico_City`, con fecha de compromiso y `hora_limite`. La implementa `getAccionKanbanColumn`.
- Vencida corporativa: acción abierta cuya columna efectiva es `Retraso`. `Bloqueado` no entra en vencidas.
- Abierta corporativa: estado distinto de `Hecho` y `Verificado`.
- Pendiente de verificar: `Hecho`. No es vencida ni verificada. Una roja en `Hecho` sigue en rojas abiertas hasta `Verificado`.
- Verificada: solo `Verificado`.
- Población BAU y Kanban general: `acciones_diarias`.
- Población Kanban por equipos: `acciones_equipo`, con `fecha_limite` timestamptz. No se suma a la corporativa. Un escalamiento ligado por `accion_corporativa_id` son dos registros.
- Avance de KR manual: `(actual - línea base) / (meta - línea base)`. Sirve para subir y para bajar. Si falta línea base, valor actual o la meta es igual a la base, el resultado es `null` ("Sin datos suficientes"), no `0`. Un actual igual a la línea base, con meta distinta, sí es `0%`.
- KR operativos: conservan `computed_progress` de `get_operational_okr_dashboard`. Esa fórmula SQL no se modificó.
- Avance de objetivo: promedio de los KR medibles. Las iniciativas no entran al porcentaje.
- Ritmo (`bajo_ritmo` / `en_ritmo`): solo si el período está activo y hay avance medible, comparado con el tiempo transcurrido. `sin_datos` no afirma una causa.
- RLS no se amplió. El agente web sigue con el cliente del usuario. WhatsApp sigue con service role y los filtros de aplicación ya existentes; solo cambió la fórmula sobre esas filas.

## Matriz

| Indicador | Fuente | Filtros | Fórmula | Pantallas | Herramienta |
| --- | --- | --- | --- | --- | --- |
| Vencidas corporativas | `acciones_diarias` | Alcance del tablero (organización, área, responsable, período) | Columna `Retraso` en CDMX | Dashboard BAU, Kanban | `get_dashboard_summary`, `get_my_actions(overdue)` |
| Bloqueadas corporativas | `acciones_diarias` | El mismo alcance | Estado `Bloqueado` y abierta | Dashboard BAU, Kanban | `get_dashboard_summary.blocked_by_area` |
| Pendientes de verificar | `acciones_diarias` | El mismo alcance; el agente personal filtra además por relación del usuario | Estado `Hecho` | Dashboard BAU | `pending_verification`, `get_pending_verifications` |
| Rojas abiertas | `acciones_diarias` | El mismo alcance | Prioridad roja y no `Verificado` | Dashboard BAU, Kanban | Snapshot del chat |
| Avance de KR | `okr_key_results` o `computed_progress` | Mismos objetivos que carga `okrService.dashboard` | `krProgress` | Tab OKR, `/okrs` | `get_okr_progress` |
| Avance de objetivo | KR del objetivo | El mismo | `objectiveProgress` | Tab OKR, `/okrs` | `get_okr_progress.progress` |
| Objetivos sin iniciativas | `okr_initiatives.key_result_id` | Objetivos activos autorizados | Ningún KR tiene iniciativa | Conteos del agente | `without_initiatives` |
| Vencidas de equipo | `acciones_equipo.fecha_limite` | Área o asignado, según permiso | Timestamp anterior a ahora, acción abierta | Kanban por equipos | `get_module_data(team_kanban)` |

## Correcciones

- El Dashboard BAU contaba vencidas como `fecha < hoy` y metía en ese grupo a las bloqueadas con fecha pasada. Ahora usa la columna del Kanban.
- `krProgress` devolvía `0` sin línea base, sin valor actual o con meta igual a la base. Esas respuestas diluían el promedio del objetivo. Ahora devuelven `null` y el promedio ignora esos KR.
- El agente contaba vencidas como `estado = Retraso` o `fecha < hoy`, sin hora límite. Usa `isCorporateOverdue`.
- `get_okr_progress` devolvía valores crudos y consultaba columnas que no existen en `okr_initiatives` (`okr_id`, `title`). Ahora calcula el avance y lee `key_result_id`.
- Los conteos de vencidas del Kanban por equipos usan `isTeamDeadlinePast`, la misma comparación del dashboard de equipo.
- Si una lectura del agente llena su tope (400 abiertas corporativas, 80 en mis acciones, 20 objetivos, 40 iniciativas, 40 de equipo) el payload trae `truncated: true`.

## Reconciliación sobre fixtures

No se consultó producción. La prueba `corporateActionMetrics.test.ts` arma la misma lista y compara el resumen compartido, `kanbanHealthFromAcciones` y `calculateCoreMetrics`.

| Indicador | Dashboard | Fuente canónica | Diferencia | Alcance | Validación |
| --- | --- | --- | --- | --- | --- |
| Vencidas | `calculateCoreMetrics.overdueActions` | `summarizeCorporateActions.overdue` y columna Retraso del Kanban | 0 en el fixture | Organización, reloj fijo CDMX | Prueba automatizada |
| Bloqueadas | `blockedActions` | `summarizeCorporateActions.blocked` | 0 en el fixture | El mismo | Prueba automatizada |
| Abiertas | `openActions` | Estados distintos de Hecho y Verificado | 0 en el fixture | El mismo | Prueba automatizada |
| Pendientes de verificar | `pendingVerificationActions` | Estado Hecho | 0 en el fixture | El mismo | Prueba automatizada |
| Rojas en Hecho | Siguen en rojas abiertas | `kanbanHealthFromAcciones.rojos` | 0 en el fixture | El mismo | Prueba de Kanban existente |
| Avance sin línea base | "Sin datos suficientes" | `krProgress` null | No se muestra como 0% | KR manual | Prueba automatizada |
| Avance de equipo | No entra al BAU | `summarizeTeamActions` descarta filas con `hora_limite` | Poblaciones separadas | `acciones_equipo` | Prueba automatizada |

## Diferencias que quedan a propósito

- Los cuatro KR operativos siguen con la fórmula SQL de `get_operational_okr_dashboard`. El tablero los muestra vía `computed_progress`, no con la fórmula lineal.
- Kanban por equipos no se suma al BAU.
- Un analista ve en el Kanban y en el agente sus acciones (`scope: responsable`). El Dashboard BAU muestra el alcance de los filtros activos y de RLS, y lo escribe en pantalla. No se restringió el Dashboard para forzar la coincidencia.
- `get_team_actions` sigue siendo el tablero corporativo de otras personas, no `acciones_equipo`. El módulo de equipo es `get_module_data` con `team_kanban`.

## Archivos

- `src/features/metrics/corporateActionMetrics.ts`
- `src/features/okrs/model.ts`
- `src/features/okrs/reporting.ts`
- `src/features/operations/utils/accionUtils.ts`
- `src/features/operations/utils/metricas.ts`
- `src/pages/dashboard/hooks/useOperationalDashboardMetrics.ts`
- `src/pages/dashboard/DashboardPage.tsx`
- `src/pages/dashboard/components/BauDashboardOverview.tsx`
- `src/features/team-kanban/utils/teamDashboardMetrics.ts`
- `src/features/team-kanban/TeamKanbanPage.tsx`
- `src/features/ai-support/buildBoardAssistantContext.ts`
- `src/features/ai-support/operationalContext/buildOperationalSnapshot.ts`
- `api/_shared/assistantBoardReads.ts`
- `api/_shared/assistantOpsRuntime.ts`
- `src/features/ai-support/copilot/catalog.ts`

## Despliegue

No hay migraciones. No se editaron datos. No se desplegó. Después de publicar el frontend y las funciones de API, conviene revisar en un usuario con datos reales que el número de vencidas del Dashboard coincida con la columna Retraso del Kanban bajo el mismo filtro.
