/**
 * Tabla de control de acciones del día (spec §4.2 AccionesControlTable).
 * Lista filtrable con estado, responsable, hora límite, prioridad.
 */

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AccionDiaria } from '@/types'
import { cn } from '@/lib/utils'
import { isEnRetraso } from '../utils/accionUtils'
import { AlertCircle, AlertTriangle, Clock, FileCheck, ClipboardList, Plus, MessageSquare } from 'lucide-react'

const ESTADO_LABELS: Record<string, string> = {
  Pendiente: 'Pendiente',
  Hoy: 'Hoy',
  En_Ejecucion: 'En ejecución',
  Bloqueado: 'Bloqueado',
  Retraso: 'Retraso',
  Hecho: 'Hecho',
  Verificado: 'Verificado',
}

const PRIORIDAD_LABELS: Record<string, string> = {
  P1_Critica: 'Crítica',
  P2_Media: 'Media',
  P3_Baja: 'Baja',
}

export interface AccionesControlTableProps {
  acciones: AccionDiaria[]
  isLoading?: boolean
  /** Conteo de comentarios por accion_id (opcional) */
  commentCounts?: Record<string, number>
  /** Si se proporciona, al hacer clic en una fila se llama con la acción (para abrir detalle) */
  onSelectAccion?: (accion: AccionDiaria) => void
  /** Nombres de responsables por id (opcional; si no hay, se muestra el uuid o "—") */
  responsableNames?: Record<string, string>
  /** Mensaje del empty state (opcional) */
  emptyMessage?: string
  /** Etiqueta del botón CTA en empty state (opcional) */
  emptyActionLabel?: string
  /** Callback al pulsar CTA del empty state (opcional) */
  onEmptyAction?: () => void
}

export function AccionesControlTable({
  acciones,
  isLoading,
  commentCounts = {},
  onSelectAccion,
  responsableNames = {},
  emptyMessage = 'No hay acciones para mostrar. Ajusta los filtros o crea una nueva.',
  emptyActionLabel,
  onEmptyAction,
}: AccionesControlTableProps) {
  if (isLoading) {
    return (
      <div className="min-h-[240px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descripción</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead>Hora límite</TableHead>
              <TableHead>Prioridad</TableHead>
              <TableHead className="w-[100px]">Indicadores</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3, 4, 5].map((i) => (
              <TableRow key={i}>
                <TableCell><div className="h-4 w-48 animate-pulse rounded bg-muted" /></TableCell>
                <TableCell><div className="h-5 w-20 animate-pulse rounded bg-muted" /></TableCell>
                <TableCell><div className="h-4 w-24 animate-pulse rounded bg-muted" /></TableCell>
                <TableCell><div className="h-4 w-12 animate-pulse rounded bg-muted" /></TableCell>
                <TableCell><div className="h-4 w-14 animate-pulse rounded bg-muted" /></TableCell>
                <TableCell><div className="h-4 w-8 animate-pulse rounded bg-muted" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  if (!acciones.length) {
    return (
      <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 px-4 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/80">
          <ClipboardList className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">
          {emptyMessage}
        </p>
        <p className="text-xs text-muted-foreground max-w-sm">
          Crea una nueva acción o ajusta los filtros para ver resultados.
        </p>
        {emptyActionLabel && onEmptyAction && (
          <Button size="sm" onClick={onEmptyAction} className="mt-1">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {emptyActionLabel}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Descripción</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Responsable</TableHead>
            <TableHead>Hora límite</TableHead>
            <TableHead>Prioridad</TableHead>
            <TableHead className="w-[100px]">Indicadores</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {acciones.map((accion) => (
            <TableRow
              key={accion.id}
              className={cn(
                onSelectAccion && 'cursor-pointer transition-colors hover:bg-muted/50'
              )}
              onClick={() => onSelectAccion?.(accion)}
            >
              <TableCell className="max-w-[280px]">
                <p className="truncate font-medium" title={accion.descripcion_accion}>
                  {accion.descripcion_accion}
                </p>
                {accion.evidencia_esperada && (
                  <p className="truncate text-xs text-muted-foreground" title={accion.evidencia_esperada}>
                    {accion.evidencia_esperada}
                  </p>
                )}
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    isEnRetraso(accion)
                      ? 'destructive'
                      : accion.estado === 'Bloqueado'
                        ? 'destructive'
                        : accion.estado === 'Hecho' || accion.estado === 'Verificado'
                          ? 'default'
                          : 'secondary'
                  }
                >
                  {ESTADO_LABELS[isEnRetraso(accion) ? 'Retraso' : accion.estado] ?? accion.estado}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {responsableNames[accion.responsable] ?? accion.responsable ?? '—'}
              </TableCell>
              <TableCell className="font-mono text-sm">
                {accion.hora_limite?.slice(0, 5) ?? '—'}
              </TableCell>
              <TableCell>
                <span className="text-sm">
                  {PRIORIDAD_LABELS[accion.prioridad] ?? accion.prioridad}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(commentCounts[accion.id] ?? 0) > 0 && (
                    <span
                      title={`${commentCounts[accion.id]} comentario${commentCounts[accion.id] !== 1 ? 's' : ''}`}
                      className="inline-flex items-center gap-0.5 rounded bg-muted/80 px-1.5 py-0.5 text-xs text-muted-foreground"
                    >
                      <MessageSquare className="h-3 w-3" />
                      {commentCounts[accion.id]}
                    </span>
                  )}
                  {isEnRetraso(accion) && (
                    <span title="Retraso: fecha límite vencida" className="text-orange-600">
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                  )}
                  {accion.estado === 'Bloqueado' && (
                    <span title="Bloqueado" className="text-destructive">
                      <AlertCircle className="h-4 w-4" />
                    </span>
                  )}
                  {!accion.evidencia_cargada &&
                    (accion.estado === 'Hecho' || accion.estado === 'Verificado') && (
                    <span title="Sin evidencia cargada" className="text-amber-600">
                      <FileCheck className="h-4 w-4" />
                    </span>
                  )}
                  {!isEnRetraso(accion) &&
                    accion.estado !== 'Hecho' &&
                    accion.estado !== 'Verificado' &&
                    accion.estado !== 'Bloqueado' && (
                      <span title="Pendiente de cierre" className="text-muted-foreground">
                        <Clock className="h-4 w-4" />
                      </span>
                    )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
