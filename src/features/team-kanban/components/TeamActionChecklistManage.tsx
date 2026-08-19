import { CheckCircle2, CircleDashed, ListChecks, UserRound } from 'lucide-react'
import { AccionChecklistProgress } from '@/features/operations/components/AccionChecklistProgress'
import { AccionFormSection } from '@/features/operations/components/AccionFormSection'
import { formatDateTimeCDMX } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import type { TeamAction, TeamMember } from '../types'

type Props = {
  action: TeamAction
  currentUsuarioId: string | null
  users: TeamMember[]
  disabled?: boolean
  onToggle: (itemIndex: number, done: boolean) => void
}

export function TeamActionChecklistManage({
  action,
  currentUsuarioId,
  users,
  disabled = false,
  onToggle,
}: Props) {
  const checklist = action.checklist ?? []
  const completed = checklist.filter((item) => item.done).length
  const pending = checklist.length - completed
  const names = new Map(users.map((user) => [user.id, user.nombre]))

  return (
    <AccionFormSection
      sectionId={`team-action-checklist-${action.id}`}
      icon={ListChecks}
      eyebrow="Validacion"
      title="Puntos a validar"
      subtitle="Todos los puntos deben completarse antes de cerrar la accion."
      bodyClassName="space-y-3 pb-1 pt-0"
    >
      <AccionChecklistProgress completados={completed} total={checklist.length} />

      {pending > 0 ? (
        <p className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs leading-snug text-amber-950 dark:text-amber-100">
          Faltan <span className="font-semibold tabular-nums">{pending}</span> punto
          {pending === 1 ? '' : 's'} para poder cerrar la accion.
        </p>
      ) : checklist.length > 0 ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-950 dark:text-emerald-100">
          Checklist completo. La accion ya puede avanzar a un estado de cierre.
        </p>
      ) : null}

      {checklist.length > 0 ? (
        <ul className="space-y-1.5">
          {checklist.map((item, index) => {
            const canToggle = Boolean(
              currentUsuarioId && users.some((user) => user.id === currentUsuarioId)
            )
            const responsibleName = item.responsable_id
              ? names.get(item.responsable_id) ?? 'Usuario asignado'
              : null
            const checkedByName = item.checked_by
              ? names.get(item.checked_by) ?? 'Usuario registrado'
              : null
            const audit = item.done && item.checked_at
              ? `Validado por ${checkedByName ?? 'Usuario no registrado'} - ${formatDateTimeCDMX(item.checked_at)}`
              : null

            return (
              <li
                key={`${item.text}-${index}`}
                className={cn(
                  'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-2.5 py-2 transition-colors',
                  item.done
                    ? 'border-emerald-500/30 bg-emerald-500/[0.07]'
                    : 'border-border/60 bg-background/95'
                )}
              >
                <input
                  type="checkbox"
                  checked={Boolean(item.done)}
                  disabled={disabled || !canToggle}
                  onChange={(event) => onToggle(index, event.target.checked)}
                  className="h-4 w-4 shrink-0 rounded border-input text-primary focus:ring-2 focus:ring-ring focus:ring-offset-1"
                  aria-label={item.done ? 'Desmarcar validacion' : 'Marcar como validado'}
                />
                <div className="min-w-0 space-y-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={cn(
                        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                        item.done
                          ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                          : 'bg-muted text-foreground/65'
                      )}
                      title={item.done ? 'Validado' : 'Pendiente'}
                    >
                      {item.done ? (
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <CircleDashed className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </span>
                    <p className={cn(
                      'min-w-0 flex-1 text-sm font-medium leading-snug text-foreground [overflow-wrap:anywhere]',
                      item.done && 'line-through opacity-75'
                    )}>
                      {item.text}
                    </p>
                  </div>
                  {audit ? <p className="text-[10px] leading-tight text-muted-foreground">{audit}</p> : null}
                </div>
                <div
                  className={cn(
                    'flex max-w-[9rem] items-center gap-1 rounded-md px-2 py-1 text-[11px]',
                    responsibleName ? 'bg-primary/10 font-medium text-primary' : 'bg-muted/20 text-muted-foreground'
                  )}
                  title={responsibleName ?? 'Sin responsable especifico'}
                >
                  <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{responsibleName ?? 'Sin responsable'}</span>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-3 py-5 text-center">
          <p className="text-sm font-medium text-foreground/80">Sin puntos en el checklist</p>
          <p className="mt-1 text-xs text-muted-foreground">Esta accion puede cerrar sin validaciones adicionales.</p>
        </div>
      )}
    </AccionFormSection>
  )
}
