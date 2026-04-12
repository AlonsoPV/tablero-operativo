/**
 * Tablero KPIs O2C: score global, filtros, lista ordenable y tarjetas por KPI.
 */

import { useCallback, useMemo, useState } from 'react'
import {
  Download,
  Filter,
  Gauge,
  ListChecks,
  RefreshCw,
} from 'lucide-react'
import { getAppNow } from '@/lib/clock'
import { InfoHint } from '@/components/InfoHint'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useKpisDashboardData, useGlobalScoreEvolution, useGapKpiLinks } from '../hooks'
import {
  getGapWeights,
  KPI_COMPLIANCE_CRITICAL_MAX,
  resolveEffectiveStatusThresholds,
  resolveTarget,
  isLiteralMetaCumplida,
  DEFAULT_O2C_TARGET_HORIZON,
  type KpiComplianceStatus,
  type TargetHorizon,
} from '../utils/kpiCalculations'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import { GlobalScoreMdSpecPanel } from '../components/GlobalScoreMdSpecPanel'
import { KpiSortButton, type SortDir, type SortKey } from '../components/KpiSortButton'
import type { CatalogKpi } from '@/features/catalogs/types/catalogs.types'
import { KpiMeasurementDialog } from '../components/KpiMeasurementDialog'
import { KpiCard, type KpiCardViewModel } from '../components/KpiCard'
import { buildKpiDashboardCsv, downloadKpiDashboardCsv } from '../utils/exportKpiDashboardCsv'
import { lastMeasurementValuesForSparkline } from '../utils/kpiSparklineData'

type FilterStatus = 'all' | KpiComplianceStatus | 'sin_datos'

function horizonShortLabel(h: TargetHorizon): string {
  switch (h) {
    case 'm6':
      return 'M6'
    case 'm12':
      return 'M12'
    case 'm18':
    default:
      return 'M18'
  }
}

export function KpisDashboardPage() {
  const [targetHorizon, setTargetHorizon] = useState<TargetHorizon>(DEFAULT_O2C_TARGET_HORIZON)
  const scoreEvolution = useGlobalScoreEvolution({ targetHorizon })

  const {
    recentById,
    weightWarning,
    isLoading: portfolioLoading,
    targetHorizon: pipelineHorizon,
    gapsLoading,
    userById,
    enriched,
  } = useKpisDashboardData(targetHorizon)
  const { links, isLoading: gapLinksLoading } = useGapKpiLinks()

  /** Referencia analítica: suma de pesos por gap (sin exigencia de suma = 1 por gap). */
  const gapWeightRows = useMemo(() => {
    const wmap = getGapWeights(
      enriched.map((e) => ({
        gap_id: e.row.gap_id,
        weight: e.row.weight,
        activo: e.row.activo,
      })),
      { onlyActivo: true }
    )
    const rows: { gapId: string; label: string; sum: number }[] = []
    for (const [gapId, sum] of wmap) {
      const label =
        enriched.find((e) => e.row.gap_id === gapId)?.gap?.nombre ?? gapId
      rows.push({ gapId, label, sum })
    }
    return rows.sort((a, b) => a.label.localeCompare(b.label, 'es'))
  }, [enriched])

  const [areaFilter, setAreaFilter] = useState<string>('all')
  const [kpiFilter, setKpiFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all')
  const [sortKey, setSortKey] = useState<SortKey>('nombre')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [measurementKpi, setMeasurementKpi] = useState<CatalogKpi | null>(null)

  const areaOptions = useMemo(() => {
    const set = new Set<string>()
    for (const e of enriched) {
      const a = e.gap?.area
      if (a) set.add(a)
    }
    return [...set].sort()
  }, [enriched])

  const kpiOptions = useMemo(() => {
    return [...enriched]
      .map((e) => ({ id: e.row.id, nombre: e.row.nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [enriched])

  const ownerOptions = useMemo(() => {
    const set = new Set<string>()
    for (const e of enriched) {
      const id = e.row.owner_usuario
      if (id) set.add(id)
    }
    return [...set].sort((a, b) => (userById.get(a) ?? a).localeCompare(userById.get(b) ?? b))
  }, [enriched, userById])

  /** Aproximación a “categoría” del documento funcional (`docs/KPIs.md`): campo `tipo` en catálogo. */
  const tipoOptions = useMemo(() => {
    const set = new Set<string>()
    for (const e of enriched) {
      const t = (e.row.tipo ?? '').trim()
      if (t) set.add(t)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es'))
  }, [enriched])

  const filtered = useMemo(() => {
    return enriched.filter((e) => {
      if (kpiFilter !== 'all' && e.row.id !== kpiFilter) return false
      if (areaFilter !== 'all') {
        const a = e.gap?.area ?? ''
        if (a !== areaFilter) return false
      }
      if (categoryFilter !== 'all') {
        const t = (e.row.tipo ?? '').trim()
        if (t !== categoryFilter) return false
      }
      if (ownerFilter !== 'all') {
        if ((e.row.owner_usuario ?? '') !== ownerFilter) return false
      }
      if (statusFilter !== 'all') {
        if (statusFilter === 'sin_datos') {
          if (e.compliance !== null) return false
        } else {
          if (e.status !== statusFilter) return false
        }
      }
      return true
    })
  }, [enriched, kpiFilter, areaFilter, categoryFilter, ownerFilter, statusFilter])

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    const list = [...filtered]
    list.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'nombre':
          cmp = a.row.nombre.localeCompare(b.row.nombre, 'es')
          break
        case 'compliance': {
          const ca = a.compliance ?? -1
          const cb = b.compliance ?? -1
          cmp = ca - cb
          break
        }
        case 'weight': {
          const wa = a.row.weight ?? -1
          const wb = b.row.weight ?? -1
          cmp = wa - wb
          break
        }
        case 'area': {
          const aa = a.gap?.area ?? ''
          const ab = b.gap?.area ?? ''
          cmp = aa.localeCompare(ab, 'es')
          break
        }
        case 'status': {
          const rank = (s: KpiComplianceStatus | null) =>
            s === 'on_track' ? 3 : s === 'at_risk' ? 2 : s === 'off_track' ? 1 : 0
          cmp = rank(a.status) - rank(b.status)
          break
        }
        default:
          cmp = 0
      }
      return cmp * dir
    })
    return list
  }, [filtered, sortKey, sortDir])

  const viewModels: KpiCardViewModel[] = useMemo(() => {
    return sorted.map((e) => {
      const gapLabel = e.gap?.nombre ?? null
      const oid = e.row.owner_usuario
      const ownerLabel = oid ? userById.get(oid) ?? oid : null
      const noData = e.compliance === null
      const orphanGap = Boolean(e.row.gap_id && !e.gap)
      const eff = resolveTarget(e.metric, pipelineHorizon)
      const th = resolveEffectiveStatusThresholds(e.metric)
      const thStr = `Semáforo ≥${(th.greenMin * 100).toFixed(0)}% / ≥${(th.yellowMin * 100).toFixed(0)}%`
      const metaLine =
        eff != null && Number.isFinite(eff)
          ? `Meta (${horizonShortLabel(pipelineHorizon)}): ${eff.toFixed(2)} · ${thStr}`
          : thStr
      return {
        row: e.row,
        gapLabel,
        ownerLabel,
        compliancePct: e.compliance,
        status: e.status,
        weight: e.row.weight,
        trendDelta: e.trendDelta,
        prevCompliancePct: e.prevCompliance,
        noData,
        orphanGap,
        metaLine,
        currentValue: e.metric.current,
        targetValue: eff,
        unit: e.row.unidad ?? null,
        sparklineValues: lastMeasurementValuesForSparkline(recentById.get(e.row.id)),
        literalMetaCumplida: isLiteralMetaCumplida(e.metric, { targetHorizon: pipelineHorizon }),
      }
    })
  }, [sorted, userById, pipelineHorizon, recentById])

  const kpiGapProgress = useMemo(() => {
    return filtered
      .map((e) => {
        const link = links.find((item) => item.gapId === e.row.gap_id)
        return {
          kpiId: e.row.id,
          kpiNombre: e.row.nombre,
          gapNombre: link?.gapNombre ?? null,
          avancePct: link?.avancePct ?? null,
          estado: link?.estado ?? null,
          puntosCompletados: link?.puntosCompletados ?? 0,
          totalPuntosGap: link?.totalPuntosGap ?? 0,
        }
      })
      .filter((item) => item.gapNombre !== null)
  }, [filtered, links])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'nombre' || key === 'area' ? 'asc' : 'desc')
    }
  }

  const loading = portfolioLoading || gapsLoading
  const hasActiveFilters =
    kpiFilter !== 'all' ||
    areaFilter !== 'all' ||
    categoryFilter !== 'all' ||
    ownerFilter !== 'all' ||
    statusFilter !== 'all'

  /** Alineado a alerta “peligro” del documento funcional (cumplimiento &lt; 30%). */
  const criticalKpiCount = useMemo(
    () => filtered.filter((e) => e.compliance != null && e.compliance < KPI_COMPLIANCE_CRITICAL_MAX).length,
    [filtered]
  )

  const handleExportCsv = useCallback(() => {
    const csv = buildKpiDashboardCsv(sorted, horizonShortLabel(pipelineHorizon))
    downloadKpiDashboardCsv(csv, `kpi-dashboard-${getAppNow().toISOString().slice(0, 10)}.csv`)
  }, [sorted, pipelineHorizon])

  return (
    <div
      data-page="kpi-dashboard"
      className="kpi-dashboard mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6"
    >
      <header className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Catálogo O2C</p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">KPIs O2C</h1>
              <InfoHint text="Pantalla ejecutiva para seguimiento de cumplimiento KPI por catálogo O2C, con score global, semáforo y detalle por indicador." />
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Cumplimiento ponderado por mediciones de catálogo (última medición; coincide con valor actual al
              registrar). Las acciones no actualizan el KPI por medición; solo reflejan avance en gaps.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 text-xs text-muted-foreground shadow-sm">
            <Gauge className="kpi-dashboard__horizon-icon h-4 w-4" aria-hidden />
            Horizonte activo:{' '}
            <span className="font-medium text-foreground">{horizonShortLabel(targetHorizon)}</span>
          </div>
        </div>
      </header>

      {weightWarning && (
        <div
          data-section="weight-warning"
          className="kpi-dashboard__weight-warning rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
          role="status"
        >
          {weightWarning}
        </div>
      )}

      <section data-section="portfolio-health" className="scroll-mt-4">
        <SectionCard>
          <SectionCardHeader
            title="Salud global del portafolio"
            subtitle="Score ponderado O2C y metodología del documento KPIs."
            action={
              <InfoHint text="Muestra el score global con la metodología del documento KPIs y su semáforo agregado." />
            }
          />
          <SectionCardBody className="space-y-4">
            <div>
              <p className="text-4xl font-semibold tabular-nums text-foreground">
                {scoreEvolution.globalScore != null ? `${Math.round(scoreEvolution.globalScore * 100)}` : '—'}
                <span className="ml-1 text-xl text-muted-foreground">%</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Score global ponderado O2C</p>
            </div>
            <div className="kpi-dashboard__md-score">
              <GlobalScoreMdSpecPanel
                programMonthIndex={scoreEvolution.programMonthIndex}
                programStartConfigured={scoreEvolution.programStartConfigured}
                md={scoreEvolution.mdSpec}
              />
            </div>
            {criticalKpiCount > 0 ? (
              <div
                data-section="critical-alert"
                className="kpi-dashboard__critical-alert rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="status"
              >
                <span className="font-medium">Atención: </span>
                {criticalKpiCount} indicador(es) con cumplimiento inferior al 30% en la vista actual. Conviene
                revisar plan de acción o mediciones.
              </div>
            ) : null}
            {gapWeightRows.length > 0 && (
              <details className="kpi-dashboard__gap-weights rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                <summary className="kpi-dashboard__gap-weights-summary cursor-pointer list-none font-medium text-foreground">
                  Ver distribución de pesos por gap
                </summary>
                <div className="kpi-dashboard__gap-weights-body mt-2 space-y-2" role="note">
                  <div className="kpi-dashboard__gap-weights-head flex items-center gap-2">
                    <p className="font-medium text-foreground">Peso acumulado por gap (referencia)</p>
                    <InfoHint text="Referencia analítica para distribución de pesos por gap. No se exige suma de 1 por gap; la validación obligatoria es global del portafolio." />
                  </div>
                  <ul className="kpi-dashboard__gap-weights-list list-inside list-disc space-y-0.5">
                    {gapWeightRows.map((g) => (
                      <li key={g.gapId} className="kpi-dashboard__gap-weights-item" data-gap-id={g.gapId}>
                        "{g.label}": {g.sum.toFixed(4)}
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            )}
          </SectionCardBody>
        </SectionCard>
      </section>

      <section data-section="filters" className="scroll-mt-4" aria-labelledby="kpi-filters-title">
        <SectionCard>
          <SectionCardHeader
            icon={Filter}
            titleId="kpi-filters-title"
            title="Filtros y orden"
            subtitle="Afectan el listado de KPIs y el orden del detalle visible."
            action={
              <div className="flex flex-wrap items-center gap-2">
                <InfoHint text="Los filtros afectan el listado de KPIs y sus tarjetas. El orden aplica al detalle visible." />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="kpi-dashboard__btn-export"
                  onClick={handleExportCsv}
                  disabled={sorted.length === 0}
                >
                  <Download className="mr-1 h-3.5 w-3.5" aria-hidden />
                  Exportar CSV
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="kpi-dashboard__btn-clear-filters"
                  onClick={() => {
                    setKpiFilter('all')
                    setAreaFilter('all')
                    setCategoryFilter('all')
                    setOwnerFilter('all')
                    setStatusFilter('all')
                  }}
                  disabled={!hasActiveFilters}
                >
                  <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden />
                  Limpiar filtros
                </Button>
              </div>
            }
          />
          <SectionCardBody className="space-y-4">
        <div className="kpi-dashboard__filters-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="kpi-dashboard__filter-field kpi-dashboard__filter-field--kpi space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="kpi-filter-kpi">KPI</Label>
              <InfoHint text="Reduce la vista a un solo indicador (lista, detalle y CSV). No cambia metas del catálogo ni mediciones; solo filtra qué KPIs ves." />
            </div>
            <Select value={kpiFilter} onValueChange={setKpiFilter}>
              <SelectTrigger id="kpi-filter-kpi" className="kpi-dashboard__select kpi-dashboard__select--kpi">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {kpiOptions.map((kpi) => (
                  <SelectItem key={kpi.id} value={kpi.id}>
                    {kpi.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="kpi-dashboard__filter-field kpi-dashboard__filter-field--horizon space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="kpi-horizon">Horizonte de meta</Label>
              <InfoHint text="Define qué meta numérica usa el motor O2C en este tablero: M6, M12 o M18 (con reglas de fallback entre columnas). Afecta el valor de meta efectiva, cumplimiento y score O2C de las tarjetas; no edita las metas en base de datos. El bloque «Score global (metodología documento KPIs)» elige M3/M6/M12/M18 según el mes de programa (VITE_O2C_PROGRAM_START), no este control." />
            </div>
            <Select
              value={targetHorizon}
              onValueChange={(v) => setTargetHorizon(v as TargetHorizon)}
            >
              <SelectTrigger id="kpi-horizon" className="kpi-dashboard__select kpi-dashboard__select--horizon">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="m6">M6 (con fallback M12 → M18)</SelectItem>
                <SelectItem value="m12">M12 (con fallback M18)</SelectItem>
                <SelectItem value="m18">M18 (por defecto O2C)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="kpi-dashboard__filter-field kpi-dashboard__filter-field--area space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="kpi-filter-area">Área (gap)</Label>
              <InfoHint text="Filtra por gap o área temática. No modifica metas, pesos ni mediciones." />
            </div>
            <Select value={areaFilter} onValueChange={setAreaFilter}>
              <SelectTrigger id="kpi-filter-area" className="kpi-dashboard__select kpi-dashboard__select--area">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {areaOptions.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="kpi-dashboard__filter-field kpi-dashboard__filter-field--tipo space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="kpi-filter-tipo">Tipo (categoría)</Label>
              <InfoHint text="Filtra por categoría del KPI en catálogo. No altera metas ni el cálculo de cumplimiento de los KPIs que permanecen visibles." />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger id="kpi-filter-tipo" className="kpi-dashboard__select kpi-dashboard__select--tipo">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {tipoOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="kpi-dashboard__filter-field kpi-dashboard__filter-field--owner space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="kpi-filter-owner">Responsable (KPI)</Label>
              <InfoHint text="Filtra por responsable asignado al KPI. No cambia metas ni ponderaciones." />
            </div>
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger id="kpi-filter-owner" className="kpi-dashboard__select kpi-dashboard__select--owner">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {ownerOptions.map((id) => (
                  <SelectItem key={id} value={id}>
                    {userById.get(id) ?? id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="kpi-dashboard__filter-field kpi-dashboard__filter-field--status space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="kpi-filter-status">Estado cumplimiento</Label>
              <InfoHint text="Filtra por semáforo O2C (avance vs umbrales del KPI). Oculta KPIs que no coincidan; no modifica metas ni recalcula cumplimientos." />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as FilterStatus)}
            >
              <SelectTrigger id="kpi-filter-status" className="kpi-dashboard__select kpi-dashboard__select--status">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="on_track">En meta</SelectItem>
                <SelectItem value="at_risk">En riesgo</SelectItem>
                <SelectItem value="off_track">Fuera de meta</SelectItem>
                <SelectItem value="sin_datos">Sin datos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="kpi-dashboard__sort-row flex flex-wrap items-end gap-3 sm:col-span-2 lg:col-span-3 xl:col-span-6">
            <span className="kpi-dashboard__sort-label text-xs text-muted-foreground">Ordenar por:</span>
            <div className="kpi-dashboard__sort-buttons flex flex-wrap gap-2">
              <span className="kpi-dashboard__sort-btn-wrap" data-sort-key="nombre">
                <KpiSortButton k="nombre" label="Nombre" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              </span>
              <span className="kpi-dashboard__sort-btn-wrap" data-sort-key="compliance">
                <KpiSortButton k="compliance" label="%" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              </span>
              <span className="kpi-dashboard__sort-btn-wrap" data-sort-key="weight">
                <KpiSortButton k="weight" label="Peso" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              </span>
              <span className="kpi-dashboard__sort-btn-wrap" data-sort-key="area">
                <KpiSortButton k="area" label="Área" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              </span>
              <span className="kpi-dashboard__sort-btn-wrap" data-sort-key="status">
                <KpiSortButton k="status" label="Estado" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              </span>
            </div>
          </div>
        </div>
          </SectionCardBody>
        </SectionCard>
      </section>

      <section className="scroll-mt-4">
        <SectionCard>
          <SectionCardHeader
            title="Avance de gaps vinculados"
            subtitle="Cada KPI se alimenta del cierre de su gap; al 100% el KPI puede alcanzar su meta."
            action={
              <InfoHint text="Cada KPI se alimenta del cierre de su gap. Cuando el gap llega a 100%, el KPI puede alcanzar su meta." />
            }
          />
          <SectionCardBody className="space-y-2">
          {gapLinksLoading ? (
            <p className="text-sm text-muted-foreground">Cargando avance de gaps vinculados…</p>
          ) : kpiGapProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ningún KPI visible tiene gap vinculado con avance registrado.
            </p>
          ) : (
            kpiGapProgress.map((item) => (
              <div key={item.kpiId} className="flex items-center gap-3 text-sm">
                <span className="w-48 shrink-0 truncate font-medium">{item.kpiNombre}</span>
                <span className="text-muted-foreground">←</span>
                <span className="w-40 shrink-0 truncate text-muted-foreground">{item.gapNombre}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn('h-full rounded-full transition-all', {
                      'bg-emerald-500': item.estado === 'cerrado',
                      'bg-amber-500': item.estado === 'en_progreso',
                      'bg-muted-foreground/30': item.estado === 'abierto',
                    })}
                    style={{ width: `${Math.round((item.avancePct ?? 0) * 100)}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right tabular-nums text-xs text-muted-foreground">
                  {item.avancePct != null ? `${Math.round(item.avancePct * 100)}%` : '—'}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-2 py-0.5 text-xs font-medium text-foreground shadow-sm">
                  <span
                    className={cn('h-1.5 w-1.5 shrink-0 rounded-full', {
                      'bg-emerald-500': item.estado === 'cerrado',
                      'bg-amber-500': item.estado === 'en_progreso',
                      'bg-muted-foreground/40': item.estado === 'abierto',
                    })}
                    aria-hidden
                  />
                  {item.estado === 'cerrado'
                    ? 'Cerrado'
                    : item.estado === 'en_progreso'
                      ? 'En progreso'
                      : 'Abierto'}
                </span>
              </div>
            ))
          )}
          </SectionCardBody>
        </SectionCard>
      </section>

      <section
        data-section="kpi-detail"
        className="scroll-mt-4"
        aria-labelledby="kpi-list-title"
      >
        <SectionCard>
          <SectionCardHeader
            icon={ListChecks}
            titleId="kpi-list-title"
            title={`Detalle de KPIs (${viewModels.length})`}
            subtitle="Cumplimiento, tendencia, peso, gap y responsable."
            action={
              <InfoHint text="Tarjetas detalladas con cumplimiento, tendencia, peso, gap y responsable para análisis operativo." />
            }
          />
          <SectionCardBody>
        {loading ? (
          <p className="kpi-dashboard__loading text-sm text-muted-foreground">Cargando…</p>
        ) : viewModels.length === 0 ? (
          <p className="kpi-dashboard__empty text-sm text-muted-foreground">No hay KPIs que coincidan con los filtros.</p>
        ) : (
          <div className="kpi-dashboard__cards-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {viewModels.map((vm) => (
              <KpiCard
                key={vm.row.id}
                vm={vm}
                onRegisterMeasurement={() => setMeasurementKpi(vm.row)}
              />
            ))}
          </div>
        )}
          </SectionCardBody>
        </SectionCard>
      </section>

      <div data-section="measurement-dialog" className="kpi-dashboard__measurement-dialog">
        <KpiMeasurementDialog
          kpi={measurementKpi}
          open={!!measurementKpi}
          onOpenChange={(o) => {
            if (!o) setMeasurementKpi(null)
          }}
        />
      </div>
    </div>
  )
}
