/**
 * Dropdown de destinos (distance_destinations). Al elegir, el padre puede mostrar ubicación.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDestinations } from '../hooks/useDestinations'
import type { DistanceDestination } from '../types/distance.types'

export interface DestinationSelectProps {
  value: string
  onValueChange: (value: string) => void
  onDestinationChange?: (destination: DistanceDestination | null) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  id?: string
}

export function DestinationSelect({
  value,
  onValueChange,
  onDestinationChange,
  disabled,
  placeholder = 'Seleccionar destino',
  className,
  id = 'distance-destination-select',
}: DestinationSelectProps) {
  const { data: destinations = [], isLoading } = useDestinations(true)

  const EMPTY_VALUE = '__none__'
  const controlledValue = value && value.trim() !== '' ? value : EMPTY_VALUE

  const handleChange = (selectedId: string) => {
    const next = selectedId === EMPTY_VALUE ? '' : selectedId
    onValueChange(next)
    const destination = next ? destinations.find((d) => d.id === next) ?? null : null
    onDestinationChange?.(destination)
  }

  return (
    <Select
      value={controlledValue}
      onValueChange={handleChange}
      disabled={disabled || isLoading}
    >
      <SelectTrigger id={id} className={className} data-testid="distance-destination-select-trigger">
        <SelectValue placeholder={isLoading ? 'Cargando…' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={EMPTY_VALUE}>
          {placeholder}
        </SelectItem>
        {destinations.map((d) => (
          <SelectItem key={d.id} value={d.id}>
            {d.nombre}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
