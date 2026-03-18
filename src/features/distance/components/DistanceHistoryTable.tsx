/**
 * Tabla de historial de consultas de distancia (orden descendente por fecha).
 */

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { DistanceQueryRow } from '../types/distance.types'

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return '—'
  if (seconds < 60) return `${seconds} s`
  const min = Math.round(seconds / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

export interface DistanceHistoryTableProps {
  rows: DistanceQueryRow[]
  isLoading?: boolean
}

export function DistanceHistoryTable({ rows, isLoading }: DistanceHistoryTableProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/50 bg-card p-6 text-center text-sm text-muted-foreground">
        Cargando historial…
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 bg-card p-8 text-center text-sm text-muted-foreground">
        No hay consultas guardadas. Calcula una distancia para ver el historial aquí.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Origen (nombre)</TableHead>
            <TableHead>Origen (ubicación)</TableHead>
            <TableHead>Destino (nombre)</TableHead>
            <TableHead>Destino (ubicación)</TableHead>
            <TableHead className="text-right tabular-nums">Distancia (km)</TableHead>
            <TableHead>Duración</TableHead>
            <TableHead>Fecha</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.origen_nombre}</TableCell>
              <TableCell className="max-w-[200px] truncate text-muted-foreground" title={row.origen_ubicacion}>
                {row.origen_ubicacion}
              </TableCell>
              <TableCell className="font-medium">{row.destino_nombre}</TableCell>
              <TableCell className="max-w-[200px] truncate text-muted-foreground" title={row.destino_ubicacion}>
                {row.destino_ubicacion}
              </TableCell>
              <TableCell className="text-right tabular-nums">{Number(row.distancia_km).toFixed(2)}</TableCell>
              <TableCell className="text-muted-foreground whitespace-nowrap">{formatDuration(row.duracion_segundos)}</TableCell>
              <TableCell className="text-muted-foreground whitespace-nowrap">{formatDate(row.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
