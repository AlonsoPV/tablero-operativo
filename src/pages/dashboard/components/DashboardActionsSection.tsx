import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, ChevronDown, ChevronUp, Rows3 } from 'lucide-react'
import { AccionesControlTable } from '@/features/operations'
import type { AccionDiaria } from '@/types'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const ACCIONES_VISTA_INICIAL = 10

export interface DashboardActionsSectionProps {
  acciones: AccionDiaria[]
  isLoading?: boolean
  commentCounts?: Record<string, number>
  responsableNames?: Record<string, string>
  checklistProgressByAccionId?: Record<string, { total: number; completed: number }>
  onSelectAccion?: (accion: AccionDiaria) => void
  onNewAction?: () => void
  fechaResumen: string
  title?: string
  eyebrow?: string
  subtitle?: string
  onClearDrillDown?: () => void
}

export function DashboardActionsSection({
  acciones,
  isLoading,
  commentCounts = {},
  responsableNames = {},
  checklistProgressByAccionId = {},
  onSelectAccion,
  onNewAction,
  fechaResumen,
  title = 'Acciones del dia',
  eyebrow = 'Operacion',
  subtitle: subtitleOverride,
  onClearDrillDown,
}: DashboardActionsSectionProps) {
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    setShowAll(false)
  }, [fechaResumen, title])

  const total = acciones.length
  const hasMore = total > ACCIONES_VISTA_INICIAL
  const hiddenCount = total - ACCIONES_VISTA_INICIAL

  const accionesVisibles = useMemo(() => {
    if (showAll || !hasMore) return acciones
    return acciones.slice(0, ACCIONES_VISTA_INICIAL)
  }, [acciones, showAll, hasMore])

  const subtitle = subtitleOverride ?? `${total} accion${total !== 1 ? 'es' : ''} · ${fechaResumen}`
  const isDrillDown = Boolean(onClearDrillDown)

  return (
    <div id="dashboard-actions-section" className="dashboard-actions-section">
      <SectionCard
        className={cn(
          'overflow-hidden',
          isDrillDown && 'flex min-h-[calc(100dvh-3rem)] flex-col'
        )}
      >
        <SectionCardHeader
          className="px-3 py-3 sm:px-4 sm:py-4 md:px-6"
          icon={ClipboardList}
          eyebrow={eyebrow}
          title={title}
          subtitle={subtitle}
          action={
            <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
              {onClearDrillDown ? (
                <Button type="button" variant="outline" size="sm" className="h-8" onClick={onClearDrillDown}>
                  Ver filtro normal
                </Button>
              ) : null}
              {hasMore ? (
                <Badge
                  variant="secondary"
                  className={cn(
                    'justify-center font-medium tabular-nums',
                    showAll
                      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100'
                      : 'border-primary/20 bg-primary/10 text-primary'
                  )}
                >
                  {showAll ? (
                    <>Lista completa · {total}</>
                  ) : (
                    <>
                      Resumen · {ACCIONES_VISTA_INICIAL}/{total}
                    </>
                  )}
                </Badge>
              ) : null}
            </div>
          }
        />
        <SectionCardBody className={cn('p-0', isDrillDown && 'flex min-h-0 flex-1 flex-col')}>
          <div
            className={cn(
              'relative',
              isDrillDown &&
                'flex min-h-0 flex-1 flex-col [&_.acciones-control-table-mobile]:h-full [&_.acciones-control-table]:h-full'
            )}
          >
            <AccionesControlTable
              acciones={accionesVisibles}
              isLoading={isLoading}
              commentCounts={commentCounts}
              onSelectAccion={onSelectAccion}
              responsableNames={responsableNames}
              checklistProgressByAccionId={checklistProgressByAccionId}
              indicadoresMode="checklist"
              emptyMessage="No hay acciones para este criterio."
              emptyActionLabel="Crear accion"
              onEmptyAction={onNewAction}
            />
            {hasMore && !showAll && !isLoading ? (
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-24 bg-gradient-to-t from-card from-30% via-card/70 to-transparent md:block"
                aria-hidden
              />
            ) : null}
          </div>

          {hasMore && !isLoading ? (
            <div className="border-t border-border/50 bg-muted/25 px-3 py-3 sm:px-4 sm:py-3.5 md:px-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <p className="text-center text-xs text-muted-foreground sm:text-left sm:text-sm">
                  {showAll ? (
                    <span>
                      Viendo las <span className="font-semibold text-foreground">{total}</span> acciones del filtro.
                    </span>
                  ) : (
                    <span>
                      <span className="font-semibold text-foreground">{hiddenCount}</span> mas en la lista.
                    </span>
                  )}
                </p>
                <Button
                  type="button"
                  variant={showAll ? 'outline' : 'default'}
                  size="sm"
                  className={cn(
                    'h-10 w-full shrink-0 gap-2 sm:w-auto sm:self-center',
                    !showAll && 'shadow-md shadow-primary/15'
                  )}
                  aria-expanded={showAll}
                  onClick={() => setShowAll((v) => !v)}
                >
                  {showAll ? (
                    <>
                      <Rows3 className="h-4 w-4 opacity-90" aria-hidden />
                      Vista resumida ({ACCIONES_VISTA_INICIAL})
                      <ChevronUp className="h-4 w-4 opacity-80" aria-hidden />
                    </>
                  ) : (
                    <>
                      Mostrar todas
                      <span className="rounded-md bg-primary-foreground/15 px-1.5 py-0.5 text-xs font-bold tabular-nums">
                        +{hiddenCount}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-80" aria-hidden />
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : null}
        </SectionCardBody>
      </SectionCard>
    </div>
  )
}
