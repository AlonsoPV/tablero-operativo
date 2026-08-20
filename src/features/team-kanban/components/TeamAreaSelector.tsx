import type { ReactNode } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { TeamArea } from '../types'

export function TeamAreaSelector({
  areas,
  selectedId,
  onSelect,
  label = 'Equipo / area activa',
  actions,
}: {
  areas: TeamArea[]
  selectedId: string | null
  onSelect: (id: string) => void
  label?: string
  actions?: ReactNode
}) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-2xl border border-border/60 bg-muted/20 p-3 shadow-sm ring-1 ring-border/30',
        actions && 'sm:p-3.5'
      )}
    >
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <Select value={selectedId ?? ''} onValueChange={onSelect}>
            <SelectTrigger className="h-11 w-full rounded-xl border-border/70 bg-card text-left font-semibold shadow-sm lg:max-w-md">
              <SelectValue placeholder="Selecciona un equipo" />
            </SelectTrigger>
            <SelectContent>
              {areas.map((area) => (
                <SelectItem key={area.id} value={area.id}>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{area.nombre}</span>
                    <span className="text-xs text-muted-foreground">({area.open_count})</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {actions ? (
          <div className="grid w-full min-w-0 grid-cols-3 gap-2 lg:flex lg:w-auto lg:shrink-0 lg:items-center">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  )
}
