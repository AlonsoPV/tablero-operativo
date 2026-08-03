import type { Cell, Sheet, SheetData } from 'write-excel-file/browser'
import type { AccionDiaria } from '@/types'
import type { UserProfile } from '@/features/users/types/user.types'
import type { Priority, Status } from '@/features/catalogs/types/catalogs.types'
import { getCommentTypeLabel } from '@/constants/commentTypes'
import {
  kanbanExportService,
  type KanbanExportDetails,
} from '@/services/kanbanExport.service'

const HEADER_STYLE = {
  fontWeight: 'bold' as const,
  textColor: '#FFFFFF',
  backgroundColor: '#155E75',
  alignVertical: 'center' as const,
  wrap: true,
  height: 30,
  borderColor: '#CBD5E1',
  borderStyle: 'thin' as const,
}

const BODY_STYLE = {
  alignVertical: 'top' as const,
  wrap: true,
  borderColor: '#E2E8F0',
  borderStyle: 'thin' as const,
}

type UserNameRecord = Pick<UserProfile, 'id' | 'nombre'>

export interface ExportKanbanExcelInput {
  acciones: AccionDiaria[]
  users: UserNameRecord[]
  priorities: Priority[]
  statuses: Status[]
  exportedByName?: string | null
}

export interface BuildKanbanWorkbookInput extends ExportKanbanExcelInput {
  details: KanbanExportDetails
  generatedAt: Date
}

function headerRow(labels: string[]): Cell[] {
  return labels.map((value) => ({ value, ...HEADER_STYLE }))
}

function bodyCell(value: string | number | boolean | Date | null | undefined, format?: string): Cell {
  if (value == null || value === '') return { value: '', ...BODY_STYLE }
  return { value, ...(format ? { format } : {}), ...BODY_STYLE }
}

function dateOnly(value: string | null | undefined): Date | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function timestamp(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function countByAction<T extends { accion_id: string }>(rows: T[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.accion_id, (counts.get(row.accion_id) ?? 0) + 1)
  return counts
}

function actionTitleMap(actions: AccionDiaria[]): Map<string, string> {
  return new Map(actions.map((action) => [action.id, action.titulo_accion]))
}

function makeSheet(sheet: string, data: SheetData, widths: number[], stickyColumnsCount = 1): Sheet<Blob> {
  return {
    sheet,
    data,
    columns: widths.map((width) => ({ width })),
    stickyRowsCount: 1,
    stickyColumnsCount,
    showGridLines: false,
    zoomScale: 0.85,
  }
}

export function buildKanbanWorkbookSheets(input: BuildKanbanWorkbookInput): Sheet<Blob>[] {
  const { acciones, details, generatedAt } = input
  const users = new Map(input.users.map((user) => [user.id, user.nombre]))
  const priorityNames = new Map(input.priorities.map((priority) => [priority.id, priority.nombre]))
  const statusNames = new Map(
    input.statuses.flatMap((status) => {
      const keys = [status.estado_key, status.nombre].filter(Boolean) as string[]
      return keys.map((key) => [key, status.nombre] as const)
    })
  )
  const titles = actionTitleMap(acciones)
  const commentCounts = countByAction(details.comentarios)
  const evidenceCounts = countByAction(details.evidencias)
  const dateChangeCounts = countByAction(details.cambiosFecha)
  const checkpointsByAction = new Map<string, { total: number; completed: number }>()
  for (const checkpoint of details.checkpoints) {
    const current = checkpointsByAction.get(checkpoint.accion_id) ?? { total: 0, completed: 0 }
    if (checkpoint.activo) {
      current.total += 1
      if (checkpoint.completado) current.completed += 1
    }
    checkpointsByAction.set(checkpoint.accion_id, current)
  }

  const statusCounts = new Map<string, number>()
  for (const action of acciones) statusCounts.set(action.estado, (statusCounts.get(action.estado) ?? 0) + 1)

  const summary: SheetData = [
    [{ value: 'Exportación completa de Kanban', columnSpan: 4, fontSize: 16, ...HEADER_STYLE }, null, null, null],
    [bodyCell('Generado'), bodyCell(generatedAt, 'yyyy-mm-dd hh:mm'), bodyCell('Acciones'), bodyCell(acciones.length)],
    [bodyCell('Exportado por'), bodyCell(input.exportedByName ?? 'Usuario'), bodyCell('Comentarios'), bodyCell(details.comentarios.length)],
    [bodyCell('Checklist'), bodyCell(details.checkpoints.length), bodyCell('Evidencias'), bodyCell(details.evidencias.length)],
    [bodyCell('Cambios de fecha'), bodyCell(details.cambiosFecha.length), bodyCell('Alcance'), bodyCell('Filtros visibles del Kanban')],
    [],
    headerRow(['Estado', 'Nombre visible', 'Acciones', '% del total']),
    ...[...statusCounts.entries()].map(([status, count]) => [
      bodyCell(status),
      bodyCell(statusNames.get(status) ?? status),
      bodyCell(count),
      bodyCell(acciones.length > 0 ? count / acciones.length : 0, '0.0%'),
    ]),
  ]

  const actionHeaders = [
    'ID acción', 'Título', 'Descripción', 'Estado', 'Estado visible', 'Prioridad', 'Prioridad ID',
    'Área', 'Responsable', 'Responsable ID', 'Creada por', 'Creada por ID', 'Última modificación por',
    'Última modificación por ID', 'Fecha compromiso', 'Hora límite', 'Evidencia esperada',
    'Evidencia cargada', 'Evidencia adjunta legacy', 'KPI afectado', 'Brecha ID', 'Tipo de acción',
    'Story points', 'KPI catálogo ID', 'OKR impactado', 'Proceso', 'Cliente ID', 'Causa raíz',
    'Responsable del bloqueo', 'Escalada', 'Fecha escalamiento', 'Notas escalamiento', 'Repetición',
    'Verificador de dato', 'Verificador de dato ID', 'Verificador de gobierno', 'Verificador de gobierno ID',
    'Sprint ID', 'Completada el', 'Completada por', 'Completada por ID', 'Verificada el',
    'Verificada por', 'Verificada por ID', 'Comentarios', 'Checks completados', 'Checks totales',
    'Evidencias', 'Cambios de fecha', 'Creada el', 'Actualizada el', 'JSON completo',
  ]
  const actionRows: SheetData = acciones.map((action) => {
    const checkpoint = checkpointsByAction.get(action.id) ?? { total: 0, completed: 0 }
    return [
      bodyCell(action.id), bodyCell(action.titulo_accion), bodyCell(action.descripcion_accion),
      bodyCell(action.estado), bodyCell(statusNames.get(action.estado) ?? action.estado),
      bodyCell(action.prioridad_id ? (priorityNames.get(action.prioridad_id) ?? action.prioridad) : action.prioridad),
      bodyCell(action.prioridad_id), bodyCell(action.area), bodyCell(users.get(action.responsable)),
      bodyCell(action.responsable), bodyCell(users.get(action.created_by ?? '')), bodyCell(action.created_by),
      bodyCell(users.get(action.updated_by ?? '')), bodyCell(action.updated_by),
      bodyCell(dateOnly(action.fecha), 'yyyy-mm-dd'), bodyCell(action.hora_limite),
      bodyCell(action.evidencia_esperada), bodyCell(action.evidencia_cargada), bodyCell(action.evidencia_adjunta),
      bodyCell(action.kpi_afectado), bodyCell(action.gap_id), bodyCell(action.tipo_accion),
      bodyCell(action.story_points), bodyCell(action.catalog_kpi_id), bodyCell(action.okr_impactado),
      bodyCell(action.proceso), bodyCell(action.cliente_id), bodyCell(action.causa_raiz),
      bodyCell(users.get(action.responsable_bloqueo ?? '') ?? action.responsable_bloqueo),
      bodyCell(action.escalado), bodyCell(timestamp(action.fecha_escalamiento), 'yyyy-mm-dd hh:mm'),
      bodyCell(action.notas_escalamiento), bodyCell(action.repeticion),
      bodyCell(users.get(action.verificador_dato ?? '')), bodyCell(action.verificador_dato),
      bodyCell(users.get(action.verificador_gobierno ?? '')), bodyCell(action.verificador_gobierno),
      bodyCell(action.sprint_id), bodyCell(timestamp(action.completed_at), 'yyyy-mm-dd hh:mm'),
      bodyCell(users.get(action.completed_by ?? '')), bodyCell(action.completed_by),
      bodyCell(timestamp(action.verified_at), 'yyyy-mm-dd hh:mm'), bodyCell(users.get(action.verified_by ?? '')),
      bodyCell(action.verified_by), bodyCell(commentCounts.get(action.id) ?? 0),
      bodyCell(checkpoint.completed), bodyCell(checkpoint.total), bodyCell(evidenceCounts.get(action.id) ?? 0),
      bodyCell(dateChangeCounts.get(action.id) ?? 0), bodyCell(timestamp(action.created_at), 'yyyy-mm-dd hh:mm'),
      bodyCell(timestamp(action.updated_at), 'yyyy-mm-dd hh:mm'), bodyCell(JSON.stringify(action)),
    ]
  })

  const comments: SheetData = [
    headerRow(['ID comentario', 'ID acción', 'Acción', 'Tipo', 'Comentario', 'Autor', 'Autor ID', 'Asignado', 'Asignado ID', 'Etiquetados', 'Etiquetados IDs', 'Adjuntos', 'Rutas de adjuntos', 'Fecha']),
    ...details.comentarios.map((comment) => [
      bodyCell(comment.id), bodyCell(comment.accion_id), bodyCell(titles.get(comment.accion_id)),
      bodyCell(getCommentTypeLabel(comment.tipo_comentario) ?? 'Sin clasificar'), bodyCell(comment.contenido),
      bodyCell(users.get(comment.created_by ?? '')), bodyCell(comment.created_by),
      bodyCell(users.get(comment.asignado ?? '')), bodyCell(comment.asignado),
      bodyCell(comment.etiquetas.map((id) => users.get(id) ?? id).join(', ')), bodyCell(comment.etiquetas.join(', ')),
      bodyCell(comment.adjuntos.map((file) => file.file_name).join(', ')),
      bodyCell(comment.adjuntos.map((file) => file.storage_path).join(', ')),
      bodyCell(timestamp(comment.created_at), 'yyyy-mm-dd hh:mm'),
    ]),
  ]

  const checklist: SheetData = [
    headerRow(['ID check', 'ID acción', 'Acción', 'Orden', 'Punto a validar', 'Obligatorio', 'Activo', 'Completado', 'Responsable', 'Responsable ID', 'Marcado por', 'Marcado por ID', 'Marcado el', 'Creado por', 'Creado por ID', 'Creado el', 'Actualizado el']),
    ...details.checkpoints.map((item) => [
      bodyCell(item.id), bodyCell(item.accion_id), bodyCell(titles.get(item.accion_id)), bodyCell(item.orden),
      bodyCell(item.texto), bodyCell(item.obligatorio), bodyCell(item.activo), bodyCell(item.completado),
      bodyCell(users.get(item.responsable_id ?? '')), bodyCell(item.responsable_id),
      bodyCell(users.get(item.checked_by ?? '')), bodyCell(item.checked_by),
      bodyCell(timestamp(item.checked_at), 'yyyy-mm-dd hh:mm'), bodyCell(users.get(item.created_by ?? '')),
      bodyCell(item.created_by), bodyCell(timestamp(item.created_at), 'yyyy-mm-dd hh:mm'),
      bodyCell(timestamp(item.updated_at), 'yyyy-mm-dd hh:mm'),
    ]),
  ]

  const evidences: SheetData = [
    headerRow(['ID evidencia', 'ID acción', 'Acción', 'Archivo', 'Tipo de contenido', 'Ruta Storage', 'Subida por', 'Subida por ID', 'Fecha de carga']),
    ...details.evidencias.map((item) => [
      bodyCell(item.id), bodyCell(item.accion_id), bodyCell(titles.get(item.accion_id)), bodyCell(item.file_name),
      bodyCell(item.content_type), bodyCell(item.storage_path), bodyCell(users.get(item.uploaded_by ?? '')),
      bodyCell(item.uploaded_by), bodyCell(timestamp(item.uploaded_at), 'yyyy-mm-dd hh:mm'),
    ]),
  ]

  const dateChanges: SheetData = [
    headerRow(['ID cambio', 'ID acción', 'Acción', 'Motivo', 'Motivo clave', 'Fecha anterior', 'Fecha nueva', 'Cambió', 'Cambió ID', 'Registrado el']),
    ...details.cambiosFecha.map((item) => [
      bodyCell(item.id), bodyCell(item.accion_id), bodyCell(titles.get(item.accion_id) ?? item.accion_titulo),
      bodyCell(item.motivo_label), bodyCell(item.motivo_key), bodyCell(dateOnly(item.fecha_anterior), 'yyyy-mm-dd'),
      bodyCell(dateOnly(item.fecha_nueva), 'yyyy-mm-dd'), bodyCell(item.changed_by_nombre ?? users.get(item.changed_by ?? '')),
      bodyCell(item.changed_by), bodyCell(timestamp(item.created_at), 'yyyy-mm-dd hh:mm'),
    ]),
  ]

  return [
    makeSheet('Resumen', summary, [24, 28, 22, 18], 0),
    makeSheet('Acciones', [headerRow(actionHeaders), ...actionRows], actionHeaders.map((_, index) => index === 1 ? 32 : index === 2 || index === 51 ? 45 : 20), 2),
    makeSheet('Comentarios', comments, [20, 20, 30, 18, 50, 24, 20, 24, 20, 36, 36, 30, 45, 20], 2),
    makeSheet('Checklist', checklist, [20, 20, 30, 10, 45, 14, 12, 14, 24, 20, 24, 20, 20, 24, 20, 20, 20], 2),
    makeSheet('Evidencias', evidences, [20, 20, 30, 30, 24, 45, 24, 20, 20], 2),
    makeSheet('Cambios de fecha', dateChanges, [20, 20, 30, 34, 24, 18, 18, 24, 20, 20], 2),
  ]
}

export async function exportKanbanToExcel(input: ExportKanbanExcelInput): Promise<void> {
  if (input.acciones.length === 0) throw new Error('No hay acciones visibles para exportar.')

  const details = await kanbanExportService.loadDetails(input.acciones.map((action) => action.id))
  const generatedAt = new Date()
  const sheets = buildKanbanWorkbookSheets({ ...input, details, generatedAt })
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const date = generatedAt.toISOString().slice(0, 10)

  await writeExcelFile(sheets, { fontFamily: 'Aptos', fontSize: 10 }).toFile(
    `acciones-kanban-${date}.xlsx`
  )
}
