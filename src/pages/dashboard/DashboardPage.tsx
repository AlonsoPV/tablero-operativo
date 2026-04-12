/**
 * Dashboard ejecutivo: salud del portafolio, KPIs, cadena, prioridad, pulso por filtros y acciones del día.
 */

import { useMemo, useState, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  useAcciones,
  useCommentCounts,
  useChecklistProgressByAccionIds,
  AccionFormDialog,
  KanbanToolbar,
  metricasFromAcciones,
} from '@/features/operations'
import {
  CatalogKpiSemaforoGrid,
  ChainStatCard,
  GlobalScoreMdSpecPanel,
  useGapKpiLinks,
  useGlobalScoreEvolution,
  useImpactMatrix,
} from '@/features/kpi'
import { useUsers } from '@/features/users/hooks/useUsers'
import type { AccionDiaria } from '@/types'
import type { AccionesFilter } from '@/services/acciones.service'
import {
  dropdownOptionsByCatalogKeyQueryKey,
  fetchDropdownOptionsByCatalogKey,
} from '@/features/catalogs/hooks/useDropdownOptions'
import { DashboardHeader } from './components/DashboardHeader'
import { DashboardKpiCards } from './components/DashboardKpiCards'
import { DashboardActionsSection } from './components/DashboardActionsSection'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import { InfoHint } from '@/components/InfoHint'
import { Button } from '@/components/ui/button'
import { Activity, ChevronRight, LineChart, Target } from 'lucide-react'
import { todayCDMX } from '@/lib/dateUtils'
import { ROUTES } from '@/constants'

const DEFAULT_FILTER: AccionesFilter = {}

function ImpactTableSkeleton() {
  return (
    <div className="space-y-0" aria-busy="true" aria-label="Cargando prioridades">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex flex-wrap items-center gap-3 border-b border-border/35 py-3 last:border-b-0 sm:flex-nowrap"
        >
          <div className="h-4 min-w-0 flex-1 animate-pulse rounded bg-muted sm:max-w-[45%]" />
          <div className="h-4 w-28 animate-pulse rounded bg-muted" />
          <div className="h-4 w-10 animate-pulse rounded bg-muted sm:ml-auto" />
          <div className="h-4 w-14 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}

export function DashboardPage() {
  const qc = useQueryClient()
  const today = todayCDMX()
  const prefetchEvidenceCatalog = useCallback(async () => {
    await qc.prefetchQuery({
      queryKey: dropdownOptionsByCatalogKeyQueryKey('evidencia_esperada'),
      queryFn: () => fetchDropdownOptionsByCatalogKey('evidencia_esperada'),
    })
  }, [qc])

  useEffect(() => {
    void prefetchEvidenceCatalog()
  }, [prefetchEvidenceCatalog])

  const [filter, setFilter] = useState<AccionesFilter>(() => ({
    ...DEFAULT_FILTER,
    fecha_creacion: today,
  }))
  const [filtersExpanded, setFiltersExpanded] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAccion, setEditingAccion] = useState<AccionDiaria | null>(null)

  const { data: acciones = [], isLoading } = useAcciones(filter)
  const accionIds = useMemo(() => acciones.map((a) => a.id), [acciones])
  const { data: commentCounts = {} } = useCommentCounts(accionIds)
  const { data: checklistProgressByAccionId = {} } = useChecklistProgressByAccionIds(accionIds)
  const { data: users = [] } = useUsers({ activo: true })

  const metricas = useMemo(() => metricasFromAcciones(acciones), [acciones])

  const {
    isLoading: o2cScoreLoading,
    portfolioMetricItems: o2cPortfolioMetricItems,
    programMonthIndex,
    programStartConfigured,
    mdSpec,
  } = useGlobalScoreEvolution({ snapshotLimit: 60 })
  const { links, isLoading: gapLinksLoading } = useGapKpiLinks()
  const { rows: impactRows, isLoading: impactMatrixLoading } = useImpactMatrix()

  const responsableNames = useMemo(() => {
    const map: Record<string, string> = {}
    users.forEach((u) => {
      map[u.id] = u.nombre
    })
    return map
  }, [users])

  const chainSummary = useMemo(() => {
    const gapsCerrados = links.filter((l) => l.estado === 'cerrado').length
    const gapsEnProgreso = links.filter((l) => l.estado === 'en_progreso').length
    const gapsAbiertos = links.filter((l) => l.estado === 'abierto').length
    const ptsTotal = links.reduce((sum, l) => sum + l.totalPuntosGap, 0)
    const ptsDone = links.reduce((sum, l) => sum + l.puntosCompletados, 0)
    const avanceGlobal = ptsTotal > 0 ? ptsDone / ptsTotal : 0
    return { gapsCerrados, gapsEnProgreso, gapsAbiertos, avanceGlobal, ptsTotal, ptsDone }
  }, [links])

  const topPendientes = useMemo(
    () =>
      impactRows
        .filter((r) => r.estado !== 'Hecho' && r.estado !== 'Verificado')
        .slice(0, 5),
    [impactRows]
  )

  const handleFilterChange = useCallback((next: AccionesFilter | Partial<AccionesFilter>) => {
    setFilter((prev) => ({ ...prev, ...next }))
  }, [])

  const handleClearFilters = useCallback(() => {
    setFilter({ ...DEFAULT_FILTER, fecha_creacion: today })
  }, [today])

  const handleCreate = useCallback(() => {
    void prefetchEvidenceCatalog()
    setEditingAccion(null)
    setDialogOpen(true)
  }, [prefetchEvidenceCatalog])

  const handleSelectAccion = useCallback((accion: AccionDiaria) => {
    void prefetchEvidenceCatalog()
    setEditingAccion(accion)
    setDialogOpen(true)
  }, [prefetchEvidenceCatalog])

  const handleDialogSuccess = useCallback(() => {
    setEditingAccion(null)
  }, [])

  return (
    <div id="dashboard-page" className="dashboard-page min-h-0">
      <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6">
        <DashboardHeader
          filtersExpanded={filtersExpanded}
          onToggleFilters={() => setFiltersExpanded((v) => !v)}
          onNewAction={handleCreate}
        />

        <div id="dashboard-toolbar" className="dashboard-toolbar-wrapper -mt-2 sm:-mt-1">
          <KanbanToolbar
            filter={filter}
            onFilterChange={handleFilterChange}
            onClear={handleClearFilters}
            visible={filtersExpanded}
          />
        </div>

        <section
          id="dashboard-section-o2c-global"
          data-section="portfolio-health"
          className="scroll-mt-4"
        >
          <SectionCard>
            <SectionCardHeader
              icon={LineChart}
              title="Salud global del portafolio"
              subtitle="Score y semáforo según el documento KPIs (metas por mes de programa)."
            />
            <SectionCardBody>
              {o2cScoreLoading ? (
                <div
                  className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-border/50 bg-muted/10 px-4 py-8"
                  aria-busy="true"
                >
                  <p className="text-sm text-muted-foreground">Cargando salud del portafolio…</p>
                </div>
              ) : (
                <GlobalScoreMdSpecPanel
                  programMonthIndex={programMonthIndex}
                  programStartConfigured={programStartConfigured}
                  md={mdSpec}
                />
              )}
            </SectionCardBody>
          </SectionCard>
        </section>

        <section id="dashboard-section-semaforo" className="dashboard-section-semaforo scroll-mt-4">
          <SectionCard>
            <SectionCardHeader
              icon={Activity}
              eyebrow="Catálogo KPI"
              title="Semáforo por KPI"
              subtitle="Cumplimiento, estado y vínculos con acciones por indicador O2C."
            />
            <SectionCardBody className="dashboard-semaforo-content">
              {o2cScoreLoading ? (
                <div
                  className="flex min-h-[160px] items-center justify-center rounded-lg border border-dashed border-border/50 bg-muted/10 px-4 py-8"
                  aria-busy="true"
                >
                  <p className="text-sm text-muted-foreground">Cargando portafolio KPI…</p>
                </div>
              ) : (
                <CatalogKpiSemaforoGrid
                  metricItems={o2cPortfolioMetricItems}
                  isLoading={o2cScoreLoading}
                />
              )}
            </SectionCardBody>
          </SectionCard>
        </section>

        <section id="dashboard-section-chain" className="scroll-mt-4">
          <SectionCard>
            <SectionCardHeader
              eyebrow="Cadena estratégica"
              title="Story → Gap → KPI"
              subtitle="Avance del portafolio de brechas vinculadas al tablero."
            />
            <SectionCardBody>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                <ChainStatCard
                  label="Avance global"
                  value={`${Math.round(chainSummary.avanceGlobal * 100)}%`}
                  hint="Story points completados sobre el total del portafolio de gaps activos."
                  color="primary"
                  isLoading={gapLinksLoading}
                />
                <ChainStatCard
                  label="Gaps cerrados"
                  value={chainSummary.gapsCerrados}
                  hint="Gaps con backlog completado; el KPI asociado puede avanzar sin bloqueo de gap."
                  color="emerald"
                  isLoading={gapLinksLoading}
                />
                <ChainStatCard
                  label="En progreso"
                  value={chainSummary.gapsEnProgreso}
                  hint={`Abiertos sin cerrar: ${chainSummary.gapsAbiertos}`}
                  color="amber"
                  isLoading={gapLinksLoading}
                />
                <ChainStatCard
                  label="Story points"
                  value={`${chainSummary.ptsDone} / ${chainSummary.ptsTotal}`}
                  hint="Hecho sobre total ponderado en gaps."
                  color="muted"
                  isLoading={gapLinksLoading}
                />
              </div>
            </SectionCardBody>
          </SectionCard>
        </section>

        <section id="dashboard-section-top-impact" className="scroll-mt-4">
          <SectionCard>
            <SectionCardHeader
              eyebrow="Priorización"
              title="Mayor impacto pendiente"
              subtitle="Ordenadas por impacto; alinea ejecución con el tablero O2C."
              action={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <InfoHint text="Las cinco acciones abiertas con mayor aporte estimado según peso del KPI y story points del gap. Completarlas desbloquea avance en gap y KPI." />
                  <Button variant="outline" size="sm" className="border-border/60 bg-background/80" asChild>
                    <Link to={ROUTES.DASHBOARD_IMPACTO} className="gap-1">
                      Matriz de impacto
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              }
            />
            <SectionCardBody>
              {impactMatrixLoading || gapLinksLoading ? (
                <ImpactTableSkeleton />
              ) : topPendientes.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/5 px-6 py-12 text-center">
                  <Target className="mb-3 h-10 w-10 text-muted-foreground/35" aria-hidden />
                  <p className="text-sm font-medium text-foreground">Nada que priorizar por impacto</p>
                  <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
                    No hay acciones abiertas con impacto calculado, o el conjunto actual no produce ranking.
                    Revisa gaps y acciones en la matriz.
                  </p>
                  <Button variant="link" asChild className="mt-3 h-auto p-0 text-sm font-medium">
                    <Link to={ROUTES.DASHBOARD_IMPACTO}>Abrir matriz de impacto</Link>
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-1 px-1">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-border/50 text-left text-xs font-medium text-muted-foreground">
                        <th className="pb-3 pr-4 font-medium">Acción</th>
                        <th className="pb-3 pr-4 font-medium">Gap</th>
                        <th className="pb-3 pr-3 text-right font-medium">Pts</th>
                        <th className="pb-3 text-right font-medium">Impacto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topPendientes.map((row) => (
                        <tr
                          key={row.accionId}
                          className="border-b border-border/35 transition-colors last:border-0 hover:bg-muted/20"
                        >
                          <td className="py-3 pr-4 align-top font-medium leading-snug">{row.titulo}</td>
                          <td className="py-3 pr-4 align-top text-muted-foreground">{row.gapNombre ?? '—'}</td>
                          <td className="py-3 pr-3 align-top text-right tabular-nums text-muted-foreground">
                            {row.storyPoints ?? '—'}
                          </td>
                          <td className="py-3 align-top text-right tabular-nums font-semibold text-primary">
                            {row.impactoPct != null ? `${(row.impactoPct * 100).toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCardBody>
          </SectionCard>
        </section>

        <section id="dashboard-section-metrics" className="dashboard-section-metrics scroll-mt-4">
          <SectionCard>
            <SectionCardHeader
              eyebrow="Pulso operativo"
              title="Acciones según filtros"
              subtitle="Totales del día seleccionado y eficiencia (completadas / total)."
            />
            <SectionCardBody>
              <DashboardKpiCards metricas={metricas} isLoading={isLoading} />
            </SectionCardBody>
          </SectionCard>
        </section>

        <div id="dashboard-section-actions" className="dashboard-section-actions scroll-mt-4">
          <DashboardActionsSection
            acciones={acciones}
            isLoading={isLoading}
            commentCounts={commentCounts}
            responsableNames={responsableNames}
            checklistProgressByAccionId={checklistProgressByAccionId}
            onSelectAccion={handleSelectAccion}
            onNewAction={handleCreate}
          />
        </div>
      </div>

      <AccionFormDialog
        dialogId="dashboard-accion-dialog"
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        accion={editingAccion}
        defaultFecha={filter.fecha_creacion ?? today}
        onSuccess={handleDialogSuccess}
        responsableNames={responsableNames}
      />
    </div>
  )
}
