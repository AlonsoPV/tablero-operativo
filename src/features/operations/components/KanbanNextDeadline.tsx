import { useEffect, useMemo, useState } from 'react'
import { AlarmClock, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AccionDiaria } from '@/types'
import { cn } from '@/lib/utils'
import { accionIdPublico } from '../utils/accionUtils'
import { CountdownTimer } from './CountdownTimer'

function getDeadlineMs(fecha: string, horaLimite: string): number | null {
  const [y, m, d] = fecha.split('-').map(Number)
  const [h, min] = (horaLimite ?? '23:59').split(':').map(Number)
  const deadline = new Date(y, m - 1, d, h, min, 0)
  return Number.isNaN(deadline.getTime()) ? null : deadline.getTime()
}

function formatDeadlineLabel(fecha: string, horaLimite: string): string {
  const [y, mo, d] = fecha.split('-').map(Number)
  const date = new Date(y, mo - 1, d)
  const day = date.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
  const hora = (horaLimite ?? '23:59').slice(0, 5)
  return `${day} · ${hora}`
}

type KanbanNextDeadlineProps = {
  accion: AccionDiaria
  responsableName?: string
  onOpenAccion?: () => void
}

export function KanbanNextDeadline({ accion, responsableName, onOpenAccion }: KanbanNextDeadlineProps) {
  const [expanded, setExpanded] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const deadlineMs = useMemo(
    () => getDeadlineMs(accion.fecha, accion.hora_limite),
    [accion.fecha, accion.hora_limite]
  )

  const msRemaining = deadlineMs != null ? deadlineMs - now : null
  const isOverdue = msRemaining != null && msRemaining <= 0
  const isUrgent = msRemaining != null && msRemaining > 0 && msRemaining < 24 * 3_600_000

  const title =
    accion.titulo_accion?.trim() ||
    accion.descripcion_accion?.trim().slice(0, 120) ||
    'Acción sin título'
  const publicId = accionIdPublico(accion.id)
  const deadlineLabel = formatDeadlineLabel(accion.fecha, accion.hora_limite)
  const statusLabel = isOverdue ? 'Vencida' : 'Próxima a vencer'

  const borderClass = isOverdue
    ? 'border-destructive/45 bg-destructive/[0.07]'
    : isUrgent
      ? 'border-amber-500/45 bg-amber-500/[0.07]'
      : 'border-primary/35 bg-primary/[0.06]'

  const accentClass = isOverdue
    ? 'text-destructive'
    : isUrgent
      ? 'text-amber-700 dark:text-amber-400'
      : 'text-primary'

  return (
    <div
      id="kanban-next-deadline"
      className={cn(
        'kanban-next-deadline w-full min-w-0 max-w-full overflow-hidden rounded-xl border',
        borderClass
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
        aria-expanded={expanded}
        aria-controls="kanban-next-deadline-details"
      >
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            isOverdue ? 'bg-destructive/15' : isUrgent ? 'bg-amber-500/15' : 'bg-primary/15',
            accentClass
          )}
          aria-hidden
        >
          {isOverdue ? <AlertCircle className="h-4 w-4" /> : <AlarmClock className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className={cn('text-[10px] font-bold uppercase tracking-wide', accentClass)}>
              {statusLabel}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">{publicId}</span>
          </div>
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <CountdownTimer
            fecha={accion.fecha}
            hora_limite={accion.hora_limite}
            estado={accion.estado}
            variant="compact"
            className={cn('text-xs font-semibold', accentClass)}
          />
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
          )}
        </div>
      </button>

      {expanded ? (
        <div
          id="kanban-next-deadline-details"
          className="space-y-2 border-t border-border/40 px-3 py-2.5"
        >
          <p className="text-sm leading-snug text-foreground">{title}</p>
          <dl className="grid gap-1 text-[11px] text-muted-foreground">
            {responsableName ? (
              <div className="flex gap-2">
                <dt className="shrink-0 font-medium">Responsable</dt>
                <dd className="min-w-0 truncate text-foreground/90">{responsableName}</dd>
              </div>
            ) : null}
            <div className="flex gap-2">
              <dt className="shrink-0 font-medium">Compromiso</dt>
              <dd>{deadlineLabel}</dd>
            </div>
          </dl>
          {onOpenAccion ? (
            <Button type="button" variant="outline" size="sm" className="h-8 w-full" onClick={onOpenAccion}>
              Abrir acción
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
