import { EsOkrToggle } from '@/features/okrs/OkrTag'
import { AccionAsignadorNote } from './AccionAsignadorNote'

/** Asignador y tag OKR en una sola fila del formulario. */
export function AccionFormMetaRow({
  assignerName,
  showAssigner,
  showOkr,
  okrChecked,
  onOkrChange,
  okrDisabled,
}: {
  assignerName?: string | null
  showAssigner?: boolean
  showOkr?: boolean
  okrChecked?: boolean
  onOkrChange?: (next: boolean) => void
  okrDisabled?: boolean
}) {
  const hasAssigner = Boolean(showAssigner && assignerName?.trim())
  const hasOkr = Boolean(showOkr && onOkrChange)
  if (!hasAssigner && !hasOkr) return null

  const assigner = hasAssigner ? (
    <AccionAsignadorNote
      nombre={assignerName}
      compact={hasOkr}
      className={
        hasOkr
          ? 'min-w-0 flex-1 rounded-none border-0 bg-transparent'
          : undefined
      }
    />
  ) : null

  const okr = hasOkr ? (
    <EsOkrToggle
      checked={Boolean(okrChecked)}
      onChange={onOkrChange!}
      disabled={okrDisabled}
      compact={hasAssigner}
      className={
        hasAssigner
          ? 'rounded-none border-y-0 border-r-0 border-l border-border/70'
          : undefined
      }
    />
  ) : null

  if (assigner && okr) {
    return (
      <div className="flex h-10 w-full overflow-hidden rounded-lg border border-border/70 bg-muted/20">
        {assigner}
        {okr}
      </div>
    )
  }

  return assigner ?? okr
}
