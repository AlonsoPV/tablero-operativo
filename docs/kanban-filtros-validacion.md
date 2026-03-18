# Validación: Barra de filtros Kanban / Dashboard

Este documento resume la revisión técnica y el comportamiento de la barra de filtros en Kanban y Dashboard.

## 1. Dónde vive el estado y cómo se usa

- **Estado:** `useState<AccionesFilter>` en `KanbanPage` y `DashboardPage`.
- **Valor inicial:** `{ fecha_creacion: today }` con `today = todayCDMX()` (YYYY-MM-DD en zona CDMX).
- **Conexión con datos:** El mismo `filter` se pasa a `useAcciones(filter)`, que llama a `accionesService.list(filter)`. Los resultados se usan en:
  - **Kanban:** `KanbanBoard` (columnas/cards) y `AccionesControlTable` (vista lista).
  - **Dashboard:** `DashboardKpiCards` (métricas derivadas de `acciones`), `DashboardActionsSection` (tabla) y `KPISemaforoGrid` (usa `filter.fecha_creacion` para semáforo).
- **Filtrado:** Backend (Supabase) para fecha, estado, prioridad, área, responsable; búsqueda por texto en frontend sobre la lista ya devuelta.

## 2. Elementos de la barra y conexión real

| Elemento | Conectado a | Comportamiento |
|----------|-------------|----------------|
| **Fecha** | `filter.fecha_creacion` | Afecta query: `created_at < (fecha + 1 día) 00:00 UTC`. Muestra acciones creadas en o antes de ese día. |
| **Búsqueda** | `filter.search` | Filtrado en frontend sobre la lista: `descripcion_accion` y `evidencia_esperada` (parcial, insensible a mayúsculas). |
| **Estado** | `filter.estado` | Query: `estado IN (...)`. Opciones = `ACTION_STATUS` (incl. Retraso). Valor "all" → sin filtro. |
| **Prioridad** | `filter.prioridad` | Query: `prioridad IN (...)`. Opciones: P1_Critica, P2_Media, P3_Baja. "all" → sin filtro. |
| **Área** | `filter.area` | Query: `area = filter.area`. Opciones desde catálogo `useAreas({ activo: true })` (valor = `area.nombre`). |
| **Responsable** | `filter.responsable` | Query: `responsable = filter.responsable` (UUID). Opciones desde `useUsers({ activo: true })` (valor = `user.id`). |
| **Limpiar** | `onClear` | Resetea a `{ fecha_creacion: today }`. Corregido en Dashboard (antes usaba `fecha` en lugar de `fecha_creacion`). |

No hay filtros “de adorno”: todos modifican el dataset. No hay valores hardcodeados incoherentes con los datos.

## 3. Filtro por fecha

- **Campo usado:** `created_at` (no `fecha` de la acción).
- **Semántica:** “Ver acciones creadas hasta este día” → se muestran las que tienen `created_at` en o antes del día seleccionado.
- **Cálculo:** Se toma `fecha_creacion` (YYYY-MM-DD), se suma 1 día en UTC y se filtra `created_at < (día siguiente)T00:00:00`.
- **Timezone:** El límite se interpreta en UTC. La fecha por defecto viene de `todayCDMX()`, por lo que el “hoy” del usuario en CDMX es correcto como día; el corte a medianoche es UTC.
- **Al limpiar / cambiar fecha:** Los resultados se actualizan porque `filter` cambia, React Query invalida por `queryKey: [...KEY, filter]` y se vuelve a llamar a `list(filter)`.

## 4. Input de búsqueda

- **Campos:** `descripcion_accion` y `evidencia_esperada`.
- **Lógica:** Substring en minúsculas (`toLowerCase()`); no distingue mayúsculas/minúsculas.
- **Momento:** Tras la query (filtrado en frontend sobre la lista ya obtenida). Rendimiento adecuado para listas del tamaño típico.
- **Al borrar:** Se envía `search: undefined`, la lista se re-ejecuta sin término y se muestran de nuevo todos los resultados del resto de filtros.

## 5. Selects (estado, prioridad, área, responsable)

- **Estado:** Opciones = `ACTION_STATUS`; labels en UI (ej. “En ejecución” para `En_Ejecucion`). Value = valor del enum; “Estado” / “all” = sin filtro.
- **Prioridad:** Opciones del tipo; “all” = sin filtro.
- **Área:** Catálogo `areas` (activas); value = `area.nombre`; “Todas las áreas” = sin filtro.
- **Responsable:** Usuarios activos; value = `user.id` (UUID); “Todos” = sin filtro.

Todos aplican correctamente en la query (o en búsqueda, en el caso de search). “Todos” restablece ese criterio sin pisar el resto de filtros.

### Validación por id (KanbanToolbar)

| id | Control | Estado | Backend/Frontend | Comprobado |
|----|--------|--------|------------------|------------|
| `kanban-filter-search` | Input type="search" | `filter.search` | Frontend: filtra en memoria por `descripcion_accion` y `evidencia_esperada` (parcial, case-insensitive) | Sí |
| `kanban-filter-prioridad` | Select | `filter.prioridad` | Backend: `q.in('prioridad', prioridades)`; valores P1_Critica, P2_Media, P3_Baja = enum `prioridad_nc` en BD | Sí |

### Validación explícita: `id="kanban-filter-prioridad"`

- **Ubicación:** `KanbanToolbar.tsx`, Select con opciones `PRIORIDAD_OPTIONS`: `all` (label "Prioridad"), `P1_Critica` (Crítica), `P2_Media` (Media), `P3_Baja` (Baja).
- **Valor mostrado:** `prioridadValue = Array.isArray(filter.prioridad) ? filter.prioridad[0] ?? 'all' : (filter.prioridad ?? 'all')`; "all" no se envía al backend.
- **Al cambiar:** `onValueChange` llama `onFilterChange({ ...filter, prioridad: v === 'all' ? undefined : (v as PrioridadNc) })`, por lo que el estado de la página se actualiza y `useAcciones(filter)` recibe el nuevo `filter` (queryKey incluye `filter` → refetch).
- **Servicio:** `accionesService.list(filter)` aplica `if (filter.prioridad) { prioridades = [].concat(filter.prioridad); q = q.in('prioridad', prioridades) }`; columna BD `prioridad` tipo `prioridad_nc` ('P1_Critica' | 'P2_Media' | 'P3_Baja').
- **Tipos:** `PrioridadNc` en `src/types/enums.ts` coincide con el enum de BD. Conclusión: el filtro está correctamente conectado de extremo a extremo.
| `kanban-filter-area` | Select | `filter.area` | Backend: `q.eq('area', filter.area)`; valor = `areas.nombre` (columna `area` en acciones_diarias es text) | Sí |
| `kanban-filter-responsable` | Select | `filter.responsable` | Backend: `q.eq('responsable', filter.responsable)`; valor = `usuarios.id` (UUID) | Sí |

## 6. Combinación de filtros

Los filtros son acumulativos:

- La query aplica en orden: `fecha_creacion`, `fecha`/`fecha_min`/`fecha_max`, `estado`, `prioridad`, `area`, `responsable`.
- Después se aplica `search` sobre la lista en memoria.
- Cambiar un filtro no resetea los demás: `onFilterChange` hace `setFilter({ ...filter, ... })` (o equivalente en Limpiar).

Se validan combinaciones como fecha+estado, fecha+responsable, búsqueda+prioridad, etc.; el resultado es la intersección de todos los criterios.

## 7. Sincronización con la vista

- **Kanban (tablero):** Las mismas `acciones` que devuelve `useAcciones(filter)` se agrupan por estado (y por “Retraso” calculado con `isEnRetraso`) y se muestran en columnas/cards.
- **Vista lista (cuadrícula):** Misma lista `acciones` en `AccionesControlTable`.
- **Dashboard:** La misma lista alimenta métricas (`metricasFromAcciones(acciones)`), tabla de acciones y el semáforo KPI (que además usa `filter.fecha_creacion` para su propia query). No hay desalineación: una sola fuente de datos para lista, KPIs y semáforo.

## 8. Estado inicial

- **Por defecto:** `filter = { fecha_creacion: today }` con `today = todayCDMX()`.
- **Selects:** Sin selección explícita = “Estado”, “Prioridad”, “Todas las áreas”, “Todos” → valores `undefined`/`'all'` en el estado, que el servicio interpreta como “sin filtrar” en ese criterio.
- La primera carga muestra acciones creadas hasta “hoy” (según la lógica de fecha descrita arriba), sin restricciones extra de estado, prioridad, área o responsable.

## 9. Limpieza / reset

- **Botón “Limpiar”:** Solo se muestra cuando `hasFilters` es true (hay al menos un criterio distinto de “sin filtrar”, incluida la fecha por defecto).
- **Acción:** Restaura `{ fecha_creacion: today }` (en Kanban y en Dashboard; en Dashboard se corrigió el bug que usaba `fecha` en lugar de `fecha_creacion`).
- Tras limpiar, la lista y la UI se actualizan de inmediato vía React Query y no queda estado residual incoherente.

## 10. Persistencia

- **URL (Kanban):** Se lee `?fecha=YYYY-MM-DD` y `?accion=id` al montar; se actualiza `filter.fecha_creacion` con `fecha` y se elimina el parámetro de la URL. No se persisten el resto de filtros en la URL.
- **Estado global / localStorage:** No hay persistencia de filtros fuera del estado local del componente; al recargar o navegar se usa de nuevo el estado inicial (fecha = hoy, resto sin filtrar).

## 11. Filtro “Retraso” vs columna Retraso en Kanban

- **En BD:** Existe el valor `estado = 'Retraso'` (migración `action_status_retraso`).
- **En la vista Kanban:** La columna “Retraso” muestra tanto acciones con `estado === 'Retraso'` como acciones que se consideran en retraso por tiempo (`isEnRetraso(a)`), aunque su `estado` sea Pendiente, Hoy, etc.
- **Al filtrar por Estado = Retraso:** La query solo devuelve filas con `estado = 'Retraso'`. Las que están “en retraso” por tiempo pero con otro estado no se incluyen en ese filtro. Es una decisión de diseño conocida y documentada en código (comentario en `acciones.service.ts`).

## 12. Correcciones realizadas

1. **Dashboard – Limpiar filtros:** `handleClearFilters` pasaba `fecha: today` en lugar de `fecha_creacion: today`, dejando sin filtro de fecha y mostrando todas las acciones. Corregido a `fecha_creacion: today`.
2. **KanbanToolbar – Input búsqueda:** Se eliminó el `className` duplicado en el input de búsqueda.
3. **KanbanToolbar – Labels de estado:** Se añadieron labels legibles para el select Estado (ej. “En ejecución” para `En_Ejecucion`) alineados con el resto de la app.
4. **Comentarios en servicio:** Aclaraciones en `acciones.service.ts` sobre el límite de `fecha_creacion` (UTC), la búsqueda por texto y el filtro de estado “Retraso”.

## 13. Rendimiento y UX

- Un solo `useAcciones(filter)` con `queryKey` que incluye `filter` evita fetches duplicados y mantiene caché por combinación de filtros.
- La búsqueda se hace en memoria sobre la lista ya filtrada; para volúmenes grandes podría valorarse moverla a backend.
- Los selects y el botón Limpiar reaccionan al estado; no se observan flickers ni resets incorrectos al combinar filtros.
