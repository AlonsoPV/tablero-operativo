import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { OrgChartNode } from '../types/orgChart.types'
import { initialsFromName } from '../utils/orgHierarchy'

const SIBLING_GAP = 'gap-6 lg:gap-8'
const CONNECTOR_TRUNK = 'w-8 lg:w-10'
const CONNECTOR_BRANCH = 'w-8 lg:w-10'
const CONNECTOR_INSET = 'pl-8 lg:pl-10'
const CONNECTOR_LINE = 'bg-muted-foreground/55 dark:bg-muted-foreground/65'
const CONNECTOR_THICKNESS = 'w-0.5'
const CONNECTOR_HEIGHT = 'h-0.5'
const CONNECTOR_GAP_HALF = 'top-3 bottom-3 lg:top-4 lg:bottom-4'

interface OrgChartNodeCardProps {
  node: OrgChartNode
  selectedId?: string | null
  onSelect?: (userId: string) => void
  compact?: boolean
}

function OrgChartNodeCard({ node, selectedId, onSelect, compact = false }: OrgChartNodeCardProps) {
  const selected = selectedId === node.id

  return (
    <button
      type="button"
      onClick={() => onSelect?.(node.id)}
      className={cn(
        'shrink-0 rounded-xl border bg-card text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        compact ? 'w-[200px] p-2.5' : 'w-[220px] p-3 sm:w-[240px]',
        selected
          ? 'border-primary/60 ring-2 ring-primary/15'
          : 'border-border/70 hover:border-primary/40 hover:shadow-md',
        !node.activo && 'opacity-75'
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            'flex shrink-0 items-center justify-center rounded-full font-semibold',
            compact ? 'h-9 w-9 text-xs' : 'h-10 w-10 text-sm',
            node.activo ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          )}
          aria-hidden
        >
          {initialsFromName(node.nombre)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">{node.nombre}</p>
          <p className="truncate text-xs text-muted-foreground">{node.rol}</p>
          <p className="truncate text-xs text-muted-foreground">{node.area ?? 'Sin área'}</p>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1">
        <Badge variant={node.activo ? 'success' : 'muted'} className="text-[10px]">
          {node.activo ? 'Activo' : 'Inactivo'}
        </Badge>
        {node.children.length > 0 ? (
          <Badge variant="secondary" className="text-[10px]">
            {node.children.length} reporte{node.children.length === 1 ? '' : 's'}
          </Badge>
        ) : null}
      </div>
    </button>
  )
}

interface OrgChartLateralBranchProps {
  node: OrgChartNode
  selectedId?: string | null
  onSelect?: (userId: string) => void
}

function OrgChartLateralBranch({ node, selectedId, onSelect }: OrgChartLateralBranchProps) {
  const hasChildren = node.children.length > 0
  const childCount = node.children.length
  const multiChildren = childCount > 1

  return (
    <div className="flex items-center">
      <OrgChartNodeCard node={node} selectedId={selectedId} onSelect={onSelect} />

      {hasChildren ? (
        <>
          <span
            className={cn(
              'pointer-events-none shrink-0 self-center',
              CONNECTOR_HEIGHT,
              CONNECTOR_TRUNK,
              CONNECTOR_LINE
            )}
            aria-hidden
          />

          <div className={cn('relative flex flex-col', SIBLING_GAP)}>
            {node.children.map((child, index) => {
              const isFirst = index === 0
              const isLast = index === childCount - 1

              return (
                <div
                  key={child.id}
                  className={cn('relative flex items-center', CONNECTOR_INSET)}
                >
                  <span
                    className={cn(
                      'pointer-events-none absolute left-0 top-1/2 -translate-y-1/2',
                      CONNECTOR_HEIGHT,
                      CONNECTOR_BRANCH,
                      CONNECTOR_LINE
                    )}
                    aria-hidden
                  />

                  {multiChildren ? (
                    <span
                      className={cn(
                        'pointer-events-none absolute left-0',
                        CONNECTOR_THICKNESS,
                        CONNECTOR_LINE,
                        isFirst && 'top-1/2 -bottom-3 lg:-bottom-4',
                        isLast && '-top-3 bottom-1/2 lg:-top-4',
                        !isFirst && !isLast && CONNECTOR_GAP_HALF
                      )}
                      aria-hidden
                    />
                  ) : null}

                  <span
                    className={cn(
                      'pointer-events-none absolute left-0 top-1/2 z-[1] h-2 w-2 -translate-x-[3px] -translate-y-1/2 rounded-full border-2 border-background',
                      CONNECTOR_LINE
                    )}
                    aria-hidden
                  />

                  <OrgChartLateralBranch node={child} selectedId={selectedId} onSelect={onSelect} />
                </div>
              )
            })}
          </div>
        </>
      ) : null}
    </div>
  )
}

interface OrgChartTreeProps {
  roots: OrgChartNode[]
  selectedId?: string | null
  onSelect?: (userId: string) => void
}

export function OrgChartTree({ roots, selectedId, onSelect }: OrgChartTreeProps) {
  if (roots.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground">
        No hay usuarios para mostrar con los filtros actuales.
      </div>
    )
  }

  return (
    <div className={cn('inline-flex min-w-min flex-col px-1 py-2 sm:px-2', SIBLING_GAP)}>
      {roots.map((root) => (
        <div key={root.id} className="flex items-start">
          <OrgChartLateralBranch node={root} selectedId={selectedId} onSelect={onSelect} />
        </div>
      ))}
    </div>
  )
}
