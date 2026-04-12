import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

export type SortKey = 'nombre' | 'compliance' | 'weight' | 'area' | 'status'
export type SortDir = 'asc' | 'desc'

export type SortButtonProps = {
  k: SortKey
  label: string
  sortKey: SortKey
  sortDir: SortDir
  onToggle: (k: SortKey) => void
}

export function KpiSortButton({ k, label, sortKey, sortDir, onToggle }: SortButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onToggle(k)}
      className="inline-flex items-center gap-1 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
    >
      {label}
      {sortKey === k ? (
        sortDir === 'asc' ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      )}
    </button>
  )
}
