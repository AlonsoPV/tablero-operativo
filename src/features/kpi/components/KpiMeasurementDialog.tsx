import { useMemo } from 'react'
import type { CatalogKpiCalcType } from '@/features/catalogs/types/catalogs.types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCatalogKpiMeasurements } from '../hooks/useCatalogKpiMeasurements'
import { useInsertCatalogKpiMeasurement } from '../hooks/useInsertCatalogKpiMeasurement'
import type { CatalogKpi } from '@/features/catalogs/types/catalogs.types'
import { useUsers } from '@/features/users/hooks/useUsers'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { getAppNow } from '@/lib/clock'
import { formatDateTimeCDMX } from '@/lib/dateUtils'
import {
  buildKpiMetricFromCatalogRow,
  DEFAULT_O2C_TARGET_HORIZON,
  resolveEffectiveStatusThresholds,
  resolveTarget,
} from '../utils/kpiCalculations'
import type { CatalogKpiO2cRow } from '../types/kpi.types'

function horizonShortLabel(): string {
  switch (DEFAULT_O2C_TARGET_HORIZON) {
    case 'm6':
      return 'M6'
    case 'm12':
      return 'M12'
    case 'm18':
    default:
      return 'M18'
  }
}

function formatRefNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n))
  const abs = Math.abs(n)
  const digits = abs >= 100 ? 1 : abs >= 1 ? 2 : 4
  return n.toLocaleString('es-MX', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}

function directionHint(calc: CatalogKpiCalcType | null | undefined, dir: string | null | undefined): string {
  const t = calc ?? (dir === 'maximize' ? 'maximize' : dir === 'minimize' ? 'minimize' : null)
  if (t === 'maximize') return 'Mayor valor es mejor'
  if (t === 'minimize') return 'Menor valor es mejor'
  if (t === 'binary') return 'Igualar a la meta'
  return '—'
}

type FormValues = {
  valor: string
  notes: string
  medido_en: string
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInputValue(local: string): string {
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? getAppNow().toISOString() : d.toISOString()
}

export function KpiMeasurementDialog({
  kpi,
  open,
  onOpenChange,
}: {
  kpi: CatalogKpi | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const kpiId = kpi?.id
  const { data: users = [] } = useUsers({ activo: true })
  const userById = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of users) m.set(u.id, u.nombre)
    return m
  }, [users])

  const { data: history = [], isLoading: histLoading } = useCatalogKpiMeasurements(kpiId, {
    limit: 25,
    enabled: open && !!kpiId,
  })
  const historyWithDelta = useMemo(
    () =>
      history.map((m, index) => {
        const prev = history[index + 1]
        const delta = prev ? m.valor - prev.valor : null
        return { ...m, delta }
      }),
    [history]
  )

  const insertM = useInsertCatalogKpiMeasurement()

  const defaultMedido = useMemo(() => toLocalInputValue(getAppNow().toISOString()), [open, kpiId])

  const form = useForm<FormValues>({
    defaultValues: { valor: '', notes: '', medido_en: defaultMedido },
  })

  const reference = useMemo(() => {
    if (!kpi) return null
    const row = kpi as CatalogKpiO2cRow
    const metric = buildKpiMetricFromCatalogRow(row, null)
    const eff = resolveTarget(metric, DEFAULT_O2C_TARGET_HORIZON)
    const th = resolveEffectiveStatusThresholds(metric)
    return {
      baseline: row.baseline,
      meta: eff,
      unit: row.unidad ?? '—',
      thGreen: th.greenMin,
      thYellow: th.yellowMin,
      directionText: directionHint(row.calc_type, row.direction),
    }
  }, [kpi])

  const latestMeasurement = history[0]

  const onSubmit = form.handleSubmit((vals) => {
    if (!kpi) return
    const num = Number(vals.valor)
    if (!Number.isFinite(num)) {
      toast.error('Indica un valor numérico válido')
      return
    }
    insertM.mutate(
      {
        catalog_kpi_id: kpi.id,
        valor: num,
        medido_en: vals.medido_en ? fromLocalInputValue(vals.medido_en) : undefined,
        notes: vals.notes.trim() || null,
        gapId: kpi.gap_id,
      },
      {
        onSuccess: () => {
          toast.success('Medición registrada')
          form.reset({ valor: '', notes: '', medido_en: toLocalInputValue(getAppNow().toISOString()) })
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Error al guardar'),
      }
    )
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" aria-describedby="kpi-measurement-desc">
        <DialogHeader>
          <DialogTitle>Medición — {kpi?.nombre ?? 'KPI'}</DialogTitle>
          <DialogDescription id="kpi-measurement-desc">
            El valor del KPI se toma de la última medición; también se actualiza el campo «valor actual» en
            catálogo. Usa la misma escala que línea base y meta.
          </DialogDescription>
        </DialogHeader>

        {kpi && reference && (
          <div
            className="rounded-lg border border-border/80 bg-muted/40 px-3 py-2.5 text-sm"
            aria-label="Referencia del KPI"
          >
            <p className="mb-2 text-xs font-semibold text-foreground">Referencia (misma escala que el tablero)</p>
            <dl className="grid grid-cols-[minmax(0,7.5rem)_1fr] gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-muted-foreground">Unidad</dt>
              <dd className="font-medium text-foreground">{reference.unit}</dd>
              <dt className="text-muted-foreground">Línea base</dt>
              <dd className="tabular-nums font-medium text-foreground">
                {formatRefNumber(reference.baseline)}
              </dd>
              <dt className="text-muted-foreground">Meta ({horizonShortLabel()})</dt>
              <dd className="tabular-nums font-medium text-foreground">
                {formatRefNumber(reference.meta)}
              </dd>
              <dt className="text-muted-foreground">Criterio</dt>
              <dd className="text-foreground">{reference.directionText}</dd>
              <dt className="text-muted-foreground">Semáforo (0–1)</dt>
              <dd className="text-foreground">
                Verde ≥{(reference.thGreen * 100).toFixed(0)}% · Amarillo ≥{(reference.thYellow * 100).toFixed(0)}%
              </dd>
            </dl>
            {latestMeasurement ? (
              <p className="mt-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                Última medición:{' '}
                <span className="font-medium tabular-nums text-foreground">{latestMeasurement.valor}</span>
                {' · '}
                {formatDateTimeCDMX(latestMeasurement.medido_en)}
              </p>
            ) : (
              <p className="mt-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                Sin mediciones previas; al guardar, este valor será el actual del KPI.
              </p>
            )}
          </div>
        )}

        <form key={`${kpiId ?? 'x'}-${open}`} onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="medicion-valor">Valor medido *</Label>
              <Input
                id="medicion-valor"
                type="number"
                step="any"
                required
                {...form.register('valor')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="medicion-fecha">Fecha / hora</Label>
              <Input id="medicion-fecha" type="datetime-local" {...form.register('medido_en')} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="medicion-notas">Notas</Label>
            <textarea
              id="medicion-notas"
              rows={2}
              {...form.register('notes')}
              className="flex min-h-[56px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
            <Button type="submit" disabled={insertM.isPending || !kpi}>
              {insertM.isPending ? 'Guardando…' : 'Registrar medición'}
            </Button>
          </div>
        </form>

        <div className="border-t pt-4">
          <h4 className="mb-2 text-sm font-medium">Historial reciente</h4>
          {histLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin mediciones aún.</p>
          ) : (
            <div className="max-h-48 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Fecha</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Tendencia</TableHead>
                    <TableHead className="max-w-[100px]">Registró</TableHead>
                    <TableHead>Notas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyWithDelta.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTimeCDMX(m.medido_en)}
                      </TableCell>
                      <TableCell className="tabular-nums font-medium">{m.valor}</TableCell>
                      <TableCell
                        className={
                          m.delta == null
                            ? 'text-xs text-muted-foreground'
                            : m.delta > 0
                              ? 'text-xs tabular-nums text-emerald-700 dark:text-emerald-300'
                              : m.delta < 0
                                ? 'text-xs tabular-nums text-rose-700 dark:text-rose-300'
                                : 'text-xs tabular-nums text-muted-foreground'
                        }
                      >
                        {m.delta == null ? '—' : `${m.delta > 0 ? '+' : ''}${m.delta.toFixed(2)}`}
                      </TableCell>
                      <TableCell className="max-w-[100px] truncate text-xs text-muted-foreground">
                        {m.measured_by ? userById.get(m.measured_by) ?? m.measured_by.slice(0, 8) : '—'}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate text-xs">
                        {m.notes ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
