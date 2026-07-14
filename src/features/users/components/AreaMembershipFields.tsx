import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

const NONE_AREA = '__none__'

export type AreaOption = {
  id: string
  nombre: string
  label?: string
}

type AreaMembershipFieldsProps = {
  areas: AreaOption[]
  primaryAreaNombre: string | null
  additionalAreaIds: string[]
  onPrimaryChange: (nombre: string | null) => void
  onAdditionalChange: (ids: string[]) => void
  loading?: boolean
  idPrefix?: string
}

export function AreaMembershipFields({
  areas,
  primaryAreaNombre,
  additionalAreaIds,
  onPrimaryChange,
  onAdditionalChange,
  loading = false,
  idPrefix = 'area',
}: AreaMembershipFieldsProps) {
  const primaryId = areas.find((a) => a.nombre === primaryAreaNombre)?.id ?? null
  const additionalOptions = areas.filter((a) => a.id !== primaryId)

  const toggleAdditional = (areaId: string) => {
    if (additionalAreaIds.includes(areaId)) {
      onAdditionalChange(additionalAreaIds.filter((id) => id !== areaId))
    } else {
      onAdditionalChange([...additionalAreaIds, areaId])
    }
  }

  return (
    <div id={`${idPrefix}-membership`} data-name={`${idPrefix}-membership`} className="space-y-4">
      <div id={`${idPrefix}-primary-field`} data-name={`${idPrefix}-primary-field`} className="space-y-2">
        <Label htmlFor={`${idPrefix}-primary`} id={`${idPrefix}-primary-label`} data-name={`${idPrefix}-primary-label`}>
          Área principal
        </Label>
        <Select
          value={primaryAreaNombre ?? NONE_AREA}
          onValueChange={(value) => {
            const next = value === NONE_AREA ? null : value
            onPrimaryChange(next)
            const nextPrimaryId = areas.find((a) => a.nombre === next)?.id
            if (nextPrimaryId) {
              onAdditionalChange(additionalAreaIds.filter((id) => id !== nextPrimaryId))
            }
          }}
          disabled={loading}
        >
          <SelectTrigger id={`${idPrefix}-primary`} name={`${idPrefix}-primary`}>
            <SelectValue placeholder={loading ? 'Cargando áreas...' : 'Área principal'} />
          </SelectTrigger>
          <SelectContent id={`${idPrefix}-primary-options`} data-name={`${idPrefix}-primary-options`}>
            <SelectItem value={NONE_AREA}>Sin área</SelectItem>
            {areas.map((area) => (
              <SelectItem key={area.id} value={area.nombre} id={`${idPrefix}-primary-option-${area.id}`}>
                {area.label ?? area.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p id={`${idPrefix}-primary-help`} data-name={`${idPrefix}-primary-help`} className="text-xs text-muted-foreground">
          Se usa en filtros, organigrama y reportes como área principal.
        </p>
      </div>

      <div id={`${idPrefix}-additional-field`} data-name={`${idPrefix}-additional-field`} className="space-y-2">
        <Label id={`${idPrefix}-additional-label`} data-name={`${idPrefix}-additional-label`}>
          Otras áreas
        </Label>
        {additionalOptions.length === 0 ? (
          <p id={`${idPrefix}-additional-empty`} data-name={`${idPrefix}-additional-empty`} className="text-sm text-muted-foreground">
            {loading ? 'Cargando…' : 'No hay más áreas en el catálogo.'}
          </p>
        ) : (
          <ul
            id={`${idPrefix}-additional-list`}
            data-name={`${idPrefix}-additional-list`}
            className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-border/60 p-2"
          >
            {additionalOptions.map((area) => {
              const checked = additionalAreaIds.includes(area.id)
              const fieldId = `${idPrefix}-additional-${area.id}`
              return (
                <li key={area.id} id={`${fieldId}-item`} data-name={`${fieldId}-item`}>
                  <label
                    htmlFor={fieldId}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40',
                      checked && 'bg-muted/30'
                    )}
                  >
                    <input
                      id={fieldId}
                      name={`${idPrefix}-additional[]`}
                      type="checkbox"
                      value={area.id}
                      className="h-4 w-4 rounded border-input"
                      checked={checked}
                      onChange={() => toggleAdditional(area.id)}
                    />
                    <span>{area.label ?? area.nombre}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
        <p id={`${idPrefix}-additional-help`} data-name={`${idPrefix}-additional-help`} className="text-xs text-muted-foreground">
          Puedes pertenecer a varias áreas además de la principal.
        </p>
      </div>
    </div>
  )
}

export function resolveAreaIdsForSave(
  areas: AreaOption[],
  primaryAreaNombre: string | null,
  additionalAreaIds: string[]
): { primaryAreaId: string | null; areaIds: string[] } {
  const primaryAreaId = areas.find((a) => a.nombre === primaryAreaNombre)?.id ?? null
  const areaIds = Array.from(
    new Set([
      ...additionalAreaIds,
      ...(primaryAreaId ? [primaryAreaId] : []),
    ])
  )
  return { primaryAreaId, areaIds }
}
