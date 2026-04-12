/**
 * Tablero de brechas O2C: cards con progreso por story points y estado del gap.
 */

import { useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Filter,
  ListChecks,
  RefreshCw,
  Target,
} from 'lucide-react'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import { InfoHint } from '@/components/InfoHint'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUsers } from '@/features/users/hooks/useUsers'
import { GapCard, type GapCardViewModel, type KpiSemaforoCounts } from '../components/GapCard'
import { useCatalogKpiO2cMetricItems, useGapAccionesForGapIds, useGapKpiLinks, useGaps } from '../hooks'
import type { CatalogKpiO2cRow, GapStatus } from '../types/kpi.types'
import { accionStoryPoints, computeGapStoryProgress } from '../utils/gapProgress'
import {
  computeStoryGlobalImpactPercent,
  FIBONACCI_STORY_POINTS,
  moscowPointsBudget,
  TARGET_SPRINT_VELOCITY_POINTS,
} from '../utils/storyPointsMethodology'
import { getGapWeight } from '../utils/kpiCalculations'

type SortKey = 'nombre' | 'progress' | 'status' | 'prioridad'
type SortDir = 'asc' | 'desc'

export function GapsDashboardPage() {
  const { data: gaps = [], isLoading: gapsLoading } = useGaps({ filters: { activo: true } })
  const { kpiRows, metricItems, isLoading: kpisLoading } = useCatalogKpiO2cMetricItems({
    activo: true,
  })
  const gapIds = useMemo(() => gaps.map((g) => g.id), [gaps])
  const { data: accionesData, isLoading: accionesLoading } = useGapAccionesForGapIds(gapIds)
  const acciones = accionesData?.acciones ?? []
  const junctionAccionIdsByGap = accionesData?.junctionAccionIdsByGap ?? new Map<string, Set<string>>()
  const { links: gapKpiLinks, isLoading: gapKpiLinksLoading } = useGapKpiLinks()
  const { data: users = [] } = useUsers({ activo: true })

  const userById = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of users) m.set(u.id, u.nombre)
    return m
  }, [users])

  const kpisByGapId = useMemo(() => {
    const m = new Map<string, CatalogKpiO2cRow[]>()
    for (const row of kpiRows) {
      const gid = row.gap_id
      if (!gid) continue
      const list = m.get(gid) ?? []
      list.push(row)
      m.set(gid, list)
    }
    return m
  }, [kpiRows])

  const kpiSemaforoByGapId = useMemo(() => {
    const m = new Map<string, KpiSemaforoCounts>()
    for (const item of metricItems) {
      const gid = item.row.gap_id
      if (!gid) continue
      const cur = m.get(gid) ?? { on_track: 0, at_risk: 0, off_track: 0, sin_datos: 0 }
      if (item.compliance === null || item.status === null) cur.sin_datos++
      else if (item.status === 'on_track') cur.on_track++
      else if (item.status === 'at_risk') cur.at_risk++
      else cur.off_track++
      m.set(gid, cur)
    }
    return m
  }, [metricItems])

  const gapKpiLinkById = useMemo(() => {
    const map = new Map<string, (typeof gapKpiLinks)[number]>()
    for (const link of gapKpiLinks) map.set(link.gapId, link)
    return map
  }, [gapKpiLinks])

  const baseCards = useMemo((): GapCardViewModel[] => {
    const out = gaps.map((gap) => {
      const junctionSet = junctionAccionIdsByGap.get(gap.id)
      const forGap = acciones.filter(
        (a) => a.gap_id === gap.id || junctionSet?.has(a.id)
      )
      const accionesCount = forGap.length
      const { donePoints, totalPoints } = computeGapStoryProgress(
        gap.id,
        acciones,
        gap.total_story_points ?? 0,
        junctionSet
      )
      const progressPct = totalPoints > 0 ? (donePoints / totalPoints) * 100 : 0
      const kpis = kpisByGapId.get(gap.id) ?? []
      const kpiWeightSum = (() => {
        const s = getGapWeight(
          gap.id,
          kpiRows.map((k) => ({ gap_id: k.gap_id, weight: k.weight, activo: k.activo })),
          { onlyActivo: true }
        )
        return s > 0 ? s : null
      })()
      const kpiNames = kpis
        .filter((k) => k.activo)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        .map((k) => k.nombre)
      const oid = gap.owner_usuario
      const ownerLabel = oid ? userById.get(oid) ?? oid : null
      const kpiSemaforoCounts = kpiSemaforoByGapId.get(gap.id) ?? null

      const storyImpactRows =
        kpiWeightSum != null &&
        kpiWeightSum > 0 &&
        totalPoints > 0 &&
        forGap.length > 0
          ? forGap.map((a) => ({
              id: a.id,
              titulo: a.titulo_accion,
              storyPoints: accionStoryPoints(a),
              impactGlobalPct: computeStoryGlobalImpactPercent({
                kpiWeightSum,
                storiesInGap: forGap.length,
                storyPoints: accionStoryPoints(a),
                totalStoryPointsInGap: totalPoints,
              }),
            }))
          : undefined

      return {
        gap,
        donePoints,
        totalPoints,
        progressPct,
        gapKpiLink: gapKpiLinkById.get(gap.id) ?? null,
        kpiNames,
        kpiWeightSum,
        kpiSemaforoCounts,
        accionesCount,
        ownerLabel,
        noAccionesWarning: accionesCount === 0,
        storyImpactRows,
      }
    })
    if (import.meta.env.DEV && gaps.length > 0) {
      // eslint-disable-next-line no-console
      console.log('Gaps progreso recalculado', { gaps: gaps.length })
    }
    return out
  }, [
    gaps,
    acciones,
    junctionAccionIdsByGap,
    gapKpiLinkById,
    kpisByGapId,
    userById,
    kpiRows,
    kpiSemaforoByGapId,
  ])

  const [areaFilter, setAreaFilter] = useState<string>('all')
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<GapStatus | 'all'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('nombre')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const areaOptions = useMemo(() => {
    const set = new Set<string>()
    for (const g of gaps) {
      if (g.area) set.add(g.area)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es'))
  }, [gaps])

  const ownerOptions = useMemo(() => {
    const set = new Set<string>()
    for (const g of gaps) {
      if (g.owner_usuario) set.add(g.owner_usuario)
    }
    return [...set].sort((a, b) => (userById.get(a) ?? a).localeCompare(userById.get(b) ?? b))
  }, [gaps, userById])

  const filtered = useMemo(() => {
    return baseCards.filter((vm) => {
      const g = vm.gap
      if (areaFilter !== 'all' && (g.area ?? '') !== areaFilter) return false
      if (ownerFilter !== 'all' && (g.owner_usuario ?? '') !== ownerFilter) return false
      if (statusFilter !== 'all' && g.status !== statusFilter) return false
      return true
    })
  }, [baseCards, areaFilter, ownerFilter, statusFilter])

  const chainHeader = useMemo(() => ({
    cerrados: filtered.filter((vm) => vm.gapKpiLink?.estado === 'cerrado').length,
    enProgreso: filtered.filter((vm) => vm.gapKpiLink?.estado === 'en_progreso').length,
    ptsDone: filtered.reduce((sum, vm) => sum + (vm.donePoints ?? 0), 0),
    ptsTotal: filtered.reduce((sum, vm) => sum + (vm.totalPoints ?? 0), 0),
  }), [filtered])

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    const list = [...filtered]
    const statusRank = (s: GapStatus) =>
      s === 'open' ? 0 : s === 'in_progress' ? 1 : s === 'resolved' ? 2 : 3
    list.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'nombre':
          cmp = a.gap.nombre.localeCompare(b.gap.nombre, 'es')
          break
        case 'progress':
          cmp = a.progressPct - b.progressPct
          break
        case 'status':
          cmp = statusRank(a.gap.status) - statusRank(b.gap.status)
          break
        case 'prioridad': {
          const pa = a.gap.prioridad ?? ''
          const pb = b.gap.prioridad ?? ''
          cmp = pa.localeCompare(pb, 'es')
          break
        }
        default:
          cmp = 0
      }
      return cmp * dir
    })
    return list
  }, [filtered, sortKey, sortDir])

  const filteredSummary = useMemo(() => {
    let open = 0
    let inProgress = 0
    let resolved = 0
    let closed = 0

    for (const vm of filtered) {
      const st = vm.gap.status
      if (st === 'open') open += 1
      else if (st === 'in_progress') inProgress += 1
      else if (st === 'resolved') resolved += 1
      else if (st === 'closed') closed += 1
    }

    const avgProgress =
      filtered.length > 0
        ? filtered.reduce((acc, vm) => acc + (Number.isFinite(vm.progressPct) ? vm.progressPct : 0), 0) /
          filtered.length
        : 0

    return {
      total: filtered.length,
      open,
      inProgress,
      resolved,
      closed,
      avgProgress,
    }
  }, [filtered])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'nombre' || key === 'prioridad' ? 'asc' : 'desc')
    }
  }

  const SortButton = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      type="button"
      onClick={() => toggleSort(k)}
      className="inline-flex items-center gap-1 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
    >
      {label}
      {sortKey === k ? (
        sortDir === 'asc' ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      )}
    </button>
  )

  const loading = gapsLoading || kpisLoading || accionesLoading || gapKpiLinksLoading
  const hasActiveFilters = areaFilter !== 'all' || ownerFilter !== 'all' || statusFilter !== 'all'
  const avancePortafolio = chainHeader.ptsTotal > 0 ? chainHeader.ptsDone / chainHeader.ptsTotal : 0

  const moscowBudget = useMemo(() => moscowPointsBudget(TARGET_SPRINT_VELOCITY_POINTS), [])

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6">
      <header className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Brechas O2C</p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Gaps operativos</h1>
              <InfoHint text="Vista de brechas operativas con avance por story points, estado del gap y semáforo agregado de KPIs vinculados." />
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Brechas operativas con avance por story points en acciones (Hecho / Verificado), estado de la brecha y
              resumen de semáforo por KPIs de catálogo vinculados.
            </p>
            <details className="mt-3 max-w-3xl rounded-lg border border-border/60 bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
              <summary className="cursor-pointer list-none font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
                Metodología: story points, MoSCoW e impacto en score global
              </summary>
              <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
                <p>
                  <span className="font-medium text-foreground">Fibonacci ({FIBONACCI_STORY_POINTS.join(', ')}):</span>{' '}
                  escala de estimación relativa (complejidad + incertidumbre) por acción.
                </p>
                <p>
                  <span className="font-medium text-foreground">
                    MoSCoW y velocidad objetivo (~{TARGET_SPRINT_VELOCITY_POINTS} pts/sprint):
                  </span>{' '}
                  capacidad orientativa Must ~{moscowBudget.must} pts, Should ~{moscowBudget.should} pts, Could ~
                  {moscowBudget.could} pts (60% / 25% / 15%).
                </p>
                <p>
                  <span className="font-medium text-foreground">Impacto en score global:</span> (Σ peso KPI del
                  gap / nº acciones) × (pts de la acción / pts totales del gap). No sustituye al cumplimiento por
                  medición del KPI; es reparto analítico del peso del gap entre historias.
                </p>
              </div>
            </details>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-2 shadow-sm">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Visibles:</span>
              <span className="font-medium tabular-nums text-foreground">{filteredSummary.total}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-2 shadow-sm">
              <span className="text-muted-foreground">Cerrados:</span>
              <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {chainHeader.cerrados}
              </span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-2 shadow-sm">
              <span className="text-muted-foreground">Story pts:</span>
              <span className="font-medium tabular-nums text-foreground">
                {chainHeader.ptsDone} / {chainHeader.ptsTotal}
              </span>
            </div>
          </div>
        </div>
      </header>

      <section className="scroll-mt-4">
        <SectionCard>
          <SectionCardHeader
            title="Avance del portafolio"
            subtitle="Story points en estado Hecho / Verificado sobre el total del portafolio de gaps."
          />
          <SectionCardBody className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Progreso (Done)</span>
          <span className="tabular-nums font-medium text-foreground">
            {Math.round(avancePortafolio * 100)}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${Math.round(avancePortafolio * 100)}%` }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          {chainHeader.ptsDone} pts completados de {chainHeader.ptsTotal} totales
          {' · '}
          {chainHeader.cerrados} gap{chainHeader.cerrados !== 1 ? 's' : ''} cerrado{chainHeader.cerrados !== 1 ? 's' : ''}
          {' · '}
          {chainHeader.enProgreso} en progreso
        </p>
          </SectionCardBody>
        </SectionCard>
      </section>

      <section className="scroll-mt-4" aria-labelledby="gaps-filters-title">
        <SectionCard>
          <SectionCardHeader
            icon={Filter}
            titleId="gaps-filters-title"
            title="Filtros y orden"
            subtitle="Lista completa de brechas; el orden aplica por nombre, avance, estado o prioridad."
            action={
              <div className="flex flex-wrap items-center gap-2">
                <InfoHint text="Los filtros afectan la lista completa de brechas. El orden aplica por nombre, avance, estado o prioridad." />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAreaFilter('all')
                    setOwnerFilter('all')
                    setStatusFilter('all')
                  }}
                  disabled={!hasActiveFilters}
                >
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  Limpiar filtros
                </Button>
              </div>
            }
          />
          <SectionCardBody className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <div className="rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Brechas</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{filteredSummary.total}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Abiertas</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{filteredSummary.open}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">En curso</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
              {filteredSummary.inProgress}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Resueltas</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {filteredSummary.resolved}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cerradas</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{filteredSummary.closed}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Avance prom.</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
              {Number.isFinite(filteredSummary.avgProgress)
                ? `${Math.round(filteredSummary.avgProgress)}%`
                : '0%'}
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="gap-filter-area">Área</Label>
            <Select value={areaFilter} onValueChange={setAreaFilter}>
              <SelectTrigger id="gap-filter-area">
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
          <div className="space-y-2">
            <Label htmlFor="gap-filter-owner">Responsable</Label>
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger id="gap-filter-owner">
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
          <div className="space-y-2">
            <Label htmlFor="gap-filter-status">Estado del gap</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as GapStatus | 'all')}>
              <SelectTrigger id="gap-filter-status">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="open">Abierto</SelectItem>
                <SelectItem value="in_progress">En curso</SelectItem>
                <SelectItem value="resolved">Resuelto</SelectItem>
                <SelectItem value="closed">Cerrado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-end gap-3 lg:col-span-1">
            <span className="text-xs text-muted-foreground">Ordenar por:</span>
            <div className="flex flex-wrap gap-2">
              <SortButton k="nombre" label="Nombre" />
              <SortButton k="progress" label="Avance %" />
              <SortButton k="status" label="Estado" />
              <SortButton k="prioridad" label="Prioridad" />
            </div>
          </div>
        </div>
          </SectionCardBody>
        </SectionCard>
      </section>

      <section className="scroll-mt-4" aria-labelledby="gaps-list-title">
        <SectionCard>
          <SectionCardHeader
            icon={ListChecks}
            titleId="gaps-list-title"
            title={`Detalle de brechas (${sorted.length})`}
            subtitle="Avance por story points, KPIs vinculados y semáforo."
            action={
              <InfoHint text="Cada tarjeta muestra avance por story points, estado de la brecha, KPIs vinculados y resumen de semáforo." />
            }
          />
          <SectionCardBody>
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay gaps que coincidan con los filtros.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map((vm) => (
              <GapCard key={vm.gap.id} vm={vm} />
            ))}
          </div>
        )}
          </SectionCardBody>
        </SectionCard>
      </section>
    </div>
  )
}
