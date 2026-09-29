import { useState } from 'react'
import { OkrHistoryChart } from './OkrHistoryChart'
import { krProgress, type OkrData, type Objective } from './model'
import { measurementsFor } from './reporting'

export function OkrVisualOverview({
  data,
  objectives,
}: {
  data: OkrData
  objectives: Objective[]
}) {
  const ids = new Set(objectives.map((o) => o.id))
  const results = data.keyResults.filter((k) => ids.has(k.okr_id))
  const [selectedId, setSelectedId] = useState('')
  const selected =
    results.find((k) => k.id === selectedId) ??
    results.find((k) => data.checkIns.some((m) => m.key_result_id === k.id)) ??
    results[0]
  if (!results.length) return null
  const groups = [
    {
      label: 'Logrados',
      count: results.filter((k) => krProgress(k) >= 100).length,
      color: 'bg-emerald-500',
    },
    {
      label: 'En avance',
      count: results.filter((k) => krProgress(k) > 0 && krProgress(k) < 100)
        .length,
      color: 'bg-blue-500',
    },
    {
      label: 'Sin avance medido',
      count: results.filter((k) => krProgress(k) === 0).length,
      color: 'bg-slate-400',
    },
  ]
  return (
    <section
      className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
      aria-label="Panorama visual de resultados"
    >
      <div className="min-w-0 space-y-5 rounded-2xl border bg-card p-4 sm:p-5">
        <div>
          <h2 className="font-semibold">Panorama de resultados</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Distribución de los {results.length} KRs del alcance seleccionado
          </p>
        </div>
        <div
          className="flex h-4 overflow-hidden rounded-full bg-muted"
          aria-hidden="true"
        >
          {groups.map((g) => (
            <div
              key={g.label}
              className={g.color}
              style={{ width: `${(g.count / results.length) * 100}%` }}
            />
          ))}
        </div>
        <ul className="space-y-3">
          {groups.map((g) => (
            <li key={g.label} className="flex items-center gap-2 text-sm">
              <span
                className={`h-2.5 w-2.5 rounded-full ${g.color}`}
                aria-hidden="true"
              />
              <span className="flex-1">{g.label}</span>
              <strong className="tabular-nums">{g.count}</strong>
              <span className="w-12 text-right text-xs text-muted-foreground">
                {Math.round((g.count / results.length) * 100)}%
              </span>
            </li>
          ))}
        </ul>
        <div className="border-t pt-4">
          <label htmlFor="okr-evolution-kr" className="text-sm font-medium">
            Explorar evolución
          </label>
          <select
            id="okr-evolution-kr"
            className="mt-2 min-h-11 w-full min-w-0 rounded-lg border bg-background px-2 text-sm"
            value={selected.id}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {objectives.map((o) => (
              <optgroup key={o.id} label={o.nombre_okr}>
                {results
                  .filter((k) => k.okr_id === o.id)
                  .map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.title}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <p className="mt-2 break-words text-xs text-muted-foreground">
            {objectives.find((o) => o.id === selected.okr_id)?.nombre_okr}
          </p>
        </div>
      </div>
      <OkrHistoryChart
        key={selected.id}
        title={selected.title}
        measurements={measurementsFor(data.checkIns, selected.id)}
      />
    </section>
  )
}
