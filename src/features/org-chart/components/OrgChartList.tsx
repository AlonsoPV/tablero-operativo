import { useState, type MouseEvent, type ReactNode } from 'react'
import { ChevronDown, Network, UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { OrgChartListRow } from '../utils/orgHierarchy'
import { initialsFromName } from '../utils/orgHierarchy'

interface OrgChartListProps {
  rows: OrgChartListRow[]
  selectedId?: string | null
  onSelect?: (userId: string) => void
}

function CollapsedRelation({
  icon: Icon,
  label,
  summary,
  emptyLabel,
  children,
  defaultOpen = false,
}: {
  icon: typeof UserRound
  label: string
  summary: string | null
  emptyLabel: string
  children?: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const hasContent = Boolean(summary)

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border transition-colors',
        open ? 'border-border/70 bg-muted/20' : 'border-border/50 bg-background/80'
      )}
    >
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors',
          hasContent ? 'hover:bg-muted/40' : 'cursor-default opacity-80'
        )}
        aria-expanded={open}
        disabled={!hasContent}
        onClick={(event: MouseEvent<HTMLButtonElement>) => {
          event.stopPropagation()
          if (!hasContent) return
          setOpen((current) => !current)
        }}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="shrink-0 font-medium text-muted-foreground">{label}</span>
        <span className="min-w-0 flex-1 truncate text-foreground">
          {summary ?? emptyLabel}
        </span>
        {hasContent ? (
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180'
            )}
            aria-hidden
          />
        ) : null}
      </button>
      {open && hasContent ? (
        <div
          className="border-t border-border/50 px-2.5 py-2 text-xs text-muted-foreground"
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}

export function OrgChartList({ rows, selectedId, onSelect }: OrgChartListProps) {
  if (rows.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 px-4 py-10 text-center">
        <p className="text-sm font-medium text-foreground">No hay personas para mostrar</p>
        <p className="text-xs text-muted-foreground">Ajusta los filtros para ver resultados.</p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-border/50">
      {rows.map((row) => {
        const selected = selectedId === row.id
        const reportsSummary =
          row.reportsCount === 0
            ? null
            : row.reportsCount === 1
              ? row.reportNombres[0] ?? '1 persona'
              : `${row.reportsCount} personas`

        return (
          <li key={row.id}>
            <div
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              className={cn(
                'cursor-pointer px-3 py-3 transition-colors outline-none focus-visible:bg-muted/30 sm:px-4',
                selected ? 'bg-primary/5' : 'hover:bg-muted/20',
                !row.activo && 'opacity-80'
              )}
              style={{ paddingLeft: `calc(0.75rem + ${Math.min(row.depth, 6) * 0.85}rem)` }}
              onClick={() => onSelect?.(row.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect?.(row.id)
                }
              }}
            >
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={cn(
                      'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      row.activo
                        ? 'bg-primary/10 text-primary ring-1 ring-primary/15'
                        : 'bg-muted text-muted-foreground'
                    )}
                    aria-hidden
                  >
                    {initialsFromName(row.nombre)}
                  </span>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-foreground">{row.nombre}</p>
                      <Badge variant={row.activo ? 'success' : 'muted'} className="text-[10px]">
                        {row.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.rol}
                      <span className="text-border"> · </span>
                      {row.area ?? 'Sin área'}
                      <span className="text-border"> · </span>
                      {row.depth === 0 ? 'Raíz' : `Nivel ${row.depth + 1}`}
                    </p>
                  </div>
                </div>

                <div className="grid w-full gap-1.5 sm:w-[min(100%,18rem)] sm:shrink-0">
                  <CollapsedRelation
                    icon={UserRound}
                    label="Reporta a"
                    summary={row.managerNombre}
                    emptyLabel="Sin jefe"
                  >
                    <p className="font-medium text-foreground">{row.managerNombre}</p>
                    <p className="mt-0.5">Responsable superior directo</p>
                  </CollapsedRelation>

                  <CollapsedRelation
                    icon={Network}
                    label="Supervisa a"
                    summary={reportsSummary}
                    emptyLabel="Sin reportes"
                  >
                    <ul className="space-y-1">
                      {row.reportNombres.map((nombre) => (
                        <li key={nombre} className="font-medium text-foreground">
                          {nombre}
                        </li>
                      ))}
                    </ul>
                  </CollapsedRelation>
                </div>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
