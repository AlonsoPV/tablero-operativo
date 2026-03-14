/**
 * Feature: Operaciones (spec §5.2, §5.3)
 * Acciones diarias: tabla de control, Kanban, crear/editar, evidencia, estados.
 */

export { useAcciones, useAccionesByDate, useAccion, useCommentCounts } from './hooks'
export {
  useCreateAccion,
  useUpdateAccion,
  useUpdateAccionEstado,
  useDeleteAccion,
} from './hooks'
export { AccionesControlTable } from './components/AccionesControlTable'
export { AccionesFilterBar } from './components/AccionesFilterBar'
export { AccionForm } from './components/AccionForm'
export { AccionFormDialog } from './components/AccionFormDialog'
export { KanbanBoard } from './components/KanbanBoard'
export { KanbanHeader } from './components/KanbanHeader'
export { KanbanToolbar } from './components/KanbanToolbar'
export { CountdownTimer } from './components/CountdownTimer'
export { metricasFromAcciones, type MetricasAcciones } from './utils/metricas'
export type { AccionCreateInput, AccionUpdateInput } from './schemas/accion.schema'
export type { KanbanViewMode } from './components/KanbanHeader'
