import { OkrHistoryChart } from './OkrHistoryChart'
import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ROUTES } from '@/constants'
import { okrService } from './service'
import { formatMetric, type Objective, type OkrData } from './model'
import {
  historicalProgress,
  measurementsFor,
  reportDate,
  reportTimestamp,
  type ReportEvent,
} from './reporting'

const input =
  'min-h-11 min-w-0 w-full rounded-lg border bg-background px-3 py-2 text-base sm:text-sm'
const labels: Record<string, string> = {
  title: 'Nombre',
  description: 'Descripción',
  baseline_value: 'Línea base',
  target_value: 'Meta',
  unit: 'Unidad',
  owner_user_id: 'Responsable',
  start_date: 'Inicio',
  end_date: 'Fin',
  activo: 'Disponibilidad',
  scope: 'Ámbito',
  area_id: 'Equipo',
}

function display(value: unknown, field: string, data: OkrData): string {
  if (value == null || value === '') return 'Sin definir'
  if (field === 'owner_user_id')
    return (
      data.users.find((u) => u.id === value)?.nombre ?? 'Usuario no disponible'
    )
  if (field === 'area_id')
    return (
      data.areas.find((a) => a.id === value)?.nombre ?? 'Equipo no disponible'
    )
  if (field === 'scope') return value === 'company' ? 'Empresa' : 'Equipo'
  if (field === 'activo') return value ? 'Habilitado' : 'Archivado'
  if (field === 'start_date' || field === 'end_date')
    return reportDate(String(value))
  return String(value)
}

function HistoryEntry({ event, data }: { event: ReportEvent; data: OkrData }) {
  const actor =
    data.users.find((u) => u.id === event.actor_id)?.nombre ??
    'Usuario no disponible'
  return (
    <li className="min-w-0 space-y-2 rounded-xl border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {event.kind === 'measurement'
            ? 'Medición'
            : event.details.event === 'created'
              ? 'Creación'
              : 'Cambio de configuración'}{' '}
          · {actor}
        </span>
        <time dateTime={event.created_at}>
          {reportTimestamp(event.created_at)}
        </time>
      </div>
      {event.kind === 'measurement' ? (
        <>
          <p className="break-words text-sm font-medium">
            {event.details.title_snapshot ?? event.details.current_title}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <strong className="text-lg">
              {formatMetric(event.details.value)}{' '}
              {event.details.unit_snapshot ?? ''}
            </strong>
            <span className="text-sm text-muted-foreground">
              {historicalProgress(event.details) == null
                ? 'Sin referencia histórica de meta'
                : `${Math.round(historicalProgress(event.details)!)}% en ese momento`}
            </span>
          </div>
          {event.details.target_snapshot != null &&
            event.details.baseline_snapshot != null && (
              <p className="text-xs text-muted-foreground">
                Base {formatMetric(event.details.baseline_snapshot!)} → Meta{' '}
                {formatMetric(event.details.target_snapshot)}{' '}
                {event.details.unit_snapshot}
              </p>
            )}
          {event.details.note && (
            <p className="whitespace-pre-wrap break-words text-sm">
              {event.details.note}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="break-words text-sm font-medium">
            {event.details.entity === 'objective' ? 'Objetivo' : 'KR'}:{' '}
            {String(event.details.after.title ?? '')}
          </p>
          <ul className="space-y-1 text-sm">
            {Object.keys(labels)
              .filter(
                (key) =>
                  event.details.after[key] !== undefined &&
                  event.details.before?.[key] !== event.details.after[key]
              )
              .map((key) => (
                <li key={key} className="break-words">
                  <span className="text-muted-foreground">{labels[key]}: </span>
                  {event.details.before && (
                    <>{display(event.details.before[key], key, data)} → </>
                  )}
                  {display(event.details.after[key], key, data)}
                </li>
              ))}
          </ul>
        </>
      )}
    </li>
  )
}

export function OkrReportHistory({
  objective,
  data,
  onClose,
  initialKrId,
}: {
  objective: Objective
  data: OkrData
  initialKrId?: string
  onClose: () => void
}) {
  const [krId, setKrId] = useState(
    initialKrId ??
      data.keyResults.find((k) => k.okr_id === objective.id)?.id ??
      'all'
  )
  const [kind, setKind] = useState('all')
  const query = useInfiniteQuery({
    queryKey: ['okr-report-history', objective.id],
    initialPageParam: null as { created_at: string; id: string } | null,
    queryFn: ({ pageParam }) => okrService.history(objective.id, pageParam),
    getNextPageParam: (page) => page.next,
  })
  const results = data.keyResults.filter((k) => k.okr_id === objective.id)
  const events =
    query.data?.pages
      .flatMap((p) => p.events)
      .filter(
        (e) =>
          (krId === 'all' || e.key_result_id === krId) &&
          (kind === 'all' || e.kind === kind)
      ) ?? []
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] min-w-0 flex flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-3xl [&_button]:min-h-11">
        <div className="shrink-0 space-y-2 border-b p-4 pr-14 sm:p-5 sm:pr-14">
          <DialogTitle className="pr-5">Evolución e historial</DialogTitle>
          <DialogDescription className="break-words pr-5">
            {objective.nombre_okr} · {reportDate(objective.start_date)} —{' '}
            {reportDate(objective.end_date)}
          </DialogDescription>
        </div>
        <div className="min-h-0 space-y-4 overflow-y-auto p-4 sm:p-5">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1 text-sm">
              Resultado clave
              <select
                value={krId}
                onChange={(e) => setKrId(e.target.value)}
                className={input}
              >
                <option value="all">Objetivo y todos sus KRs</option>
                {results.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-sm">
              Actividad
              <select
                className={input}
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="all">Toda la actividad</option>
                <option value="measurement">Mediciones</option>
                <option value="configuration">Cambios de configuración</option>
              </select>
            </label>
          </div>
          {krId !== 'all' ? (
            <OkrHistoryChart
              title={
                data.keyResults.find((item) => item.id === krId)?.title ??
                'Evolución del KR'
              }
              measurements={measurementsFor(data.checkIns, krId)}
              currentValue={
                data.keyResults.find((item) => item.id === krId)?.current_value
              }
              unit={data.keyResults.find((item) => item.id === krId)?.unit}
              baseline={
                data.keyResults.find((item) => item.id === krId)?.baseline_value
              }
              target={
                data.keyResults.find((item) => item.id === krId)?.target_value
              }
              periodStart={objective.start_date}
              periodEnd={objective.end_date}
              users={data.users}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Selecciona un KR para ver su gráfica. Abajo se muestran mediciones
              y cambios de todos los KRs y del objetivo.
            </p>
          )}
          {query.isPending && <p role="status">Cargando historial…</p>}
          {query.isError && (
            <div
              role="alert"
              className="space-y-2 rounded-lg border p-3 text-sm"
            >
              <p>
                No se pudo cargar el historial detallado. {query.error.message}
              </p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Reintentar
              </Button>
            </div>
          )}
          {query.isSuccess && (
            <>
              {!events.length && (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No hay eventos en los registros cargados para estos filtros.
                  {query.hasNextPage
                    ? ' Puedes cargar registros anteriores.'
                    : ''}
                </p>
              )}
              <ol className="space-y-3">
                {events.map((event) => (
                  <HistoryEntry
                    key={`${event.kind}:${event.id}`}
                    event={event}
                    data={data}
                  />
                ))}
              </ol>
              {query.hasNextPage && (
                <Button
                  disabled={query.isFetchingNextPage}
                  variant="outline"
                  onClick={() => void query.fetchNextPage()}
                >
                  {query.isFetchingNextPage
                    ? 'Cargando…'
                    : 'Cargar registros anteriores'}
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Los cambios de configuración se registran desde que se habilitó
                el historial. No se reconstruyen cambios anteriores ni se
                recalculan sus metas.
              </p>
            </>
          )}
          <Button asChild variant="outline">
            <Link onClick={onClose} to={`${ROUTES.OKRS}?objective=${objective.id}`}>
              Abrir objetivo para actualizarlo
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
