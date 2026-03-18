/**
 * Dropdown de orígenes (distance_origins). Al elegir, el padre puede mostrar ubicación.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useOrigins } from '../hooks/useOrigins'
import type { DistanceOrigin } from '../types/distance.types'

export interface OriginSelectProps {
  value: string
  onValueChange: (value: string) => void
  onOriginChange?: (origin: DistanceOrigin | null) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  id?: string
}

export function OriginSelect({
  value,
  onValueChange,
  onOriginChange,
  disabled,
  placeholder = 'Seleccionar origen',
  className,
  id = 'distance-origin-select',
}: OriginSelectProps) {
  const { data: origins = [], isLoading } = useOrigins(true)

  const EMPTY_VALUE = '__none__'
  const controlledValue = value && value.trim() !== '' ? value : EMPTY_VALUE

  const handleChange = (selectedId: string) => {
    const next = selectedId === EMPTY_VALUE ? '' : selectedId
    onValueChange(next)
    const origin = next ? origins.find((o) => o.id === next) ?? null : null
    onOriginChange?.(origin)
  }

  return (
    <Select
      value={controlledValue}
      onValueChange={handleChange}
      disabled={disabled || isLoading}
    >
      <SelectTrigger id={id} className={className} data-testid="distance-origin-select-trigger">
        <SelectValue placeholder={isLoading ? 'Cargando…' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={EMPTY_VALUE}>
          {placeholder}
        </SelectItem>
        {origins.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.nombre}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
