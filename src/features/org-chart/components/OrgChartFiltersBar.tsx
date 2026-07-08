import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { OrgChartFilters, OrgChartUser } from '../types/orgChart.types'

const ALL_VALUE = '__all__'

interface OrgChartFiltersBarProps {
  filters: OrgChartFilters
  users: OrgChartUser[]
  areas: string[]
  roles: string[]
  onChange: (next: OrgChartFilters) => void
}

export function OrgChartFiltersBar({
  filters,
  users,
  areas,
  roles,
  onChange,
}: OrgChartFiltersBarProps) {
  return (
    <div className="grid gap-3 rounded-xl border border-border/70 bg-card p-4 md:grid-cols-2 xl:grid-cols-5">
      <div className="space-y-1.5 xl:col-span-2">
        <Label htmlFor="org-chart-search">Buscar</Label>
        <Input
          id="org-chart-search"
          value={filters.search ?? ''}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
          placeholder="Nombre, rol o área"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="org-chart-area">Área</Label>
        <Select
          value={filters.area ?? ALL_VALUE}
          onValueChange={(value) =>
            onChange({ ...filters, area: value === ALL_VALUE ? null : value })
          }
        >
          <SelectTrigger id="org-chart-area">
            <SelectValue placeholder="Todas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todas las áreas</SelectItem>
            {areas.map((area) => (
              <SelectItem key={area} value={area}>
                {area}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="org-chart-rol">Rol</Label>
        <Select
          value={filters.rol ?? ALL_VALUE}
          onValueChange={(value) =>
            onChange({ ...filters, rol: value === ALL_VALUE ? null : value })
          }
        >
          <SelectTrigger id="org-chart-rol">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todos los roles</SelectItem>
            {roles.map((rol) => (
              <SelectItem key={rol} value={rol}>
                {rol}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="org-chart-user">Usuario</Label>
        <Select
          value={filters.userId ?? ALL_VALUE}
          onValueChange={(value) =>
            onChange({ ...filters, userId: value === ALL_VALUE ? null : value })
          }
        >
          <SelectTrigger id="org-chart-user">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todos los usuarios</SelectItem>
            {users.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <label className="flex items-center gap-2 self-end rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input"
          checked={filters.soloActivos !== false}
          onChange={(event) => onChange({ ...filters, soloActivos: event.target.checked })}
        />
        Solo activos
      </label>
    </div>
  )
}
