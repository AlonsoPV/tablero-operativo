import { CheckCircle2, ChevronDown, ClipboardList, Info, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { KpiSparkline } from './KpiSparkline'
import type { CatalogKpiO2cRow } from '../types/kpi.types'
import {
  type KpiComplianceStatus,
  type KpiMetric,
  resolveEffectiveCalcType,
  resolveEffectiveStatusThresholds,
} from '../utils/kpiCalculations'
import type { ReactNode } from 'react'

export type KpiCardViewModel = {
  row: CatalogKpiO2cRow
  gapLabel: string | null
  ownerLabel: string | null
  compliancePct: number | null
  status: KpiComplianceStatus | null
  weight: number | null
  trendDelta: number | null
  /** Cumplimiento de la penúltima medición (0–1), para comparar con la última. */
  prevCompliancePct: number | null
  /** Sin medición reciente ni current_value válido */
  noData: boolean
  /** `gap_id` en BD pero el gap no está en la lista cargada (referencia rota). */
  orphanGap?: boolean
  /** Meta efectiva y umbrales de semáforo (horizonte M6/M12/M18). */
  metaLine?: string | null
  currentValue: number | null
  targetValue: number | null
  unit: string | null
  /** Últimos valores medidos (orden cronológico) para mini serie. */
  sparklineValues?: number[]
  /** Meta numérica cumplida en valor (actual vs meta), distinto del % de avance. */
  literalMetaCumplida: boolean | null
}

type KpiCardProps = {
  vm: KpiCardViewModel
  /** Si se pasa, muestra acción para abrir el diálogo de medición (p. ej. tablero /dashboard/kpis). */
  onRegisterMeasurement?: () => void
  /** Clases extra en la tarjeta (p. ej. `kpi-dashboard__card` en el tablero KPIs). */
  className?: string
}

function statusBadgeVariant(
  status: KpiComplianceStatus | null,
  noData: boolean
): 'success' | 'secondary' | 'destructive' | 'muted' {
  if (noData) return 'muted'
  if (status === 'on_track') return 'success'
  if (status === 'at_risk') return 'secondary'
  return 'destructive'
}

function statusLabel(status: KpiComplianceStatus | null, noData: boolean): string {
  if (noData) return 'Sin datos'
  if (status === 'on_track') return 'En meta'
  if (status === 'at_risk') return 'En riesgo'
  if (status === 'off_track') return 'Fuera de meta'
  return '—'
}

function formatValueWithUnit(value: number | null, unit: string | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value}${unit ? ` ${unit}` : ''}`
}

function catalogRowToMetric(row: CatalogKpiO2cRow, current: number | null): KpiMetric {
  return {
    id: row.id,
    baseline: row.baseline,
    target_m3: row.target_m3,
    target_m6: row.target_m6,
    target_m12: row.target_m12,
    target_m18: row.target_m18,
    calc_type: row.calc_type,
    direction: row.direction,
    weight: row.weight,
    current,
    threshold_green: row.threshold_green,
    threshold_yellow: row.threshold_yellow,
  }
}

function formatNum(n: number | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return Number.isInteger(n) ? String(n) : n.toFixed(digits)
}

function calcModeLabel(
  mode: ReturnType<typeof resolveEffectiveCalcType>
): { title: string; explain: string; advanceExplain: string } {
  switch (mode) {
    case 'maximize':
      return {
        title: 'Indicador a maximizar',
        explain:
          'Se espera subir el valor medido desde la línea base hacia la meta. Mejor desempeño = valores más altos al acercarse o superar la meta.',
        advanceExplain:
          'El % de avance es el progreso en el tramo entre línea base y meta (no es el valor bruto de la medición).',
      }
    case 'minimize':
      return {
        title: 'Indicador a minimizar',
        explain:
          'Se espera bajar el valor medido desde la línea base hacia la meta. Mejor desempeño = valores más bajos al acercarse o cumplir la meta.',
        advanceExplain:
          'El % de avance mide cuánto te acercas de la base a la meta en sentido «menor es mejor».',
      }
    case 'binary':
      return {
        title: 'Indicador binario',
        explain:
          'El cumplimiento es pleno solo cuando el valor actual coincide con la meta configurada; si no, el avance queda en 0%.',
        advanceExplain: 'No hay tramo intermedio: cumple o no cumple respecto a la meta numérica.',
      }
    default:
      return {
        title: 'Tipo de indicador',
        explain: 'Revisa en catálogo el tipo de cálculo (maximizar, minimizar o binario) y la meta del horizonte activo.',
        advanceExplain: 'El avance se deriva de línea base, meta y valor actual según las reglas del KPI.',
      }
  }
}

/**
 * Explica qué significa el badge de estado en términos de negocio (valores medidos vs meta), no solo el % abstracto.
 */
function KpiOperationalStatusInterpretation({
  kpiNombre,
  calcMode,
  status,
  noData,
  currentValue,
  targetValue,
  baseline,
  unit,
  literalMetaCumplida,
  barPct,
}: {
  kpiNombre: string
  calcMode: ReturnType<typeof resolveEffectiveCalcType>
  status: KpiComplianceStatus | null
  noData: boolean
  currentValue: number | null
  targetValue: number | null
  baseline: number | null
  unit: string | null
  literalMetaCumplida: boolean | null
  barPct: number
}): ReactNode {
  const u = unit ? ` ${unit}` : ''
  const cur =
    currentValue != null && Number.isFinite(currentValue) ? formatNum(currentValue) : null
  const tgt = targetValue != null && Number.isFinite(targetValue) ? formatNum(targetValue) : null
  const base = baseline != null && Number.isFinite(baseline) ? formatNum(baseline) : null
  const badge = statusLabel(status, noData)

  if (noData) {
    return (
      <p className="leading-snug text-muted-foreground">
        Sin medición reciente no hay lectura operativa: no sabes si —por ejemplo— las reasignaciones, el tiempo de
        carta porte u otro valor de este indicador están por encima o por debajo de la meta hasta registrar el dato.
      </p>
    )
  }

  if (calcMode === 'binary') {
    return (
      <div className="space-y-2 leading-snug">
        <p>
          El estado <strong className="text-foreground">{badge}</strong> en «{kpiNombre}» indica si el valor medido{' '}
          <strong className="text-foreground">coincide o no</strong> con la meta numérica
          {tgt != null ? (
            <>
              {' '}
              (<span className="tabular-nums">{tgt}</span>
              {u})
            </>
          ) : null}
          .
          {cur != null ? (
            <>
              {' '}
              Ahora el valor es <span className="tabular-nums font-medium text-foreground">{cur}</span>
              {u}.
            </>
          ) : null}
        </p>
        <p className="text-muted-foreground">
          En modo binario el avance solo es 0% o 100%: o alcanzas esa meta en valor o no; no hay tramo intermedio.
        </p>
      </div>
    )
  }

  if (calcMode === 'minimize') {
    return (
      <div className="space-y-2 leading-snug">
        <p>
          En indicadores donde <strong className="text-foreground">menor es mejor</strong> (p. ej. reasignaciones al día,
          tiempo de generación de carta porte, días de ciclo de cobro —según lo que mida «{kpiNombre}»), el valor de{' '}
          <strong className="text-foreground">Actual</strong> es lo que está ocurriendo en operación frente a la{' '}
          <strong className="text-foreground">meta</strong>.
          {cur != null && tgt != null ? (
            <>
              {' '}
              Aquí: <span className="tabular-nums font-medium text-foreground">{cur}</span>
              {u} medido vs <span className="tabular-nums font-medium text-foreground">{tgt}</span>
              {u} como objetivo.
            </>
          ) : cur != null ? (
            <>
              {' '}
              Valor actual: <span className="tabular-nums font-medium text-foreground">{cur}</span>
              {u}.
            </>
          ) : null}
        </p>
        {status === 'on_track' ? (
          <p>
            El badge <strong className="text-foreground">{badge}</strong> significa que el <strong>avance</strong> (
            {barPct}%), es decir el progreso desde la línea base
            {base != null ? (
              <>
                {' '}
                (<span className="tabular-nums">{base}</span>
                {u})
              </>
            ) : null}{' '}
            hacia la meta, <strong className="text-foreground">supera el umbral verde</strong>. Eso puede darse aunque
            en absoluto aún veas cifras incómodas —por ejemplo <strong className="text-foreground">1,5</strong> frente
            a meta <strong className="text-foreground">0</strong> en reasignaciones—: el semáforo mide el trayecto de
            mejora, no solo si ya estás en el número ideal.
          </p>
        ) : status === 'at_risk' ? (
          <p>
            El badge <strong className="text-foreground">{badge}</strong> indica <strong>avance intermedio</strong> (
            {barPct}%): el indicador avanza hacia la meta pero sin alcanzar aún el margen del umbral verde; en operación
            suele traducirse en que el valor medido sigue alejado del objetivo (p. ej. tiempo de carta porte o volumen
            de incidencias aún por reducir).
          </p>
        ) : (
          <p>
            El badge <strong className="text-foreground">{badge}</strong> indica que el avance ({barPct}%) está{' '}
            <strong className="text-foreground">por debajo del umbral amarillo</strong>: en la práctica el indicador
            sigue lejos de donde debe estar en terreno (demasiadas reasignaciones, tiempos altos, etc., según este KPI).
          </p>
        )}
        {literalMetaCumplida === false && cur != null && tgt != null ? (
          <p className="border-t border-border/40 pt-2 text-muted-foreground">
            <strong className="text-foreground">Meta en valor: No cumple</strong> confirma que{' '}
            <span className="tabular-nums">{cur}</span>
            {u} aún no iguala o no está por debajo de la exigencia <span className="tabular-nums">{tgt}</span>
            {u}: hay que seguir bajando el número en operación, no solo mirar el % de avance.
          </p>
        ) : null}
      </div>
    )
  }

  if (calcMode === 'maximize') {
    return (
      <div className="space-y-2 leading-snug">
        <p>
          En indicadores donde <strong className="text-foreground">mayor es mejor</strong> (p. ej. % PODs a tiempo,
          cobertura), el <strong className="text-foreground">Actual</strong> es el resultado en operación frente a la{' '}
          <strong className="text-foreground">meta</strong>.
          {cur != null && tgt != null ? (
            <>
              {' '}
              Aquí: <span className="tabular-nums font-medium text-foreground">{cur}</span>
              {u} vs <span className="tabular-nums font-medium text-foreground">{tgt}</span>
              {u} como objetivo.
            </>
          ) : cur != null ? (
            <>
              {' '}
              Valor actual: <span className="tabular-nums font-medium text-foreground">{cur}</span>
              {u}.
            </>
          ) : null}
        </p>
        {status === 'on_track' ? (
          <p>
            El badge <strong className="text-foreground">{badge}</strong> indica que el avance ({barPct}%) —progreso
            desde la línea base
            {base != null ? (
              <>
                {' '}
                (<span className="tabular-nums">{base}</span>
                {u})
              </>
            ) : null}{' '}
            hacia la meta— <strong className="text-foreground">supera el umbral verde</strong>: el desempeño del
            indicador va en la dirección correcta.
          </p>
        ) : status === 'at_risk' ? (
          <p>
            El badge <strong className="text-foreground">{badge}</strong> indica avance intermedio ({barPct}%): el
            resultado mejora pero aún no alcanza el margen exigido para considerarse “en meta” en el tablero.
          </p>
        ) : (
          <p>
            El badge <strong className="text-foreground">{badge}</strong> indica avance bajo: el valor medido sigue
            lejos de la meta operativa (p. ej. cobertura o cumplimiento por debajo del objetivo).
          </p>
        )}
        {literalMetaCumplida === false && cur != null && tgt != null ? (
          <p className="border-t border-border/40 pt-2 text-muted-foreground">
            <strong className="text-foreground">Meta en valor: No cumple</strong> indica que{' '}
            <span className="tabular-nums">{cur}</span>
            {u} aún no alcanza el nivel <span className="tabular-nums">{tgt}</span>
            {u} exigido en valor absoluto.
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <p className="leading-snug">
      El estado <strong className="text-foreground">{badge}</strong> clasifica el avance ({barPct}%) frente a los
      umbrales. Para la lectura operativa, compara el valor actual
      {cur != null ? (
        <>
          {' '}
          (<span className="tabular-nums">{cur}</span>
          {u})
        </>
      ) : null}{' '}
      con la meta
      {tgt != null ? (
        <>
          {' '}
          (<span className="tabular-nums">{tgt}</span>
          {u})
        </>
      ) : null}
      .
    </p>
  )
}

export function KpiCard({ vm, onRegisterMeasurement, className }: KpiCardProps) {
  const {
    row,
    gapLabel,
    ownerLabel,
    compliancePct,
    status,
    weight,
    prevCompliancePct,
    noData,
    orphanGap,
    metaLine,
    currentValue,
    targetValue,
    unit,
    sparklineValues,
    literalMetaCumplida,
  } = vm
  const barPct = compliancePct != null ? Math.round(compliancePct * 100) : 0
  const prevBarPct = prevCompliancePct != null ? Math.round(prevCompliancePct * 100) : null
  const showTrendBars = prevCompliancePct != null && compliancePct != null && !noData
  const measurementCount = sparklineValues?.length ?? 0
  const hasEvolutionChart = measurementCount >= 2
  const firstMeasurement = measurementCount > 0 ? sparklineValues?.[0] ?? null : null
  const lastMeasurement = measurementCount > 0 ? sparklineValues?.[measurementCount - 1] ?? null : null

  const metricForHelp = catalogRowToMetric(row, currentValue)
  const calcMode = resolveEffectiveCalcType(metricForHelp)
  const modeCopy = calcModeLabel(calcMode)
  const thHelp = resolveEffectiveStatusThresholds(metricForHelp)
  const unitSuffix = unit ? ` ${unit}` : ''

  const metaParts = [
    !row.gap_id ? 'Sin gap' : null,
    orphanGap ? 'Gap no encontrado' : null,
    gapLabel ? `Gap: ${gapLabel}` : null,
    ownerLabel ? `Resp.: ${ownerLabel}` : null,
    metaLine,
    weight != null && Number.isFinite(weight) ? `Peso: ${(weight * 100).toFixed(1)}%` : null,
  ].filter(Boolean) as string[]

  return (
    <Card
      data-kpi-id={row.id}
      data-kpi-name={row.nombre}
      className={cn('kpi-dashboard__card overflow-hidden rounded-xl border-border/60 shadow-sm', className)}
    >
      <CardHeader className="kpi-card__header px-4 pb-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="kpi-card__title text-sm font-semibold leading-snug text-foreground">
            {row.nombre}
          </CardTitle>
          <Badge variant={statusBadgeVariant(status, noData)} className="shrink-0 text-[10px]">
            {statusLabel(status, noData)}
          </Badge>
        </div>
        {metaParts.length > 0 ? (
          <p className="mt-1 text-[11px] text-muted-foreground">{metaParts.join(' · ')}</p>
        ) : null}
      </CardHeader>
      <CardContent className="kpi-card__content space-y-3 px-4 pb-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Actual:{' '}
            <span className="font-medium text-foreground tabular-nums">
              {formatNum(currentValue)}
              {unit ? ` ${unit}` : ''}
            </span>
          </span>
          <span className="text-muted-foreground">
            Meta:{' '}
            <span className="font-medium text-foreground tabular-nums">
              {formatNum(targetValue)}
              {unit ? ` ${unit}` : ''}
            </span>
          </span>
        </div>
        <details className="kpi-card__help group rounded-lg border border-border/60 bg-gradient-to-b from-muted/40 to-muted/15 text-xs leading-relaxed text-muted-foreground shadow-sm">
          <summary className="kpi-card__help-summary flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
            <Info className="h-3.5 w-3.5 shrink-0 text-primary/80" aria-hidden />
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Guía de lectura
              </span>
              <span className="mt-0.5 block text-sm font-semibold leading-snug text-foreground">{row.nombre}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div className="space-y-3 border-t border-border/50 px-3 pb-3 pt-3">
            <div className="rounded-md border border-border/50 bg-background/60 px-2.5 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">{modeCopy.title}</p>
              <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{modeCopy.explain}</p>
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground/95">{modeCopy.advanceExplain}</p>
            </div>

            <dl className="kpi-card__help-numbers grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[11px]">
              <dt className="text-muted-foreground">Línea base</dt>
              <dd className="font-medium tabular-nums text-foreground">
                {formatNum(row.baseline)}
                {unitSuffix}
              </dd>
              <dt className="text-muted-foreground">Meta (horizonte del tablero)</dt>
              <dd className="font-medium tabular-nums text-foreground">
                {formatNum(targetValue)}
                {unitSuffix}
              </dd>
              <dt className="text-muted-foreground">Valor actual</dt>
              <dd className="font-medium tabular-nums text-foreground">
                {currentValue != null && Number.isFinite(currentValue) ? formatNum(currentValue) : '—'}
                {unitSuffix}
              </dd>
            </dl>

            <div className="rounded-md border border-border/40 bg-muted/30 px-2.5 py-2 text-[11px]">
              <p className="font-semibold text-foreground">Semáforo sobre el % de avance</p>
              <p className="mt-1 leading-snug">
                Verde (En meta): avance ≥{' '}
                <span className="tabular-nums font-medium text-foreground">
                  {(thHelp.greenMin * 100).toFixed(0)}%
                </span>
                . Amarillo (En riesgo): entre{' '}
                <span className="tabular-nums font-medium text-foreground">
                  {(thHelp.yellowMin * 100).toFixed(0)}%
                </span>{' '}
                y ese umbral. Rojo (Fuera): por debajo del amarillo.
              </p>
            </div>

            <div className="kpi-card__help-interpretation space-y-2 rounded-md border border-dashed border-border/60 bg-background/50 px-2.5 py-2 text-[11px]">
              <p className="font-semibold text-foreground">Qué indica el estado en la operación</p>
              <KpiOperationalStatusInterpretation
                kpiNombre={row.nombre}
                calcMode={calcMode}
                status={status}
                noData={noData}
                currentValue={currentValue}
                targetValue={targetValue}
                baseline={row.baseline}
                unit={unit}
                literalMetaCumplida={literalMetaCumplida}
                barPct={barPct}
              />
              {!noData ? (
                <p className="border-t border-border/40 pt-2 text-[10px] leading-snug text-muted-foreground">
                  Avance {barPct}%:{' '}
                  {calcMode === 'binary'
                    ? 'solo 0% o 100% según coincidencia con la meta.'
                    : 'progreso en el tramo línea base → meta; el badge resume ese avance frente a umbrales, no sustituye al valor medido.'}
                </p>
              ) : null}
            </div>

            <p className="text-[10px] leading-snug text-muted-foreground/90">
              «Actual» es el último valor registrado en medición. El avance y el semáforo son derivados para el tablero;
              no sustituyen al dato fuente.
            </p>
          </div>
        </details>
        <div
          className={cn(
            'kpi-card__literal-meta flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-xs',
            literalMetaCumplida === true && 'border-emerald-500/35 bg-emerald-500/5',
            literalMetaCumplida === false && 'border-destructive/35 bg-destructive/5',
            literalMetaCumplida === null && 'border-border bg-muted/30'
          )}
        >
          <span className="text-muted-foreground">Meta en valor</span>
          {literalMetaCumplida === null ? (
            <span className="font-medium text-muted-foreground">—</span>
          ) : literalMetaCumplida ? (
            <span className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
              Cumple
            </span>
          ) : (
            <span className="flex items-center gap-1.5 font-semibold text-destructive">
              <XCircle className="h-4 w-4 shrink-0" aria-hidden />
              No cumple
            </span>
          )}
        </div>
        <div className="kpi-card__compliance">
          <div className="kpi-card__compliance-head mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="min-w-0">
              <span>Avance</span>
              <span className="ml-1 text-[10px] font-normal leading-tight text-muted-foreground/90">
                (respecto a línea base y meta)
              </span>
            </div>
            <span className="shrink-0 font-medium tabular-nums text-foreground">
              {noData ? '—' : `${barPct}%`}
            </span>
          </div>
          <div className="kpi-card__compliance-track h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'kpi-card__compliance-fill',
                'h-full rounded-full transition-all',
                noData && 'bg-muted-foreground/30',
                !noData && status === 'on_track' && 'bg-emerald-500',
                !noData && status === 'at_risk' && 'bg-amber-500',
                !noData && status === 'off_track' && 'bg-destructive'
              )}
              style={{ width: noData ? '0%' : `${barPct}%` }}
            />
          </div>
        </div>
        <div className="kpi-card__evolution space-y-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
          <div className="kpi-card__evolution-head flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>Evolución individual</span>
            <span>{measurementCount > 0 ? `${measurementCount} medición${measurementCount === 1 ? '' : 'es'}` : 'Sin histórico'}</span>
          </div>
          {hasEvolutionChart ? (
            <div className="kpi-card__evolution-chart flex items-center gap-3">
              <KpiSparkline
                values={sparklineValues!}
                width={176}
                height={42}
                className="min-w-0 flex-1 text-primary"
                label={`Evolución individual de mediciones: ${row.nombre}`}
              />
              <div className="kpi-card__evolution-legend grid shrink-0 gap-1 text-[10px] tabular-nums">
                <div>
                  <p className="text-muted-foreground">Inicio</p>
                  <p className="font-medium text-foreground">{formatValueWithUnit(firstMeasurement, unit)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Última</p>
                  <p className="font-medium text-foreground">{formatValueWithUnit(lastMeasurement, unit)}</p>
                </div>
              </div>
            </div>
          ) : measurementCount === 1 ? (
            <div className="kpi-card__evolution-single flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Solo hay una medición registrada.</span>
              <span className="font-medium tabular-nums text-foreground">
                {formatValueWithUnit(lastMeasurement, unit)}
              </span>
            </div>
          ) : (
            <p className="kpi-card__evolution-empty text-xs text-muted-foreground">
              Aún no hay suficiente histórico para mostrar evolución. Registra mediciones para ver la serie.
            </p>
          )}
        </div>
        {showTrendBars && (
          <div className="kpi-card__trend-compare space-y-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-2">
            <p className="kpi-card__trend-compare-title text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Última vs penúltima medición
            </p>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="w-16 shrink-0 text-muted-foreground">Anterior</span>
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-muted-foreground/45"
                  style={{ width: `${prevBarPct}%` }}
                />
              </div>
              <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground">
                {prevBarPct}%
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="w-16 shrink-0 font-medium text-foreground">Última</span>
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full',
                    status === 'on_track' && 'bg-emerald-500',
                    status === 'at_risk' && 'bg-amber-500',
                    status === 'off_track' && 'bg-destructive'
                  )}
                  style={{ width: `${barPct}%` }}
                />
              </div>
              <span className="w-9 shrink-0 text-right tabular-nums font-medium text-foreground">
                {barPct}%
              </span>
            </div>
          </div>
        )}
        {onRegisterMeasurement ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="kpi-card__btn-measure w-full"
            onClick={onRegisterMeasurement}
          >
            <ClipboardList className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Registrar medición
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
