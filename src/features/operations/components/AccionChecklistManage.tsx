/**
 * Checklist en edición/seguimiento: datos en servidor; cada cambio persiste al instante.
 * Puntos completados: no se editan ni eliminan (trazabilidad); solo se puede desmarcar el check.
 */

import { useCallback, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle2, CircleDashed, ListChecks, Plus, Trash2, ChevronUp, ChevronDown, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateTimeCDMX } from '@/lib/dateUtils'
import type { AccionCheckpoint } from '@/types'
import { useAccionCheckpoints } from '../hooks/useAccionCheckpoints'
import {
  useDeleteAccionCheckpoint,
  useInsertAccionCheckpoint,
  useToggleAccionCheckpoint,
  useUpdateAccionCheckpoint,
} from '../hooks/useAccionCheckpointMutations'
import { AccionChecklistProgress } from './AccionChecklistProgress'
import { AccionFormSection } from './AccionFormSection'
import { cn } from '@/lib/utils'
import {
  ACCION_CHECKLIST_EDIT_INFO_HINT,
  ACCION_CHECKLIST_MAX_LEN,
  ACCION_CHECKLIST_MIN_LEN,
  ACCION_CHECKLIST_SECTION_EYEBROW,
  ACCION_CHECKLIST_SECTION_TITLE,
} from './accionChecklistSection'

const MAX_LEN = ACCION_CHECKLIST_MAX_LEN
const MIN_LEN = ACCION_CHECKLIST_MIN_LEN
const NONE_RESPONSABLE = '__none__'

function auditSummary(
  c: AccionCheckpoint,
  responsableNames: Record<string, string>
): { line: string; title: string } | null {
  if (!c.completado || !c.checked_at) return null
  const who = c.checked_by
    ? responsableNames[c.checked_by] ?? `Usuario (${c.checked_by.slice(0, 8)}...)`
    : 'Usuario no registrado'
  const when = formatDateTimeCDMX(c.checked_at)
  return {
    line: `Validado por ${who} · ${when}`,
    title: `checked_by: ${c.checked_by ?? '—'}\nchecked_at: ${c.checked_at}`,
  }
}

export interface AccionChecklistManageProps {
  accionId: string
  /** usuarios.id del usuario actual (marca checked_by al completar). */
  currentUsuarioId: string | null
  disabled?: boolean
  readOnly?: boolean
  canEditStructure?: boolean
  canAddPoint?: boolean
  canToggle?: boolean
  /** Nombres para mostrar auditoría de `checked_by` (mismo mapa que responsables del diálogo). */
  responsableNames?: Record<string, string>
  users?: { id: string; nombre: string; rol?: string | null; area?: string | null }[]
  onResponsableAssigned?: (input: {
    usuarioId: string
    checkpointText: string
    checkpointId?: string
    previousUsuarioId?: string | null
  }) => Promise<void> | void
}

function responsableLabel(
  userId: string | null | undefined,
  responsableNames: Record<string, string>,
  users: { id: string; nombre: string }[]
) {
  if (!userId) return 'Sin responsable especifico'
  return responsableNames[userId] ?? users.find((user) => user.id === userId)?.nombre ?? 'Usuario asignado'
}

export function AccionChecklistManage({
  accionId,
  currentUsuarioId,
  disabled,
  readOnly = false,
  canEditStructure,
  canAddPoint,
  canToggle,
  responsableNames = {},
  users = [],
  onResponsableAssigned,
}: AccionChecklistManageProps) {
  const { data: checkpoints = [], isLoading } = useAccionCheckpoints(accionId)
  const insertCp = useInsertAccionCheckpoint()
  const deleteCp = useDeleteAccionCheckpoint()
  const updateCp = useUpdateAccionCheckpoint()
  const toggleCp = useToggleAccionCheckpoint()

  const [draft, setDraft] = useState('')
  const [draftResponsableId, setDraftResponsableId] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...checkpoints].sort((a, b) => a.orden - b.orden || a.created_at.localeCompare(b.created_at)),
    [checkpoints]
  )

  const completados = sorted.filter((c) => c.completado).length
  const total = sorted.length
  const pendientes = total - completados

  const maxOrden = sorted.length ? Math.max(...sorted.map((c) => c.orden)) : -1
  const mayEditStructure = !readOnly && (canEditStructure ?? true)
  const mayAddPoint = !readOnly && (canAddPoint ?? mayEditStructure)
  const mayToggle = !readOnly && (canToggle ?? true)

  const addPoint = useCallback(async () => {
    const t = draft.trim()
    if (t.length < 3) {
      toast.error('El punto debe tener al menos 3 caracteres.')
      return
    }
    if (t.length > MAX_LEN) return
    const lower = t.toLowerCase()
    if (sorted.some((c) => c.texto.trim().toLowerCase() === lower)) {
      toast.error('Ya existe un punto con el mismo texto.')
      return
    }
    try {
      await insertCp.mutateAsync({
        accion_id: accionId,
        texto: t,
        orden: maxOrden + 1,
        obligatorio: true,
        responsable_id: draftResponsableId,
        created_by: currentUsuarioId,
      })
      if (draftResponsableId) {
        await onResponsableAssigned?.({
          usuarioId: draftResponsableId,
          checkpointText: t,
        })
      }
      setDraft('')
      setDraftResponsableId(null)
      toast.success('Punto agregado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo agregar el punto')
    }
  }, [currentUsuarioId, draft, draftResponsableId, accionId, maxOrden, insertCp, onResponsableAssigned, sorted])

  const removePoint = async (c: AccionCheckpoint) => {
    if (c.completado) {
      toast.error('No se puede eliminar un punto ya validado (trazabilidad).')
      return
    }
    try {
      await deleteCp.mutateAsync({ id: c.id, accionId: accionId })
      toast.success('Punto eliminado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar')
    }
  }

  const swapOrden = async (c: AccionCheckpoint, dir: -1 | 1) => {
    const idx = sorted.findIndex((x) => x.id === c.id)
    const j = idx + dir
    if (idx < 0 || j < 0 || j >= sorted.length) return
    const other = sorted[j]
    try {
      await Promise.all([
        updateCp.mutateAsync({ id: c.id, accionId, patch: { orden: other.orden } }),
        updateCp.mutateAsync({ id: other.id, accionId, patch: { orden: c.orden } }),
      ])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo reordenar')
    }
  }

  const saveTexto = async (c: AccionCheckpoint, texto: string) => {
    if (c.completado) return
    const t = texto.trim()
    if (t.length < 3) {
      toast.error('Mínimo 3 caracteres')
      return
    }
    if (t === c.texto.trim()) return
    try {
      await updateCp.mutateAsync({ id: c.id, accionId, patch: { texto: t } })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }

  const saveResponsable = async (c: AccionCheckpoint, responsableId: string | null) => {
    if (c.completado || responsableId === (c.responsable_id ?? null)) return
    try {
      await updateCp.mutateAsync({ id: c.id, accionId, patch: { responsable_id: responsableId } })
      if (responsableId) {
        await onResponsableAssigned?.({
          usuarioId: responsableId,
          checkpointText: c.texto,
          checkpointId: c.id,
          previousUsuarioId: c.responsable_id ?? null,
        })
      }
      toast.success(responsableId ? 'Responsable del check actualizado' : 'Responsable del check removido')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo actualizar el responsable del check')
    }
  }

  const onToggle = async (c: AccionCheckpoint, checked: boolean) => {
    try {
      await toggleCp.mutateAsync({
        id: c.id,
        accionId,
        completado: checked,
        checkedByUsuarioId: checked ? currentUsuarioId : null,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo actualizar')
    }
  }

  const structureBusy =
    disabled ||
    insertCp.isPending ||
    deleteCp.isPending ||
    updateCp.isPending
  const toggleBusy = disabled || toggleCp.isPending

  const draftTrim = draft.trim()
  const draftTooShort = draftTrim.length > 0 && draftTrim.length < MIN_LEN
  const canAdd = mayAddPoint && !structureBusy && draftTrim.length >= MIN_LEN

  return (
    <AccionFormSection
      sectionId={`accion-checklist-manage-${accionId}`}
      icon={ListChecks}
      eyebrow={ACCION_CHECKLIST_SECTION_EYEBROW}
      title={ACCION_CHECKLIST_SECTION_TITLE}
      infoHint={ACCION_CHECKLIST_EDIT_INFO_HINT}
      bodyClassName="space-y-3 pb-1 pt-0 sm:space-y-3"
    >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando puntos...</p>
        ) : (
          <>
            <AccionChecklistProgress completados={completados} total={total} />
            {!mayEditStructure && (mayAddPoint || mayToggle) && (
              <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs leading-snug text-muted-foreground">
                Puedes agregar nuevos puntos y marcar validaciones. La edición de textos, orden y eliminación queda
                reservada para quien administra la acción, Dirección o super_admin.
              </p>
            )}
            {!mayEditStructure && !mayAddPoint && !mayToggle && (
              <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs leading-snug text-muted-foreground">
                Solo quien administra la acción, Dirección o super_admin puede editar el checklist.
              </p>
            )}
            {pendientes > 0 && total > 0 && (
              <p className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs leading-snug text-amber-950 dark:text-amber-100">
                Faltan <span className="font-semibold tabular-nums">{pendientes}</span> punto
                {pendientes !== 1 ? 's' : ''} para poder marcar la acción como <strong>Hecha</strong>.
              </p>
            )}

            {mayAddPoint && (
            <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 p-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="checkpoint-add-edit" className="text-xs font-semibold text-foreground/80">
                    Indicacion
                  </Label>
                  <Input
                    id="checkpoint-add-edit"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Describe que debe validarse"
                    maxLength={MAX_LEN}
                    disabled={structureBusy}
                    className="h-10 min-w-0 bg-background text-sm"
                    aria-invalid={draftTooShort}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void addPoint()
                      }
                    }}
                  />
                  <p className={cn('text-[11px] leading-snug', draftTooShort ? 'text-destructive' : 'text-muted-foreground')}>
                    {draftTooShort
                      ? `Escribe al menos ${MIN_LEN} caracteres o borra el texto.`
                      : `Min. ${MIN_LEN} caracteres · ${draftTrim.length}/${MAX_LEN}`}
                  </p>
                </div>
                <div className="pt-6">
                  <Label htmlFor="checkpoint-add-responsable" className="sr-only">
                    Responsable del check
                  </Label>
                  <Select
                    value={draftResponsableId ?? NONE_RESPONSABLE}
                    onValueChange={(value) => setDraftResponsableId(value === NONE_RESPONSABLE ? null : value)}
                    disabled={structureBusy}
                  >
                    <SelectTrigger
                      id="checkpoint-add-responsable"
                      className="h-10 w-10 justify-center bg-background px-0 [&>svg:last-child]:ml-0 [&>svg:last-child]:h-3.5 [&>svg:last-child]:w-3.5"
                      title={`Responsable: ${responsableLabel(draftResponsableId, responsableNames, users)}`}
                    >
                      <UserRound className={cn('h-4 w-4', draftResponsableId ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
                      <span className="sr-only">
                        <SelectValue placeholder="Sin responsable especifico" />
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_RESPONSABLE}>Sin responsable especifico</SelectItem>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant={canAdd ? 'default' : 'outline'}
                  className="mt-6 h-10 w-10 shrink-0"
                  disabled={!canAdd}
                  onClick={() => void addPoint()}
                  aria-label="Agregar punto al checklist"
                  title="Agregar punto"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
            )}

            {sorted.length > 0 ? (
              <ul className="space-y-1.5">
                {sorted.map((c, index) => {
                  const audit = auditSummary(c, responsableNames)
                  const showStructureActions = !c.completado && mayEditStructure
                  const canToggleCheckpoint = mayToggle || c.responsable_id === currentUsuarioId
                  const ownerName = responsableLabel(c.responsable_id, responsableNames, users)
                  return (
                    <li
                      key={c.id}
                      className={cn(
                        'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-2.5 py-2 transition-colors sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]',
                        c.completado
                          ? 'border-emerald-500/30 bg-emerald-500/[0.07]'
                          : 'border-border/60 bg-background/95 hover:border-border'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={c.completado}
                        disabled={!canToggleCheckpoint || toggleBusy}
                        onChange={(e) => void onToggle(c, e.target.checked)}
                        className="h-4 w-4 shrink-0 rounded border-input text-primary focus:ring-2 focus:ring-ring focus:ring-offset-1"
                        aria-label={c.completado ? 'Desmarcar validación' : 'Marcar como validado'}
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                              c.completado
                                ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                                : 'bg-muted text-foreground/65'
                            )}
                            title={c.completado ? 'Validado' : 'Pendiente'}
                            aria-label={c.completado ? 'Validado' : 'Pendiente'}
                          >
                            {c.completado ? (
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                            ) : (
                              <CircleDashed className="h-3.5 w-3.5" aria-hidden />
                            )}
                          </span>
                          {c.completado || !mayEditStructure ? (
                            <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground [overflow-wrap:anywhere]">
                              {c.texto}
                            </p>
                          ) : (
                            <Input
                              key={`${c.id}-${c.updated_at}`}
                              defaultValue={c.texto}
                              disabled={structureBusy}
                              maxLength={MAX_LEN}
                              className="h-8 min-w-[160px] flex-1 bg-background px-2 text-sm font-medium"
                              onBlur={(e) => void saveTexto(c, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                              }}
                            />
                          )}
                        </div>
                        {audit ? (
                          <p className="min-w-0 text-[10px] leading-tight text-muted-foreground [overflow-wrap:anywhere]" title={audit.title}>
                            {audit.line}
                          </p>
                        ) : null}
                      </div>
                      {mayEditStructure && !c.completado ? (
                        <div className="flex items-center justify-end">
                          <Label className="sr-only">
                            Responsable del check
                          </Label>
                          <Select
                            value={c.responsable_id ?? NONE_RESPONSABLE}
                            onValueChange={(value) => void saveResponsable(c, value === NONE_RESPONSABLE ? null : value)}
                            disabled={structureBusy}
                          >
                            <SelectTrigger
                              className={cn(
                                'h-8 justify-center gap-1.5 bg-background px-2 [&>svg:last-child]:ml-0 [&>svg:last-child]:h-3 [&>svg:last-child]:w-3',
                                c.responsable_id ? 'w-[8.5rem] border-primary/35 text-primary' : 'w-8 px-0 text-muted-foreground'
                              )}
                              title={`Responsable: ${ownerName}`}
                            >
                              <UserRound className={cn('h-3.5 w-3.5', c.responsable_id ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
                              {c.responsable_id ? (
                                <span className="min-w-0 truncate text-[11px] font-medium">
                                  {ownerName}
                                </span>
                              ) : null}
                              <span className="sr-only">
                                <SelectValue placeholder="Sin responsable especifico" />
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE_RESPONSABLE}>Sin responsable especifico</SelectItem>
                              {users.map((user) => (
                                <SelectItem key={user.id} value={user.id}>
                                  {user.nombre}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div
                          className={cn(
                            'flex items-center justify-end gap-1 rounded-md px-2 py-1 text-[11px]',
                            c.responsable_id
                              ? 'max-w-[8.5rem] bg-primary/10 font-medium text-primary'
                              : 'w-8 bg-muted/20 text-muted-foreground'
                          )}
                          title={`Responsable: ${ownerName}`}
                        >
                          <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          {c.responsable_id ? <span className="min-w-0 truncate">{ownerName}</span> : null}
                        </div>
                      )}
                      {showStructureActions ? (
                        <div className="col-start-2 flex shrink-0 items-center justify-start gap-0 rounded-md bg-muted/20 p-0.5 sm:col-span-1 sm:col-start-auto sm:justify-end sm:bg-muted/10">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            aria-label="Subir en la lista"
                            disabled={structureBusy || index === 0}
                            onClick={() => void swapOrden(c, -1)}
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            aria-label="Bajar en la lista"
                            disabled={structureBusy || index === sorted.length - 1}
                            onClick={() => void swapOrden(c, 1)}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            aria-label="Eliminar punto pendiente"
                            disabled={structureBusy}
                            onClick={() => void removePoint(c)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-3 py-5 text-center">
                <p className="text-sm font-medium text-foreground/80">Sin puntos en el checklist</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Agrega ítems arriba cuando quieras. Si dejas la lista vacía, no hay puntos de validación que
                  bloqueen el cierre.
                </p>
              </div>
            )}
          </>
        )}
    </AccionFormSection>
  )
}
