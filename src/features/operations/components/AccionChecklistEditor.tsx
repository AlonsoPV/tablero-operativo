/**
 * Checklist local al crear acción (antes de existir accion_id).
 * No persiste hasta que el padre llama insertMany tras crear la acción.
 */

import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AccionFormSection } from './AccionFormSection'
import { ListChecks, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
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
}

export interface AccionChecklistEditorProps {
  items: LocalCheckpointDraft[]
  onChange: (items: LocalCheckpointDraft[]) => void
  disabled?: boolean
}

function newKey() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`
}

export function AccionChecklistEditor({ items, onChange, disabled }: AccionChecklistEditorProps) {
  const [draft, setDraft] = useState('')

  const addItem = useCallback(() => {
    const t = draft.trim()
    if (t.length < MIN_LEN) return
    if (t.length > MAX_LEN) return
    const lower = t.toLowerCase()
    if (items.some((i) => i.texto.trim().toLowerCase() === lower)) {
      return
    }
    onChange([...items, { key: newKey(), texto: t, obligatorio: true }])
    setDraft('')
  }, [draft, items, onChange])

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
      <div className="rounded-lg border border-dashed border-border/70 bg-background/50 p-2.5 sm:p-3">
        <div className="space-y-1.5">
          <Label htmlFor="checkpoint-draft" className="text-xs font-medium text-foreground/80">
            Nuevo punto
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="checkpoint-draft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ej: Evidencia revisada por responsable…"
              maxLength={MAX_LEN}
              disabled={disabled}
              className="h-9 min-w-0 flex-1 text-sm"
              aria-invalid={draftTooShort}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addItem()
                }
              }}
            />
            <Button
              type="button"
              size="icon"
              variant={canAdd ? 'default' : 'outline'}
              className="h-9 w-9 shrink-0"
              onClick={addItem}
              disabled={!canAdd}
              aria-label="Agregar punto al checklist"
              title="Agregar punto"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </Button>
          </div>
          <p className={cn('text-[11px] leading-snug', draftTooShort ? 'text-destructive' : 'text-muted-foreground')}>
            {draftTooShort
              ? `Escribe al menos ${MIN_LEN} caracteres o borra el texto.`
              : `Mín. ${MIN_LEN} caracteres · ${draftTrim.length}/${MAX_LEN}`}
          </p>
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
                className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-1 rounded-md border border-border/55 bg-background/90 p-2 sm:flex sm:gap-2.5 sm:p-2.5"
              >
                <span className="mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold tabular-nums text-muted-foreground sm:mt-2">
                  {index + 1}
                </span>
                <div className="min-w-0 space-y-1 sm:flex-1">
                  <Input
                    value={item.texto}
                    onChange={(e) => {
                      const v = e.target.value.slice(0, MAX_LEN)
                      const next = items.map((it) => (it.key === item.key ? { ...it, texto: v } : it))
                      onChange(next)
                    }}
                    disabled={disabled}
                    className={cn('h-8 min-w-0 px-2 text-sm font-medium', rowInvalid && 'border-destructive/60')}
                    aria-invalid={rowInvalid}
                    placeholder="Texto del punto a validar"
                  />
                  {rowInvalid ? (
                    <p className="text-[10px] text-destructive">Mínimo {MIN_LEN} caracteres o elimina la fila.</p>
                  ) : null}
                </div>
                <div className="col-span-2 flex shrink-0 items-center justify-end gap-0 sm:col-span-1 sm:justify-start">
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
