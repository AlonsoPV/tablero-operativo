import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { CHALLENGE_AUDIENCE_OPTIONS } from '../constants'
import type { Area } from '@/features/catalogs/types/catalogs.types'
import type { ChallengeAudienceType } from '../types'

export function AudienceSelector({
  audienceType,
  audienceAreaId,
  audienceAreaIds,
  areas,
  onAudienceTypeChange,
  onSingleAreaChange,
  onMultipleAreasChange,
}: {
  audienceType: ChallengeAudienceType
  audienceAreaId: string | null
  audienceAreaIds: string[]
  areas: Area[]
  onAudienceTypeChange: (value: ChallengeAudienceType) => void
  onSingleAreaChange: (areaId: string | null) => void
  onMultipleAreasChange: (areaIds: string[]) => void
}) {
  const sortedAreas = [...areas].sort((a, b) => a.nombre.localeCompare(b.nombre))

  const addArea = (areaId: string) => {
    if (!areaId || audienceAreaIds.includes(areaId)) return
    onMultipleAreasChange([...audienceAreaIds, areaId])
  }

  const removeArea = (areaId: string) => {
    onMultipleAreasChange(audienceAreaIds.filter((id) => id !== areaId))
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        {CHALLENGE_AUDIENCE_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition duration-200',
              audienceType === option.value
                ? 'border-primary/35 bg-primary/[0.05] shadow-sm shadow-primary/5 ring-1 ring-primary/10'
                : 'border-border/60 bg-background hover:-translate-y-0.5 hover:border-border hover:shadow-sm'
            )}
          >
            <input
              type="radio"
              name="challenge-audience"
              value={option.value}
              checked={audienceType === option.value}
              onChange={() => onAudienceTypeChange(option.value)}
              className="mt-1"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">{option.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {audienceType === 'single_area' ? (
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Área destinataria
          </Label>
          <Select
            value={audienceAreaId ?? ''}
            onValueChange={(value) => onSingleAreaChange(value || null)}
          >
            <SelectTrigger className="h-10 rounded-lg">
              <SelectValue placeholder="Selecciona área" />
            </SelectTrigger>
            <SelectContent>
              {sortedAreas.map((area) => (
                <SelectItem key={area.id} value={area.id}>
                  {area.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {audienceType === 'multiple_areas' ? (
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Áreas destinatarias (mínimo 2)
          </Label>
          <Select onValueChange={addArea}>
            <SelectTrigger className="h-10 rounded-lg">
              <SelectValue placeholder="Agregar área" />
            </SelectTrigger>
            <SelectContent>
              {sortedAreas
                .filter((area) => !audienceAreaIds.includes(area.id))
                .map((area) => (
                  <SelectItem key={area.id} value={area.id}>
                    {area.nombre}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-2">
            {audienceAreaIds.map((areaId) => {
              const area = sortedAreas.find((item) => item.id === areaId)
              return (
                <Badge key={areaId} variant="secondary" className="gap-1 pr-1">
                  {area?.nombre ?? 'Área'}
                  <button
                    type="button"
                    className="rounded p-0.5 hover:bg-muted"
                    onClick={() => removeArea(areaId)}
                    aria-label={`Quitar ${area?.nombre ?? 'área'}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
