/**
 * Checklist local al crear acción (antes de existir accion_id).
 * No persiste hasta que el padre llama insertMany tras crear la acción.
 */

import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AccionFormSection } from './AccionFormSection'
import { ListChecks, Plus, Trash2, ChevronUp, ChevronDown, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ACCION_CHECKLIST_CREATE_INFO_HINT,
  ACCION_CHECKLIST_MAX_LEN,
  ACCION_CHECKLIST_MIN_LEN,
  ACCION_CHECKLIST_SECTION_EYEBROW,
  ACCION_CHECKLIST_SECTION_TITLE,
} from './accionChecklistSection'

const MIN_LEN = ACCION_CHECKLIST_MIN_LEN
const MAX_LEN = ACCION_CHECKLIST_MAX_LEN

export type LocalCheckpointDraft = {
  key: string
  texto: string
  obligatorio: boolean
  responsable_id?: string | null
}

export interface AccionChecklistEditorProps {
  items: LocalCheckpointDraft[]
  onChange: (items: LocalCheckpointDraft[]) => void
  disabled?: boolean
  users?: { id: string; nombre: string; rol?: string | null; area?: string | null }[]
}

function newKey() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`
}

const NONE_RESPONSABLE = '__none__'

function responsableLabel(
  userId: string | null | undefined,
  users: { id: string; nombre: string }[]
) {
  if (!userId) return 'Sin responsable especifico'
  return users.find((user) => user.id === userId)?.nombre ?? 'Usuario asignado'
}

export function AccionChecklistEditor({ items, onChange, disabled, users = [] }: AccionChecklistEditorProps) {
  const [draft, setDraft] = useState('')
  const [draftResponsableId, setDraftResponsableId] = useState<string | null>(null)

  const addItem = useCallback(() => {
    const t = draft.trim()
    if (t.length < MIN_LEN) return
    if (t.length > MAX_LEN) return
    const lower = t.toLowerCase()
    if (items.some((i) => i.texto.trim().toLowerCase() === lower)) {
      return
    }
    onChange([...items, { key: newKey(), texto: t, obligatorio: true, responsable_id: draftResponsableId }])
    setDraft('')
    setDraftResponsableId(null)
  }, [draft, draftResponsableId, items, onChange])

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[index], next[j]] = [next[j], next[index]]
    onChange(next)
  }

  const draftTrim = draft.trim()
  const draftTooShort = draftTrim.length > 0 && draftTrim.length < MIN_LEN
  const canAdd = !disabled && draftTrim.length >= MIN_LEN

  return (
    <AccionFormSection
      sectionId="accion-checklist-draft"
      icon={ListChecks}
      eyebrow={ACCION_CHECKLIST_SECTION_EYEBROW}
      title={ACCION_CHECKLIST_SECTION_TITLE}
      infoHint={ACCION_CHECKLIST_CREATE_INFO_HINT}
      bodyClassName="space-y-2 pb-1 pt-0 sm:space-y-3"
    >
      <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 p-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="checkpoint-draft" className="text-xs font-semibold text-foreground/80">
              Indicacion
            </Label>
            <Input
              id="checkpoint-draft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Describe que debe validarse"
              maxLength={MAX_LEN}
              disabled={disabled}
              className="h-10 min-w-0 bg-background text-sm"
              aria-invalid={draftTooShort}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addItem()
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
            <Label htmlFor="checkpoint-draft-responsable" className="sr-only">
              Responsable del check
            </Label>
            <Select
              value={draftResponsableId ?? NONE_RESPONSABLE}
              onValueChange={(value) => setDraftResponsableId(value === NONE_RESPONSABLE ? null : value)}
              disabled={disabled}
            >
              <SelectTrigger
                id="checkpoint-draft-responsable"
                className="h-10 w-10 justify-center bg-background px-0 [&>svg:last-child]:ml-0 [&>svg:last-child]:h-3.5 [&>svg:last-child]:w-3.5"
                title={`Responsable: ${responsableLabel(draftResponsableId, users)}`}
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
            onClick={addItem}
            disabled={!canAdd}
            aria-label="Agregar punto al checklist"
            title="Agregar punto"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      {items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map((item, index) => {
            const t = item.texto.trim()
            const rowInvalid = t.length > 0 && t.length < MIN_LEN
            return (
              <li
                key={item.key}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border/60 bg-background/95 px-2.5 py-2 transition-colors hover:border-border sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0 space-y-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="inline-flex shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-foreground/65">
                      Check
                    </span>
                    <Input
                      value={item.texto}
                      onChange={(e) => {
                        const v = e.target.value.slice(0, MAX_LEN)
                        const next = items.map((it) => (it.key === item.key ? { ...it, texto: v } : it))
                        onChange(next)
                      }}
                      disabled={disabled}
                      className={cn('h-8 min-w-[160px] flex-1 bg-background px-2 text-sm font-medium', rowInvalid && 'border-destructive/60')}
                      aria-invalid={rowInvalid}
                      placeholder="Texto del punto a validar"
                    />
                  </div>
                  {rowInvalid ? (
                    <p className="text-[10px] text-destructive">Mínimo {MIN_LEN} caracteres o elimina la fila.</p>
                  ) : null}
                </div>
                <div className="flex items-center justify-end">
                  <Label className="sr-only">
                    Responsable del check
                  </Label>
                  <Select
                    value={item.responsable_id ?? NONE_RESPONSABLE}
                    onValueChange={(value) => {
                      const nextResponsableId = value === NONE_RESPONSABLE ? null : value
                      onChange(items.map((it) => (it.key === item.key ? { ...it, responsable_id: nextResponsableId } : it)))
                    }}
                    disabled={disabled}
                  >
                    <SelectTrigger
                      className={cn(
                        'h-8 justify-center gap-1.5 bg-background px-2 [&>svg:last-child]:ml-0 [&>svg:last-child]:h-3 [&>svg:last-child]:w-3',
                        item.responsable_id ? 'w-[8.5rem] border-primary/35 text-primary' : 'w-8 px-0 text-muted-foreground'
                      )}
                      title={`Responsable: ${responsableLabel(item.responsable_id, users)}`}
                    >
                      <UserRound className={cn('h-3.5 w-3.5', item.responsable_id ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
                      {item.responsable_id ? (
                        <span className="min-w-0 truncate text-[11px] font-medium">
                          {responsableLabel(item.responsable_id, users)}
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
                <div className="col-start-2 flex shrink-0 items-center justify-end gap-0 rounded-md bg-muted/20 p-0.5 sm:col-span-1 sm:col-start-auto sm:justify-start sm:bg-transparent sm:p-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    aria-label="Subir"
                    disabled={disabled || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    aria-label="Bajar"
                    disabled={disabled || index === items.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Eliminar punto"
                    disabled={disabled}
                    onClick={() => onChange(items.filter((it) => it.key !== item.key))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-3 py-3 text-center sm:py-4">
          <p className={cn('text-xs leading-relaxed text-muted-foreground', disabled && 'opacity-50')}>
            Aún no agregaste puntos. La acción podrá cerrarse sin checklist si el resto de reglas lo permiten.
          </p>
        </div>
      )}
    </AccionFormSection>
  )
}
