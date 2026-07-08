import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { OrgChartNode } from '../types/orgChart.types'
import { initialsFromName } from '../utils/orgHierarchy'

const LEVEL_GAP = 'gap-8 lg:gap-10'
const SIBLING_GAP = 'gap-6 lg:gap-8'

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

  return (
    <div className={cn('flex items-center', LEVEL_GAP)}>
      <OrgChartNodeCard node={node} selectedId={selectedId} onSelect={onSelect} />

      {hasChildren ? (
        <div className={cn('relative flex flex-col', SIBLING_GAP)}>
          {node.children.length > 1 ? (
            <span
              className="pointer-events-none absolute left-0 top-5 bottom-5 w-px bg-border"
              aria-hidden
            />
          ) : null}

          {node.children.map((child) => (
            <div key={child.id} className="relative flex items-center pl-8">
              <span
                className="pointer-events-none absolute left-0 top-1/2 h-px w-8 -translate-y-1/2 bg-border"
                aria-hidden
              />
              <OrgChartLateralBranch node={child} selectedId={selectedId} onSelect={onSelect} />
            </div>
          ))}
        </div>
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
