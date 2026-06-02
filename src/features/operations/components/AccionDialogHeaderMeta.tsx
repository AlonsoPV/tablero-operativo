import type { AccionDiaria } from '@/types'
import { cn } from '@/lib/utils'
import { AccionIdDisplay } from './AccionIdDisplay'
import { accionIdPublico } from '../utils/accionUtils'
import {
  accionEstadoBadgeClass,
  accionEstadoLabel,
  getAccionDisplayEstado,
} from '../utils/accionEstadoDisplay'

type AccionDialogHeaderMetaProps = {
  accion: AccionDiaria
  className?: string
}

/** ID público y estado legible para el encabezado del modal de acción. */
export function AccionDialogHeaderMeta({ accion, className }: AccionDialogHeaderMetaProps) {
  const displayEstado = getAccionDisplayEstado(accion)
  const estadoLabel = accionEstadoLabel(displayEstado)

  return (
    <div
      className={cn(
        'inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border border-border/50 bg-muted/20 px-2 py-1',
        className
      )}
      aria-label={`Acción ${accionIdPublico(accion.id)}, estado ${estadoLabel}`}
    >
      <AccionIdDisplay
        id={accion.id}
        variant="compact"
        className="truncate text-xs font-semibold tabular-nums text-foreground"
      />
      <span className="h-3 w-px shrink-0 bg-border/80" aria-hidden />
      <span
        className={cn(
          'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none',
          accionEstadoBadgeClass(displayEstado)
        )}
      >
        {estadoLabel}
      </span>
    </div>
  )
}
